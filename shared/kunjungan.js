/*
  Pencatat kunjungan KAFBE Hub.

  KENAPA MENCATAT SENDIRI, PADAHAL SUDAH ADA VERCEL ANALYTICS

  Vercel Analytics memang terpasang, tapi angkanya hanya bisa dilihat di papan
  Vercel dan tidak bisa diambil dari peramban. Selain itu rata-rata lama
  kunjungan dan jam teramai tidak tersedia di paket gratisnya. Karena dasbor
  di /adminkafbe perlu keduanya, catatannya dibuat sendiri di sini.

  APA YANG DICATAT, DAN APA YANG TIDAK

  Dicatat  : tanggal, jam, alamat halaman, lama membuka halaman, dan satu
             penanda perangkat acak yang dibuat sendiri oleh peramban.
  TIDAK    : nama, email, lokasi, alamat IP, maupun apa pun yang bisa dipakai
             mengenali orangnya. Penanda perangkatnya angka acak, tidak
             tersambung ke identitas apa pun, dan hilang begitu penyimpanan
             peramban dibersihkan.

  BENTUK PENYIMPANANNYA

  Satu dokumen per HARI, bukan satu dokumen per kunjungan. Kalau tiap kunjungan
  menjadi dokumen sendiri, membaca enam bulan berarti ribuan pembacaan
  Firestore sekali buka dasbor. Dengan satu dokumen per hari, enam bulan cukup
  sekitar 180 pembacaan.

  Penambahannya memakai increment() dari Firestore, yang dihitung di server.
  Jadi dua pengunjung yang datang bersamaan tidak saling menimpa hitungan.

  YANG PERLU DIKETAHUI SOAL KETELITIANNYA

  Lama kunjungan dicatat saat halaman ditinggalkan. Peramban tidak menjamin
  ada waktu untuk mengirim data pada saat itu, jadi kunjungan yang sangat
  singkat atau tab yang ditutup paksa bisa tidak terhitung. Angka rata-ratanya
  perlu dibaca sebagai perkiraan, bukan ukuran pasti.
*/
(function(){
  'use strict';

  /*
    Halaman yang dibuka di dalam bingkai tidak dihitung sebagai kunjungan.

    Satu-satunya yang membingkai halaman materi adalah halaman /pengajar, dan
    itu dilakukannya untuk membaca naskah bawaan halaman, bukan untuk dibaca
    orang. Tanpa penjagaan ini, seorang pengajar yang membuka sepuluh topik
    sore itu akan tercatat sebagai sepuluh kunjungan mahasiswa, dan angka di
    dasbor jadi menghitung pekerjaan pengurus sendiri.

    Pembingkaian dari situs lain sudah ditolak lewat X-Frame-Options, jadi
    pemeriksaan ini tidak menghilangkan kunjungan yang sah.
  */
  try{
    if(window.top !== window.self) return;
  }catch(e){
    // Aksesnya ditolak, berarti memang sedang dibingkai situs lain.
    return;
  }

  var KUNCI_PERANGKAT = 'kafbe_perangkat';
  var KUNCI_HARI      = 'kafbe_hari_tercatat';

  function hariIni(){
    // Tanggal LOKAL, bukan UTC. Kalau memakai toISOString(), pengunjung
    // sebelum pukul 07.00 WIB akan tercatat di tanggal kemarin.
    var d = new Date();
    var p = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /*
    Kunci peta di Firestore tidak boleh memuat titik, dan garis miring membuat
    alamatnya sulit dibaca kembali. Jadi alamat halaman disandikan: akhiran
    .html dibuang dan garis miring diganti garis bawah.

      /materi/stat2.html  ->  _materi_stat2
      /                   ->  _
  */
  function kunciHalaman(){
    var jalur = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '');
    if(jalur === '') jalur = '/';
    return jalur.replace(/[^a-zA-Z0-9/-]/g, '').replace(/\//g, '_') || '_';
  }

  function penandaPerangkat(){
    try{
      var ada = localStorage.getItem(KUNCI_PERANGKAT);
      if(ada) return ada;
      var baru = 'p' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(KUNCI_PERANGKAT, baru);
      return baru;
    }catch(e){
      return null;   // peramban menolak penyimpanan
    }
  }

  // Benar hanya pada kunjungan PERTAMA perangkat ini pada hari ini.
  function perangkatBaruHariIni(hari){
    try{
      if(localStorage.getItem(KUNCI_HARI) === hari) return false;
      localStorage.setItem(KUNCI_HARI, hari);
      return true;
    }catch(e){
      return false;
    }
  }

  (async function(){
    try{
      var c = window.KAFBE_FIREBASE_CONFIG;
      if(!c || !c.apiKey) return;

      // Halaman pengurus tidak ikut dihitung. Kalau ikut, angka kunjungan
      // akan naik sendiri tiap kali dasbornya dibuka untuk melihat angka itu.
      if(/^\/(adminkafbe|operasional)/.test(location.pathname)) return;

      var SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
      var app = await import(SDK + '/firebase-app.js');
      var fs  = await import(SDK + '/firebase-firestore.js');

      var db = fs.getFirestore(app.initializeApp(c));
      var hari = hariIni();
      var ref = fs.doc(db, 'statistik', hari);

      penandaPerangkat();

      var isi = {
        tanggal: hari,
        tampilan: fs.increment(1),
        jam: {},
        halaman: {},
      };
      isi.jam[String(new Date().getHours())] = fs.increment(1);
      isi.halaman[kunciHalaman()] = fs.increment(1);
      if(perangkatBaruHariIni(hari)) isi.perangkat = fs.increment(1);

      // merge:true menggabungkan sampai ke dalam peta, sehingga hitungan jam
      // dan halaman lain pada hari yang sama tidak ikut terhapus.
      await fs.setDoc(ref, isi, { merge: true });

      /*
        Lama kunjungan dikirim sekali saja saat halaman ditinggalkan.
        Penjaganya perlu, sebab visibilitychange bisa terpicu berkali-kali
        dalam satu kunjungan, misalnya saat pengunjung berpindah tab lalu
        kembali lagi.
      */
      var mulai = Date.now();
      var sudahDikirim = false;

      function kirimDurasi(){
        if(sudahDikirim) return;
        sudahDikirim = true;

        var detik = Math.round((Date.now() - mulai) / 1000);
        // Kunjungan sekejap dan tab yang ditinggal terbuka semalaman
        // sama-sama merusak rata-rata, jadi keduanya tidak dihitung.
        if(detik < 2 || detik > 1800) return;

        fs.setDoc(ref, {
          tanggal: hari,
          durasiTotal: fs.increment(detik),
          durasiJumlah: fs.increment(1),
        }, { merge: true }).catch(function(){});
      }

      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState === 'hidden') kirimDurasi();
      });
      window.addEventListener('pagehide', kirimDurasi);

    }catch(err){
      /*
        Gagal tanpa suara. Pencatat kunjungan tidak boleh mengganggu apa pun
        yang sedang dibaca pengunjung, dan situs harus tetap jalan meskipun
        Firestore tidak terjangkau.
      */
      console.warn('Kunjungan tidak tercatat.', err);
    }
  })();
})();
