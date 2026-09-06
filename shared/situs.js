/*
  Penerap pengaturan situs untuk seluruh halaman publik.

  APA YANG DIKERJAKAN BERKAS INI

  Halaman /adminkafbe menulis satu dokumen Firestore, yaitu publik/situs.
  Berkas ini membacanya di sisi pengunjung lalu menerapkan tiga hal:

    1. Status seluruh situs. Jika "maintenance", isi halaman diganti layar
       pemeliharaan.
    2. Status tiap fitur. Kartu ber-atribut data-fitur mendapat lencana sesuai
       statusnya, dan tombolnya disembunyikan jika fiturnya sedang tidak
       aktif. Halaman ber-atribut data-fitur-halaman ikut tertutup.
    3. Naskah pengganti. Elemen ber-atribut data-teks isinya ditimpa nilai dari
       admin, lengkap dengan versi bahasa Inggrisnya.
    4. Elemen bersama. Kepala navigasi, penutup halaman, dan saklar bahasa bisa
       dimatikan untuk seluruh situs sekaligus.

  KENAPA TEKS ASLINYA TETAP DITULIS DI HTML

  Supaya halaman tetap utuh tanpa JavaScript, tanpa jaringan, dan saat
  Firestore sedang bermasalah. Nilai dari admin hanya menimpa yang sudah ada,
  tidak pernah menjadi satu-satunya sumber. Jika berkas ini gagal berjalan,
  pengunjung melihat situs versi bawaan, bukan halaman kosong.

  CARA MENAMBAH TEKS YANG BISA DIUBAH ADMIN

  Cukup tambahkan atribut pada elemennya di HTML:

      <h2 data-teks="beranda.judul" data-label="Judul utama">Halo</h2>

  Tidak ada daftar yang perlu diperbarui di tempat lain. Halaman /adminkafbe
  menemukan sendiri elemen bertanda ini dengan membaca berkas HTML-nya, jadi
  naskah bawaan di HTML dan yang tampil di panel admin tidak akan berbeda.
*/
(function(){
  'use strict';

  var KUNCI_SIMPAN = 'kafbe_situs';
  var KUNCI_ELEMEN = 'kafbe_elemen';

  /* ---------- Lencana status ---------- */

  var LENCANA = {
    aktif:        { kelas: 'badge-live',  id: 'Aktif',              en: 'Active' },
    pengembangan: { kelas: 'badge-soon',  id: 'Dalam Pengembangan', en: 'In Development' },
    maintenance:  { kelas: 'badge-maint', id: 'Pemeliharaan',       en: 'Under Maintenance' }
  };

  function statusSah(s){
    return (s === 'aktif' || s === 'pengembangan' || s === 'maintenance') ? s : 'aktif';
  }

  function pilihBahasa(teksId, teksEn){
    var inggris = window.KafbeBahasa && window.KafbeBahasa.inggris();
    return (inggris && teksEn) ? teksEn : teksId;
  }

  /*
    Pembersih HTML seadanya.

    Naskah di sini ditulis admin, bukan pengunjung, dan aturan Firestore sudah
    membatasi siapa yang boleh menulisnya. Meski begitu isinya tetap disaring:
    jika suatu hari akun admin diambil alih, kerusakan yang bisa ditanam lewat
    naskah situs jadi terbatas pada penebalan dan miring, bukan skrip.

    Hanya lima tag yang dibiarkan lewat, tanpa atribut apa pun.
  */
  var TAG_BOLEH = ['b', 'i', 'em', 'strong', 'br'];

  function bersihkan(html){
    var kotak = document.createElement('div');
    kotak.textContent = String(html == null ? '' : html);
    var aman = kotak.innerHTML;

    TAG_BOLEH.forEach(function(tag){
      aman = aman
        .replace(new RegExp('&lt;' + tag + '&gt;', 'gi'), '<' + tag + '>')
        .replace(new RegExp('&lt;/' + tag + '&gt;', 'gi'), '</' + tag + '>')
        .replace(new RegExp('&lt;' + tag + '\\s*/&gt;', 'gi'), '<' + tag + '>');
    });

    return aman;
  }

  /* ---------- 1. Layar pemeliharaan ---------- */

  /*
    Jika kunjungan sebelumnya menemukan situs sedang dipelihara, isi halaman
    disembunyikan lebih dulu sebelum sempat tergambar. Tanpa ini pengunjung
    sempat melihat halaman biasa sekejap lalu berganti, dan kedipan itu justru
    terlihat seperti situsnya rusak.

    Nilai simpanan hanya digunakan untuk menghindari kedipan. Yang menentukan
    tetap jawaban Firestore yang selalu diambil ulang di bawah.
  */
  function statusTersimpan(){
    try { return localStorage.getItem(KUNCI_SIMPAN); } catch(e){ return null; }
  }
  function simpanStatus(s){
    try { localStorage.setItem(KUNCI_SIMPAN, s); } catch(e){}
  }

  if(statusTersimpan() === 'maintenance'){
    document.documentElement.classList.add('situs-menunggu');
  }

  function bukaTirai(){
    document.documentElement.classList.remove('situs-menunggu');
  }

  function layarPemeliharaan(pesan){
    var judul = pilihBahasa(
      (pesan && pesan.judul) || 'Situs sedang dalam pemeliharaan',
      (pesan && pesan.judulEn) || 'The site is under maintenance'
    );
    var isi = pilihBahasa(
      (pesan && pesan.isi) || 'KAFBE Hub sedang diperbarui. Silakan kembali beberapa saat lagi.',
      (pesan && pesan.isiEn) || 'KAFBE Hub is being updated. Please check back shortly.'
    );

    document.body.innerHTML =
      '<div class="situs-tutup">' +
        '<div class="situs-tutup-kartu">' +
          '<svg viewBox="0 0 300 300" class="situs-tutup-owl"><use href="#kafbe-owl"/></svg>' +
          '<h1>' + bersihkan(judul) + '</h1>' +
          '<p>' + bersihkan(isi) + '</p>' +
        '</div>' +
      '</div>' + lambangOwl();

    document.body.classList.add('situs-body-tutup');
    bukaTirai();
  }

  /*
    Lambang burung hantu untuk layar penutup.

    Isi <body> diganti seluruhnya saat layar penutup dipasang, dan
    <symbol id="kafbe-owl"> milik halaman ikut terhapus bersamanya. Jadi
    lambangnya harus dipasang kembali.

    Yang dipasang adalah SALINAN LAMBANG ASLI yang diambil dari halaman itu
    sendiri, bukan gambar tiruan yang ditulis ulang di sini.

    Sebelumnya berkas ini memuat tiruannya, dan tiruannya kurang lengkap:
    sayap, garis bulu di dada, dan kakinya hilang, sehingga burung hantunya
    tampil separuh jadi. Menyalin ulang gambar yang sudah ada di tempat lain
    memang selalu berakhir begitu, cepat atau lambat, karena yang satu berubah
    dan yang satunya tertinggal.

    Pemanggilannya aman meski isi <body> sedang diganti, sebab ruas kanan
    sebuah penugasan dihitung lebih dulu sebelum hasilnya dipasang, jadi
    lambang aslinya masih ada saat fungsi ini membacanya.
  */
  function lambangOwl(){
    var simbol = document.getElementById('kafbe-owl');
    if(simbol){
      return '<svg width="0" height="0" style="position:absolute">'
        + simbol.outerHTML + '</svg>';
    }

    // Hanya terpakai jika halamannya memang tidak punya lambang sama sekali.
    // Layar penutup tetap tampil utuh, hanya tanpa gambar.
    return '';
  }

  /* ---------- 1B. Elemen bersama ---------- */

  /*
    Tiga bagian yang digunakan semua halaman sekaligus: kepala navigasi, penutup
    halaman, dan saklar bahasa Indonesia dan Inggris. Ketiganya dimatikan lewat
    kelas pada elemen <html>, bukan dengan menghapus elemennya, supaya bisa
    kembali muncul begitu dinyalakan lagi dari halaman admin.

    Kelasnya dipasang sedini mungkin menggunakan nilai simpanan kunjungan
    sebelumnya, sama seperti layar pemeliharaan. Tanpa itu kepala navigasi
    sempat tergambar lalu hilang, dan kedipan itu terlihat seperti halaman yang
    rusak.
  */
  var ELEMEN = [
    { kunci: 'header', kelas: 'situs-tanpa-header' },
    { kunci: 'footer', kelas: 'situs-tanpa-footer' },
    { kunci: 'bahasa', kelas: 'situs-tanpa-bahasa' }
  ];

  function elemenTersimpan(){
    try { return JSON.parse(localStorage.getItem(KUNCI_ELEMEN)) || {}; }
    catch(e){ return {}; }
  }
  function simpanElemen(nilai){
    try { localStorage.setItem(KUNCI_ELEMEN, JSON.stringify(nilai)); } catch(e){}
  }

  function terapkanElemen(el){
    el = el || {};
    var rekam = {};

    for(var i = 0; i < ELEMEN.length; i++){
      // Yang tidak disebut berarti menyala. Jadi situs yang belum pernah
      // menyentuh pengaturan ini tampil utuh seperti biasa.
      var mati = (el[ELEMEN[i].kunci] === false);
      document.documentElement.classList.toggle(ELEMEN[i].kelas, mati);
      rekam[ELEMEN[i].kunci] = !mati;
    }

    /*
      Saklar bahasa yang dimatikan sementara pilihan terakhir pengunjung adalah
      Inggris akan mengunci halamannya berbahasa Inggris tanpa satu pun tombol
      untuk kembali. Karena itu bahasanya dikembalikan ke Indonesia.
    */
    if(!rekam.bahasa && window.KafbeBahasa && window.KafbeBahasa.inggris()){
      window.KafbeBahasa.ganti('id');
    }

    return rekam;
  }

  terapkanElemen(elemenTersimpan());

  /* ---------- 2. Status fitur ---------- */

  /*
    Status bawaan sebuah kartu, dibaca dari lencana yang sudah tertulis di
    HTML. Dipakai saat Firestore tidak punya catatan untuk kunci fitur ini,
    misalnya kartu yang baru ditambahkan dan belum pernah disentuh admin.

    Tanpa ini, kartu semacam itu selalu dianggap "aktif" oleh statusSah
    walau lencana aslinya menulis "Dalam Pengembangan", sehingga lencananya
    berubah jadi Aktif padahal naskahnya masih menyebut belum jadi.
  */
  function statusBawaan(el){
    var b = el.querySelector('.badge');
    if(!b) return 'aktif';
    if(b.classList.contains('badge-maint')) return 'maintenance';
    if(b.classList.contains('badge-soon'))  return 'pengembangan';
    return 'aktif';
  }

  function terapkanFitur(fitur){
    var kartu = document.querySelectorAll('[data-fitur]');

    for(var i = 0; i < kartu.length; i++){
      var el = kartu[i];
      var catatan = fitur[el.dataset.fitur];
      var s = (catatan && catatan.status) ? statusSah(catatan.status) : statusBawaan(el);
      var l = LENCANA[s];

      var lencana = el.querySelector('.badge');
      if(lencana){
        lencana.className = 'badge ' + l.kelas;
        lencana.dataset.en = l.en;
        lencana.dataset.asli = l.id;
        lencana.innerHTML = pilihBahasa(l.id, l.en);
      }

      // Tombolnya disembunyikan, bukan dihapus, supaya kembali muncul begitu
      // statusnya dikembalikan tanpa perlu memuat ulang halaman.
      var tombol = el.querySelectorAll('a.btn');
      for(var t = 0; t < tombol.length; t++){
        tombol[t].hidden = (s !== 'aktif');
      }

      el.classList.toggle('fitur-tidak-aktif', s !== 'aktif');
    }

    // Menu yang mengarah ke fitur non-aktif ikut diredupkan, supaya pengunjung
    // tidak diantar ke halaman yang ujungnya menolak membuka diri.
    var menu = document.querySelectorAll('.nav .links a[data-fitur-tautan]');
    for(var m = 0; m < menu.length; m++){
      var sm = statusSah(fitur[menu[m].dataset.fiturTautan] && fitur[menu[m].dataset.fiturTautan].status);
      menu[m].classList.toggle('nav-tidak-aktif', sm !== 'aktif');
    }
  }

  /*
    Sebuah halaman boleh menyebut lebih dari satu kunci, dipisah spasi:

        <body data-fitur-halaman="materi-mo materi-mo-crashing">

    Halaman topik memang bergantung pada dua hal sekaligus. Mematikan seluruh
    mata kuliahnya harus ikut menutup topiknya, dan mematikan satu topik saja
    tidak boleh menutup mata kuliahnya. Yang digunakan adalah status paling
    membatasi di antara semuanya, sebab satu saja yang belum siap sudah cukup
    membuat halaman itu belum layak dibuka.
  */
  function statusHalaman(fitur, daftar){
    var hasil = 'aktif';
    for(var i = 0; i < daftar.length; i++){
      var s = statusSah(fitur[daftar[i]] && fitur[daftar[i]].status);
      if(s === 'maintenance') return 'maintenance';
      if(s === 'pengembangan') hasil = 'pengembangan';
    }
    return hasil;
  }

  function tutupHalamanFitur(fitur){
    var kunci = document.body.dataset.fiturHalaman;
    if(!kunci) return false;

    var s = statusHalaman(fitur, kunci.split(/\s+/).filter(Boolean));
    if(s === 'aktif') return false;

    var judul = (s === 'maintenance')
      ? pilihBahasa('Halaman ini sedang dalam pemeliharaan', 'This page is under maintenance')
      : pilihBahasa('Halaman ini sedang dikerjakan', 'This page is still being built');

    var isi = (s === 'maintenance')
      ? pilihBahasa('Silakan kembali beberapa saat lagi.', 'Please check back shortly.')
      : pilihBahasa('Isinya akan tersedia setelah selesai disiapkan.', 'It will be available once it is ready.');

    document.body.innerHTML =
      '<div class="situs-tutup">' +
        '<div class="situs-tutup-kartu">' +
          '<svg viewBox="0 0 300 300" class="situs-tutup-owl"><use href="#kafbe-owl"/></svg>' +
          '<h1>' + judul + '</h1>' +
          '<p>' + isi + '</p>' +
          '<a class="btn btn-primary" href="/index.html">' +
            pilihBahasa('Kembali ke Beranda', 'Back to Home') +
          '</a>' +
        '</div>' +
      '</div>' + lambangOwl();

    document.body.classList.add('situs-body-tutup');
    bukaTirai();
    return true;
  }

  /* ---------- 3. Urutan kartu ---------- */

  /*
    Kisi kartu yang boleh diatur urutannya ditandai data-urutan di HTML, dan
    tiap kartunya dikenali lewat data-fitur.

    Kuncinya ditulis eksplisit di HTML, bukan disimpulkan dari nama halaman
    atau nama bagian. Nama bagian seperti "Kepala Halaman" digunakan berulang di
    banyak halaman, jadi menyimpulkan kunci dari situ akan membuat urutan satu
    halaman merembet ke halaman lain suatu hari nanti.

    Kartu yang kuncinya tidak disebut dalam daftar urutan tidak dibuang, hanya
    diletakkan di belakang dengan urutan aslinya. Jadi menambah kartu baru di HTML
    tetap aman meski daftar urutannya belum diperbarui.
  */
  function terapkanUrutan(urutan){
    var kisi = document.querySelectorAll('[data-urutan]');

    for(var i = 0; i < kisi.length; i++){
      var daftar = urutan[kisi[i].dataset.urutan];
      if(!daftar || !daftar.length) continue;

      var anak = Array.prototype.slice.call(kisi[i].children);
      var pesanan = [];
      var sisa = [];

      for(var j = 0; j < anak.length; j++){
        var kunci = anak[j].dataset ? anak[j].dataset.fitur : undefined;
        var urut = (kunci === undefined) ? -1 : daftar.indexOf(kunci);
        if(urut >= 0) pesanan.push({ el: anak[j], urut: urut });
        else sisa.push(anak[j]);
      }

      pesanan.sort(function(a, b){ return a.urut - b.urut; });

      for(var k = 0; k < pesanan.length; k++) kisi[i].appendChild(pesanan[k].el);
      for(var m = 0; m < sisa.length; m++) kisi[i].appendChild(sisa[m]);
    }
  }

  /* ---------- 4. Naskah pengganti ---------- */

  /*
    Nilai admin dipasang lewat data-asli dan data-en, lalu pengalih bahasa
    dijalankan ulang. Jadi hanya ada satu mekanisme yang benar-benar menukar
    isi elemen, dan naskah dari admin ikut berganti bahasa persis seperti
    naskah bawaan tanpa penanganan tersendiri.
  */
  function terapkanTeks(teks){
    var daftar = document.querySelectorAll('[data-teks]');

    for(var i = 0; i < daftar.length; i++){
      var el = daftar[i];
      var isi = teks[el.dataset.teks];
      if(!isi) continue;

      if(el.dataset.asli === undefined) el.dataset.asli = el.innerHTML;

      if(typeof isi.id === 'string' && isi.id.trim() !== ''){
        el.dataset.asli = bersihkan(isi.id);
      }
      if(typeof isi.en === 'string' && isi.en.trim() !== ''){
        el.dataset.en = bersihkan(isi.en);
      }
    }

    if(window.KafbeBahasa) window.KafbeBahasa.terapkan();
  }

  /* ---------- Perakitan ---------- */

  function terapkanSemua(cfg){
    if(!cfg) return;

    simpanElemen(terapkanElemen(cfg.elemen));

    if(statusSah(cfg.statusSitus) === 'maintenance'){
      simpanStatus('maintenance');
      layarPemeliharaan(cfg.pesanMaintenance);
      return;
    }

    simpanStatus('aktif');
    var fitur = cfg.fitur || {};

    if(tutupHalamanFitur(fitur)) return;

    terapkanUrutan(cfg.urutan || {});
    terapkanFitur(fitur);
    terapkanTeks(cfg.teks || {});
    bukaTirai();
  }

  /*
    Dibuka supaya isi pengaturan bisa dicoba langsung dari Console peramban
    tanpa perlu benar-benar menutup situs untuk semua orang:

        KafbeSitus.terapkan({ statusSitus: 'maintenance' })
        KafbeSitus.terapkan({ fitur: { jadwal: { status: 'maintenance' } } })

    Efeknya hanya di layar yang memanggilnya dan hilang begitu halaman dimuat
    ulang. Ini bukan lubang keamanan: seluruh isi situs memang terbuka untuk
    umum, dan status pemeliharaan adalah pemberitahuan, bukan penguncian data.
    Yang menjaga data tetap aturan Firestore.
  */
  window.KafbeSitus = { terapkan: terapkanSemua };

  function siap(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn);
    }else{
      fn();
    }
  }

  (async function(){
    var cfg = null;
    try{
      var c = window.KAFBE_FIREBASE_CONFIG;
      if(!c || !c.apiKey) throw new Error('konfigurasi Firebase tidak ada');

      var SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
      var app = await import(SDK + '/firebase-app.js');
      var fs  = await import(SDK + '/firebase-firestore.js');

      var snap = await fs.getDoc(fs.doc(fs.getFirestore(app.initializeApp(c)), 'publik', 'situs'));
      if(snap.exists()) cfg = snap.data();
    }catch(err){
      /*
        Sengaja gagal tanpa suara. Situs harus tetap bisa dibaca meskipun
        Firestore tidak terjangkau, jadi kegagalan di sini berarti pengunjung
        melihat versi bawaan halaman, bukan pesan galat.
      */
      console.warn('Pengaturan situs tidak bisa dimuat, menggunakan bawaan halaman.', err);
    }

    siap(function(){
      if(cfg){
        terapkanSemua(cfg);
      }else{
        // Tidak ada jawaban dari Firestore. Jika tirai sempat dipasang karena
        // kunjungan sebelumnya, tirainya dibuka supaya halaman tidak terkunci
        // kosong hanya karena jaringan sedang buruk.
        simpanStatus('aktif');
        bukaTirai();
      }
    });
  })();

  /*
    CATATAN, JANGAN DIKEMBALIKAN:

    Di sini sempat ada penangan "bahasaberubah" yang memanggil location.reload()
    supaya layar pemeliharaan ikut berganti bahasa. Itu berbahaya. Peristiwa
    "bahasaberubah" juga dipancarkan oleh KafbeBahasa.terapkan() yang berjalan
    sendiri saat halaman selesai dimuat, jadi begitu layar pemeliharaan
    terpasang lebih dulu, halaman akan memuat ulang, memasang layarnya lagi,
    lalu memuat ulang lagi, tanpa henti.

    Tidak diperlukan juga: layar pemeliharaan mengganti seluruh isi <body>,
    termasuk saklar bahasanya, jadi tidak ada lagi yang bisa menukar bahasa di
    layar itu. Bahasanya sudah ditentukan dari pilihan tersimpan saat layarnya
    dirakit, dan itu memang yang benar.
  */
})();
