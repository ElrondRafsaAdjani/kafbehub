/*
  Penerap naskah materi untuk halaman visualisasi.

  APA YANG DIKERJAKAN BERKAS INI

  Halaman /pengajar menulis satu dokumen Firestore per topik, yaitu
  materi/{kunci}, dengan kunci diambil dari nama berkas halamannya. Berkas ini
  membacanya di sisi pengunjung lalu menimpa tiga macam naskah:

    1. Naskah di HTML. Elemen ber-atribut data-materi isinya diganti.
    2. Naskah tiap langkah. Halaman yang bercerita langkah demi langkah
       mendaftarkan larik langkahnya lewat KafbeMateri.daftarLangkah.
    3. Peta naskah lain. Kumpulan kalimat yang disimpan sebagai objek, misalnya
       narasi proses, didaftarkan lewat KafbeMateri.daftarPeta.

  YANG SENGAJA TIDAK BISA DIUBAH

  Gambar, grafik, dan angka model tetap milik halaman. Pengajar mengubah
  kalimatnya, bukan cara halaman menggambar. Karena itu yang ditimpa hanya
  medan bertipe teks yang didaftarkan, dan sisa isi objek langkah dibiarkan.

  KENAPA NASKAH ASLINYA TETAP DITULIS DI HALAMAN

  Supaya halaman tetap utuh tanpa jaringan dan saat Firestore bermasalah. Nilai
  dari pengajar hanya menimpa yang sudah ada, tidak pernah menjadi satu-satunya
  sumber. Jika berkas ini gagal berjalan, mahasiswa melihat materi versi
  bawaan halaman, bukan halaman kosong.

  CARA MENAMBAH NASKAH YANG BISA DIUBAH PENGAJAR

  Untuk naskah di HTML, cukup tambahkan atribut pada elemennya:

      <p data-materi="pengantar.1" data-label="Kalimat pembuka">Halo</p>

  Untuk naskah di dalam skrip halaman, daftarkan lariknya sesudah larik itu
  dibuat dan sebelum gambar pertama dibuat:

      KafbeMateri.daftarLangkah(LANGKAH, { label:'Langkah' }, tampilkan);

  Tidak ada daftar yang perlu diperbarui di tempat lain. Halaman /pengajar
  membaca naskah bawaannya langsung dari halaman ini, jadi yang tampil di panel
  pengajar tidak akan berbeda dengan yang tampil di halaman aslinya.
*/
(function(){
  'use strict';

  /* ---------- Kunci halaman ---------- */

  /*
    Kunci diambil dari nama berkas halamannya, misalnya
    /materi/pemi-elastisitas.html menjadi "pemi-elastisitas".

    Diambil dari alamat, bukan dari atribut di <body>, supaya berkas ini sudah
    tahu kuncinya sejak dimuat di <head> dan bisa menggunakan simpanan kunjungan
    sebelumnya sebelum isi halaman tergambar.
  */
  function kunciHalaman(){
    var nama = String(location.pathname || '').split('/').pop() || '';
    return nama.replace(/\.html?$/i, '');
  }

  var KUNCI = kunciHalaman();
  var KUNCI_SIMPAN = 'kafbe_materi_' + KUNCI;

  /* ---------- Pembersih HTML ---------- */

  /*
    Naskah di sini ditulis pengajar, bukan pengunjung, dan aturan Firestore
    sudah membatasi siapa yang boleh menulisnya. Meski begitu isinya tetap
    disaring, karena naskah materi memang boleh memuat markup, dan markup yang
    diterima mentah-mentah adalah jalan masuk yang paling sering terlewat.

    Jika suatu hari akun pengajar diambil alih, kerusakan yang bisa ditanam
    lewat naskah terbatas pada tulisan yang berantakan, bukan skrip yang
    berjalan di peramban mahasiswa.

    Yang dibuang: seluruh tag di luar daftar, seluruh atribut di luar daftar,
    dan alamat tautan yang skemanya bukan http, https, atau mailto.
  */
  var TAG_BOLEH = {
    A:1, B:1, BLOCKQUOTE:1, BR:1, CODE:1, DIV:1, EM:1, H3:1, H4:1, H5:1, H6:1,
    HR:1, I:1, LI:1, OL:1, P:1, PRE:1, S:1, SMALL:1, SPAN:1, STRONG:1, SUB:1,
    SUP:1, TABLE:1, TBODY:1, TD:1, TFOOT:1, TH:1, THEAD:1, TR:1, U:1, UL:1
  };

  /*
    Tag yang dibuang berikut seluruh isinya, bukan sekadar dilepas bungkusnya.

    Untuk tag biasa, melepas bungkus dan menyisakan kalimatnya adalah pilihan
    yang benar: pengajar yang menggunakan tag terlarang tidak kehilangan tulisannya.
    Untuk yang di bawah ini justru sebaliknya, sebab isinya memang bukan
    kalimat. Menyisakan isi <script> hanya membuat baris kode muncul sebagai
    tulisan di tengah materi, dan itu terlihat seperti halamannya rusak.
  */
  var BUANG_ISINYA = {
    SCRIPT:1, STYLE:1, TEMPLATE:1, IFRAME:1, OBJECT:1, EMBED:1, SVG:1,
    NOSCRIPT:1, FORM:1, INPUT:1, BUTTON:1, SELECT:1, TEXTAREA:1
  };

  var ATRIBUT_BOLEH = {
    'class':   function(){ return true; },
    'href':    function(el){ return el.tagName === 'A'; },
    'target':  function(el){ return el.tagName === 'A'; },
    'rel':     function(el){ return el.tagName === 'A'; },
    'colspan': function(el){ return el.tagName === 'TD' || el.tagName === 'TH'; },
    'rowspan': function(el){ return el.tagName === 'TD' || el.tagName === 'TH'; }
  };

  function alamatAman(nilai){
    var v = String(nilai || '').trim();
    // Tautan relatif dan jangkar dibiarkan. Yang bermasalah selalu yang
    // menyebut skemanya sendiri, misalnya javascript: dan data:.
    if(!/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
    return /^(https?|mailto):/i.test(v) ? v : '';
  }

  function bersihkanSimpul(induk){
    var anak = Array.prototype.slice.call(induk.childNodes);

    for(var i = 0; i < anak.length; i++){
      var n = anak[i];

      if(n.nodeType === 3) continue;            // teks biasa, aman
      if(n.nodeType !== 1){                     // komentar dan lainnya dibuang
        induk.removeChild(n);
        continue;
      }

      if(BUANG_ISINYA[n.tagName]){
        induk.removeChild(n);
        continue;
      }

      if(!TAG_BOLEH[n.tagName]){
        // Tagnya dibuang, isinya dipertahankan. Jadi pengajar yang tidak
        // sengaja menggunakan tag terlarang tetap tidak kehilangan kalimatnya.
        bersihkanSimpul(n);
        while(n.firstChild) induk.insertBefore(n.firstChild, n);
        induk.removeChild(n);
        continue;
      }

      var atr = Array.prototype.slice.call(n.attributes);
      for(var a = 0; a < atr.length; a++){
        var nama = atr[a].name.toLowerCase();
        var izin = ATRIBUT_BOLEH[nama];
        if(!izin || !izin(n)){ n.removeAttribute(atr[a].name); continue; }
        if(nama === 'href'){
          var bersih = alamatAman(atr[a].value);
          if(bersih) n.setAttribute('href', bersih);
          else n.removeAttribute('href');
        }
      }

      // Tautan yang membuka jendela baru selalu diberi rel pengaman, sesuai
      // aturan yang berlaku untuk seluruh situs.
      if(n.tagName === 'A' && n.getAttribute('target')){
        n.setAttribute('target', '_blank');
        n.setAttribute('rel', 'noopener noreferrer');
      }

      bersihkanSimpul(n);
    }
  }

  function bersihkan(html){
    /*
      Isinya dirakit di dokumen terpisah, bukan di dokumen halaman ini.
      Dokumen hasil createHTMLDocument tidak menjalankan skrip dan tidak
      memuat apa pun, jadi naskah yang bermasalah sudah kehilangan taringnya
      bahkan sebelum sempat diperiksa.
    */
    var dok = document.implementation.createHTMLDocument('');
    dok.body.innerHTML = String(html == null ? '' : html);
    bersihkanSimpul(dok.body);
    return dok.body.innerHTML;
  }

  /* ---------- Simpanan naskah ---------- */

  /*
    Jawaban Firestore disimpan di peramban supaya kunjungan berikutnya sudah
    menggunakan naskah pengajar sejak gambar pertama. Tanpa ini halaman sempat
    menampilkan naskah bawaan sekejap lalu berganti, dan kedipan itu terlihat
    seperti halamannya salah memuat.

    Simpanan hanya untuk menghindari kedipan. Yang menentukan tetap jawaban
    Firestore yang selalu diambil ulang.
  */
  function bacaSimpanan(){
    try{ return JSON.parse(localStorage.getItem(KUNCI_SIMPAN)) || null; }
    catch(e){ return null; }
  }
  function tulisSimpanan(isi){
    try{ localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(isi)); }catch(e){}
  }

  var naskahKini = bacaSimpanan() || { naskah:{}, langkah:{}, peta:{} };

  /* ---------- Naskah bawaan halaman ---------- */

  /*
    Naskah asli halaman direkam sebelum ditimpa, dan tidak pernah direkam dua
    kali. Ini yang membuat naskah bisa dikembalikan ke bawaan, dan yang dibaca
    halaman /pengajar untuk menampilkan naskah asal di sebelah kotak isian.
  */
  var bawaan = { naskah:{}, langkah:{}, peta:{} };
  var label  = { naskah:{}, langkah:{}, peta:{} };

  var daftarLarik = [];   // { larik, medan, label, awalan }
  var daftarObjek = [];   // { nama, objek, label }
  var gambarUlang = [];   // fungsi menggambar ulang milik halaman

  function catatGambarUlang(fn){
    if(typeof fn === 'function' && gambarUlang.indexOf(fn) < 0) gambarUlang.push(fn);
  }

  function pakaiAtauBawaan(isi, asal){
    return (typeof isi === 'string' && isi.trim() !== '') ? bersihkan(isi) : asal;
  }

  /* ---------- 1. Naskah di HTML ---------- */

  function terapkanNaskah(){
    var daftar = document.querySelectorAll('[data-materi]');

    for(var i = 0; i < daftar.length; i++){
      var el = daftar[i];
      var k  = el.dataset.materi;

      if(bawaan.naskah[k] === undefined){
        bawaan.naskah[k] = el.innerHTML;
        label.naskah[k]  = el.dataset.label || '';
      }

      var pakai = pakaiAtauBawaan(naskahKini.naskah && naskahKini.naskah[k], bawaan.naskah[k]);
      el.innerHTML = pakai;

      /*
        Pengalih bahasa menukar isi elemen lewat data-asli. Nilainya ikut
        diperbarui supaya naskah pengajar tidak kembali ke bawaan begitu
        pengunjung berpindah ke bahasa Inggris lalu kembali ke Indonesia.
      */
      if(el.dataset.en !== undefined || el.dataset.asli !== undefined){
        el.dataset.asli = pakai;
      }
    }
  }

  /* ---------- 2. Naskah tiap langkah ---------- */

  /*
    Medan yang boleh diubah dibatasi pada nama-nama yang memang berisi kalimat.
    Sisa isi objek langkah, misalnya daftar elemen yang disorot atau nama
    gambar yang digunakan, tidak pernah disentuh. Di situlah batas antara naskah
    dan grafik dijaga.
  */
  var MEDAN_TEKS = ['teks', 'text', 'info', 'ket', 'judul'];

  function namaMedan(m){
    if(m === 'info')  return 'Keterangan';
    if(m === 'ket')   return 'Catatan';
    if(m === 'judul') return 'Judul';
    return 'Kalimat';
  }

  function medanLangkah(item, pilihan){
    var out = [];
    var calon = (pilihan && pilihan.length) ? pilihan : MEDAN_TEKS;
    for(var i = 0; i < calon.length; i++){
      if(typeof item[calon[i]] === 'string') out.push(calon[i]);
    }
    return out;
  }

  function terapkanLarik(reg){
    for(var i = 0; i < reg.larik.length; i++){
      var item = reg.larik[i];
      if(!item || typeof item !== 'object') continue;

      var medan = medanLangkah(item, reg.medan);

      for(var m = 0; m < medan.length; m++){
        var k = reg.awalan + i + '.' + medan[m];

        if(bawaan.langkah[k] === undefined){
          bawaan.langkah[k] = item[medan[m]];
          label.langkah[k]  = reg.label + ' ' + (i + 1) + ' · ' + namaMedan(medan[m]);
        }

        item[medan[m]] = pakaiAtauBawaan(
          naskahKini.langkah && naskahKini.langkah[k], bawaan.langkah[k]);
      }
    }
  }

  /* ---------- 3. Peta naskah ---------- */

  function terapkanObjek(reg){
    for(var k in reg.objek){
      if(!Object.prototype.hasOwnProperty.call(reg.objek, k)) continue;

      var kunci = reg.nama + '.' + k;

      if(bawaan.peta[kunci] === undefined){
        if(typeof reg.objek[k] !== 'string') continue;   // bukan kalimat, dilewati
        bawaan.peta[kunci] = reg.objek[k];
        label.peta[kunci]  = reg.label + ' · ' + k;
      }

      reg.objek[k] = pakaiAtauBawaan(
        naskahKini.peta && naskahKini.peta[kunci], bawaan.peta[kunci]);
    }
  }

  /* ---------- Perakitan ---------- */

  function terapkanSemua(gambar){
    if(document.readyState !== 'loading') terapkanNaskah();

    for(var i = 0; i < daftarLarik.length; i++) terapkanLarik(daftarLarik[i]);
    for(var j = 0; j < daftarObjek.length; j++) terapkanObjek(daftarObjek[j]);

    if(!gambar) return;
    for(var g = 0; g < gambarUlang.length; g++){
      try{ gambarUlang[g](); }
      catch(err){ console.warn('Gagal menggambar ulang setelah naskah berganti.', err); }
    }
  }

  /*
    Naskah di HTML direkam sedini mungkin.

    Pendengar ini didaftarkan saat berkas dimuat di <head>, jadi berjalan lebih
    dulu daripada pendengar milik shared/situs.js yang baru terpasang setelah
    SDK Firebase selesai diunduh. Urutan itu penting untuk halaman yang sedang
    ditutup lewat status fitur: isi <body> diganti layar penutup, dan naskah
    bawaannya harus sudah terekam sebelum itu terjadi supaya halaman /pengajar
    tetap bisa menampilkannya.
  */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ terapkanNaskah(); });
  }else{
    terapkanNaskah();
  }

  /* ---------- Antarmuka untuk halaman ---------- */

  window.KafbeMateri = {
    kunci: KUNCI,

    /*
      Didaftarkan halaman sesudah larik langkahnya dibuat dan sebelum gambar
      pertama dibuat. Naskah simpanan langsung dipasang di sini, jadi gambar
      pertama sudah menggunakan naskah pengajar tanpa perlu digambar dua kali.
    */
    daftarLangkah: function(larik, opsi, gambar){
      if(!Array.isArray(larik)) return larik;
      opsi = opsi || {};
      var reg = {
        larik:  larik,
        medan:  opsi.medan || null,
        label:  opsi.label || 'Langkah',
        awalan: opsi.awalan || ''
      };
      daftarLarik.push(reg);
      catatGambarUlang(gambar);
      terapkanLarik(reg);
      return larik;
    },

    daftarPeta: function(nama, objek, judul, gambar){
      if(!objek || typeof objek !== 'object') return objek;
      var reg = { nama: nama, objek: objek, label: judul || nama };
      daftarObjek.push(reg);
      catatGambarUlang(gambar);
      terapkanObjek(reg);
      return objek;
    },

    /*
      Dipakai halaman /pengajar lewat bingkai tersembunyi. Yang dikembalikan
      adalah naskah asli halaman apa adanya, beserta labelnya, sehingga panel
      pengajar tidak perlu menyimpan salinan naskah bawaan sendiri. Salinan
      seperti itu selalu berakhir tertinggal saat halamannya diperbarui.
    */
    bawaan: function(){
      return {
        kunci:   KUNCI,
        naskah:  Object.assign({}, bawaan.naskah),
        langkah: Object.assign({}, bawaan.langkah),
        peta:    Object.assign({}, bawaan.peta),
        label: {
          naskah:  Object.assign({}, label.naskah),
          langkah: Object.assign({}, label.langkah),
          peta:    Object.assign({}, label.peta)
        }
      };
    },

    /*
      Dibuka supaya naskah bisa dicoba langsung dari Console peramban tanpa
      menyimpan apa pun ke Firestore:

          KafbeMateri.coba({ langkah: { '0.teks': 'Halo' } })

      Efeknya hanya di layar yang memanggilnya dan hilang begitu halaman dimuat
      ulang. Ini bukan lubang keamanan: naskah materi memang terbuka untuk umum,
      dan yang menjaga data tetap aturan Firestore.
    */
    coba: function(isi){
      naskahKini = isi || { naskah:{}, langkah:{}, peta:{} };
      terapkanSemua(true);
    },

    bersihkan: bersihkan
  };

  /* ---------- Mengambil naskah dari Firestore ---------- */

  (async function(){
    var isi = null;
    try{
      var c = window.KAFBE_FIREBASE_CONFIG;
      if(!c || !c.apiKey) throw new Error('konfigurasi Firebase tidak ada');

      var SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
      var app = await import(SDK + '/firebase-app.js');
      var fs  = await import(SDK + '/firebase-firestore.js');

      var snap = await fs.getDoc(fs.doc(fs.getFirestore(app.initializeApp(c)), 'materi', KUNCI));
      isi = snap.exists() ? snap.data() : {};
    }catch(err){
      /*
        Sengaja gagal tanpa suara. Materi harus tetap bisa dibaca meskipun
        Firestore tidak terjangkau, jadi kegagalan di sini berarti mahasiswa
        melihat naskah bawaan halaman, bukan pesan galat.
      */
      console.warn('Naskah materi tidak bisa dimuat, menggunakan bawaan halaman.', err);
      return;
    }

    var baru = {
      naskah:  isi.naskah  || {},
      langkah: isi.langkah || {},
      peta:    isi.peta    || {}
    };

    tulisSimpanan(baru);

    // Jika isinya sama persis dengan yang sudah dipasang dari simpanan,
    // halaman tidak perlu digambar ulang sama sekali.
    var berubah = JSON.stringify(baru) !== JSON.stringify(naskahKini);
    naskahKini = baru;
    if(berubah) terapkanSemua(true);
  })();
})();
