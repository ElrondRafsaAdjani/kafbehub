/*
  Navigasi bersama untuk seluruh halaman publik.

  KENAPA BEGINI, DAN JANGAN DIKEMBALIKAN KE CARA LAMA:

  Dulu markup navigasi disalin ulang di tiap berkas HTML. Setiap kali ada menu
  baru, salinan di sebagian halaman selalu tertinggal, sehingga pengunjung
  melihat menu yang berbeda-beda tergantung halaman mana yang sedang dibuka.
  Itu bukan kelalaian sekali dua kali, melainkan akibat yang pasti terjadi dari
  menyimpan hal yang sama di sembilan tempat.

  Sekarang daftar menunya hanya ada di berkas ini. Menambah menu cukup dengan
  menambah satu baris di TAUTAN di bawah, dan seluruh halaman langsung ikut,
  termasuk halaman yang dibuat setelah ini.

  CARA MEMAKAI DI HALAMAN BARU:
  Letakkan dua baris ini di awal <body>, menggantikan seluruh blok <header>:

      <div id="kafbeNav"></div>
      <script src="/shared/nav.js"></script>

  Halaman itu juga perlu memuat styles.css dan memiliki simbol <symbol
  id="kafbe-owl"> seperti halaman lain, karena lambangnya digunakan di sini.

  CATATAN: halaman /operasional sengaja TIDAK menggunakan navigasi ini dan tidak
  boleh dimasukkan ke daftar TAUTAN, karena halaman pengurus memang tidak
  ditautkan dari mana pun di situs.
*/
(function(){
  // Satu-satunya tempat daftar menu didefinisikan.
  //   teks  : tulisan yang tampil
  //   href  : alamat tujuan, ditulis dari akar situs supaya benar dari
  //           kedalaman folder mana pun (materi/, game-santai/, dan seterusnya)
  //   aktif : pola alamat yang membuat menu ini ditandai sedang dibuka
  //   fitur : kunci fitur di halaman /adminkafbe. Jika fitur itu sedang tidak
  //           aktif, menunya diredupkan oleh shared/situs.js supaya pengunjung
  //           tidak diantar ke halaman yang ujungnya menolak membuka diri.
  var TAUTAN = [
    { teks: 'Beranda',             en: 'Home',              href: '/index.html#beranda',      aktif: /^\/(index\.html)?$/ },
    { teks: 'Jadwal Kelas',        en: 'Class Schedule',    href: '/jadwal.html',             aktif: /^\/jadwal(\.html)?$/,   fitur: 'jadwal' },
    { teks: 'Visualisasi Materi',  en: 'Course Visuals',    href: '/index.html#visualisasi',  aktif: /^\/materi\//,           fitur: 'visualisasi' },
    { teks: 'Belajar Sambil Bermain', en: 'Learn by Playing',  href: '/index.html#belajar-main', aktif: /^\/belajar-sambil-main\//, fitur: 'belajar-main' },
    { teks: 'Game Santai',         en: 'Casual Games',      href: '/index.html#main-santai',  aktif: /^\/game-santai\//,      fitur: 'main-santai' }
  ];

  var wadah = document.getElementById('kafbeNav');
  if(!wadah) return;

  var jalur = location.pathname.replace(/\/+$/, '') || '/';

  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // Menu menggunakan data-en supaya ikut berganti lewat mekanisme yang sama dengan
  // isi halaman, bukan digambar ulang sendiri.
  var butir = TAUTAN.map(function(t){
    var aktif = t.aktif && t.aktif.test(jalur);
    return '<a href="' + esc(t.href) + '" data-en="' + esc(t.en) + '"'
         + (t.fitur ? ' data-fitur-tautan="' + esc(t.fitur) + '"' : '')
         + (aktif ? ' class="aktif" aria-current="page"' : '') + '>'
         + esc(t.teks) + '</a>';
  }).join('');

  var saklarBahasa =
    '<div class="saklar-bahasa" role="group" aria-label="Pilih bahasa">' +
      '<button type="button" data-bahasa="id">ID</button>' +
      '<button type="button" data-bahasa="en">EN</button>' +
    '</div>';

  wadah.outerHTML =
    '<header class="nav">' +
      '<div class="nav-inner">' +
        '<a class="brand" href="/index.html">' +
          '<svg viewBox="0 0 300 300"><use href="#kafbe-owl"/></svg>' +
          '<span class="brand-text"><span class="blue">KA</span><span class="gold">FBE</span><span class="blue"> Hub</span></span>' +
        '</a>' +
        '<div class="nav-kanan">' +
          saklarBahasa +
          '<button class="nav-toggle" id="navToggle" aria-label="Buka menu" aria-expanded="false">☰</button>' +
        '</div>' +
        '<nav class="links" id="navLinks">' + butir + '</nav>' +
      '</div>' +
    '</header>';

  // Saklar bahasa
  var tombolBahasa = document.querySelectorAll('[data-bahasa]');
  function tandaiBahasa(){
    var b = window.KafbeBahasa ? window.KafbeBahasa.kini() : 'id';
    for(var i = 0; i < tombolBahasa.length; i++){
      tombolBahasa[i].classList.toggle('aktif', tombolBahasa[i].dataset.bahasa === b);
    }
  }
  for(var i = 0; i < tombolBahasa.length; i++){
    tombolBahasa[i].addEventListener('click', function(){
      if(window.KafbeBahasa) window.KafbeBahasa.ganti(this.dataset.bahasa);
    });
  }
  document.addEventListener('bahasaberubah', tandaiBahasa);
  tandaiBahasa();

  // Menu baru saja disisipkan, jadi perlu diterjemahkan sekarang juga.
  if(window.KafbeBahasa) window.KafbeBahasa.terapkan();

  // Tombol menu untuk layar kecil. Ditangani di sini, bukan di main.js, supaya
  // tidak ada dua penangan yang saling membatalkan saat tombolnya ditekan.
  var tombol = document.getElementById('navToggle');
  var daftar = document.getElementById('navLinks');
  if(!tombol || !daftar) return;

  tombol.addEventListener('click', function(){
    var terbuka = daftar.classList.toggle('open');
    tombol.setAttribute('aria-expanded', terbuka ? 'true' : 'false');
  });

  daftar.addEventListener('click', function(e){
    if(e.target.tagName === 'A'){
      daftar.classList.remove('open');
      tombol.setAttribute('aria-expanded', 'false');
    }
  });
})();
