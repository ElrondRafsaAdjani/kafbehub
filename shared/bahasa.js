/*
  Pengalih bahasa Indonesia dan Inggris.

  CARA KERJANYA

  Teks yang tetap ditulis langsung di HTML, dengan terjemahannya menempel
  sebagai atribut:

      <p data-en="Choose a course.">Pilih mata kuliah.</p>

  Naskah aslinya tidak perlu ditulis dua kali. Saat pertama kali dijalankan,
  isi asli disimpan ke data-asli, lalu isinya ditukar bolak-balik dari situ.

  Teks yang dirakit JavaScript, misalnya narasi langkah demi langkah pada
  halaman materi, tidak bisa ditandai begitu. Halaman-halaman itu memakai:

      KafbeBahasa.pilih('teks Indonesia', 'English text')

  dan menggambar ulang dirinya saat menerima peristiwa "bahasaberubah".

  Pilihan bahasanya disimpan di peramban, jadi tetap terbawa saat pindah
  halaman maupun saat berkunjung lagi esok hari.
*/
(function(){
  'use strict';

  var KUNCI = 'kafbe_bahasa';
  var kini = 'id';

  try {
    var tersimpan = localStorage.getItem(KUNCI);
    if(tersimpan === 'id' || tersimpan === 'en') kini = tersimpan;
  } catch(e){ /* peramban menolak penyimpanan, pakai bawaan saja */ }

  function terapkan(){
    document.documentElement.lang = kini;

    // Isi elemen ber-atribut data-en
    var daftar = document.querySelectorAll('[data-en]');
    for(var i = 0; i < daftar.length; i++){
      var el = daftar[i];
      if(el.dataset.asli === undefined) el.dataset.asli = el.innerHTML;
      el.innerHTML = (kini === 'en') ? el.dataset.en : el.dataset.asli;
    }

    // Teks bayangan pada kotak isian
    var isian = document.querySelectorAll('[data-en-placeholder]');
    for(var j = 0; j < isian.length; j++){
      var k = isian[j];
      if(k.dataset.asliPlaceholder === undefined) k.dataset.asliPlaceholder = k.placeholder || '';
      k.placeholder = (kini === 'en') ? k.dataset.enPlaceholder : k.dataset.asliPlaceholder;
    }

    // Judul halaman di bilah tab peramban
    var badan = document.body;
    if(badan && badan.dataset.judulEn){
      if(badan.dataset.judulAsli === undefined) badan.dataset.judulAsli = document.title;
      document.title = (kini === 'en') ? badan.dataset.judulEn : badan.dataset.judulAsli;
    }

    document.dispatchEvent(new CustomEvent('bahasaberubah', { detail: { bahasa: kini } }));
  }

  window.KafbeBahasa = {
    kini: function(){ return kini; },
    inggris: function(){ return kini === 'en'; },

    // Dipakai kode yang merakit teksnya sendiri.
    pilih: function(teksId, teksEn){ return (kini === 'en') ? teksEn : teksId; },

    ganti: function(bahasa){
      if(bahasa !== 'id' && bahasa !== 'en') return;
      if(bahasa === kini) return;
      kini = bahasa;
      try { localStorage.setItem(KUNCI, kini); } catch(e){}
      terapkan();
    },

    // Dipanggil ulang oleh halaman yang menyisipkan isi baru setelah termuat.
    terapkan: terapkan
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', terapkan);
  }else{
    terapkan();
  }
})();
