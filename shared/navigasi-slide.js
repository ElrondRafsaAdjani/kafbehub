/*
  Navigasi papan tombol untuk halaman materi yang berbentuk slide.

  KENAPA DIPISAH KE SATU BERKAS

  Hampir semua halaman visualisasi materi menggunakan pola yang sama. Ada satu
  tombol "Sebelumnya", satu tombol "Lanjut", dan isi kotak yang berganti tiap
  kali salah satu tombol ditekan. Sebelum berkas ini ada, sebagian halaman
  sudah bisa dijalankan menggunakan tombol panah dan sebagian lagi belum. Pembaca
  yang terbiasa menggunakan panah di satu halaman jadi bingung ketika panahnya
  diam di halaman lain.

  Dengan satu berkas bersama, semua halaman slide menggunakan aturan yang persis
  sama dan perbaikan cukup ditulis sekali.

  APA YANG DIJAGA

  Panah tidak boleh mengganggu ketika pengguna sedang mengetik. Jika fokus
  sedang berada di kotak isian, kotak pilihan, penggeser nilai, atau area yang
  bisa disunting, panah dibiarkan bekerja seperti biasa di elemen itu.

  Panah juga tidak digunakan jika ditekan bersama Ctrl, Alt, Shift, atau Cmd,
  karena gabungan itu sudah punya arti sendiri di peramban.

  Tombol yang sedang mati atau sedang disembunyikan tidak ikut ditekan. Ini
  penting di langkah terakhir, karena di banyak halaman tombol "Lanjut"
  diganti tombol lain begitu langkahnya habis.

  CARA MEMAKAI

    <script src="/shared/navigasi-slide.js"></script>

    KafbeNavigasiSlide.pasang({
      mundur: document.getElementById('btnPrev'),
      maju: document.getElementById('btnNext')
    });

  Nilai yang dikirim boleh berupa elemen tombol maupun teks pemilih CSS.
  Fungsi ini mengembalikan fungsi pelepas, digunakan jika suatu saat pendengar
  perlu dicabut.
*/
(function () {
  'use strict';

  var ELEMEN_INPUT = ['input', 'textarea', 'select', 'option'];

  // Fokus sedang berada di tempat yang memang butuh tombol panah sendiri.
  function sedangMengetik(sasaran) {
    if (!sasaran || sasaran.nodeType !== 1) return false;
    var nama = (sasaran.tagName || '').toLowerCase();
    if (ELEMEN_INPUT.indexOf(nama) !== -1) return true;
    if (sasaran.isContentEditable) return true;
    var peran = sasaran.getAttribute && sasaran.getAttribute('role');
    if (peran === 'slider' || peran === 'listbox' || peran === 'textbox') return true;
    return false;
  }

  // Tombol yang mati atau tidak tampak tidak boleh ikut ditekan.
  function bisaDitekan(tombol) {
    if (!tombol) return false;
    if (tombol.disabled) return false;
    if (tombol.getAttribute('aria-disabled') === 'true') return false;
    if (tombol.hidden) return false;
    var gaya = window.getComputedStyle(tombol);
    if (gaya.display === 'none' || gaya.visibility === 'hidden') return false;
    return true;
  }

  function ambil(acuan) {
    if (!acuan) return null;
    if (typeof acuan === 'string') return document.querySelector(acuan);
    return acuan;
  }

  function pasang(pengaturan) {
    var atur = pengaturan || {};

    function dengar(e) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (sedangMengetik(e.target)) return;

      var tombol = ambil(e.key === 'ArrowRight' ? atur.maju : atur.mundur);
      if (!bisaDitekan(tombol)) return;

      // Panah kiri dan kanan bisa menggeser halaman yang lebih lebar dari
      // layar. Digagalkan supaya isi slide tidak ikut bergeser ke samping.
      e.preventDefault();
      tombol.click();
    }

    document.addEventListener('keydown', dengar);
    return function lepas() {
      document.removeEventListener('keydown', dengar);
    };
  }

  window.KafbeNavigasiSlide = { pasang: pasang };
})();
