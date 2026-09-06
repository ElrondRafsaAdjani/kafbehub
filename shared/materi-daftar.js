/*
  Daftar mata kuliah dan topik materi.

  Dipakai halaman /pengajar untuk menyusun menu, dan dipakai aturan Firestore
  sebagai acuan kode mata kuliah yang sah. Isinya sengaja hanya nama dan alamat
  berkas, tanpa satu pun kalimat materi.

  KENAPA DAFTAR INI DITULIS MANUAL

  Situs ini statis dan tidak punya proses build, jadi tidak ada yang bisa
  menelusuri isi folder materi saat halaman dibuka. Menambah topik baru berarti
  menambah satu baris di sini, sama seperti menambah halaman baru di
  DAFTAR_HALAMAN pada shared/adminkafbe.js.

  Kode mata kuliah harus sama persis dengan kode yang dipakai koleksi
  "matakuliah" di halaman operasional bila mata kuliahnya memang terdaftar di
  sana, supaya satu nama tidak ditulis dua versi.
*/
window.KAFBE_MATERI_DAFTAR = [
  {
    kode: 'pemi',
    nama: 'Pengantar Mikroekonomi',
    ikon: '📊',
    topik: [
      { kunci:'pemi-supply-demand',  nama:'Grafik Supply dan Demand' },
      { kunci:'pemi-shift-movement', nama:'Shift dan Movement' },
      { kunci:'pemi-elastisitas',    nama:'Elastisitas' },
      { kunci:'pemi-surplus-dwl',    nama:'Surplus dan Deadweight Loss' }
    ]
  },
  {
    kode: 'mki',
    nama: 'Manajemen Keuangan dan Investasi',
    ikon: '💰',
    topik: [
      { kunci:'mki-time-value',        nama:'Time Value of Money' },
      { kunci:'mki-valuasi-obligasi',  nama:'Valuasi Obligasi' },
      { kunci:'mki-valuasi-saham',     nama:'Valuasi Saham' },
      { kunci:'mki-kelayakan',         nama:'Kelayakan Proyek' }
    ]
  },
  {
    kode: 'mo',
    nama: 'Manajemen Operasi',
    ikon: '🏭',
    topik: [
      { kunci:'mo-lintasan-kritis', nama:'Critical Path' },
      { kunci:'mo-crashing',        nama:'Crashing' }
    ]
  },
  {
    kode: 'stat2',
    nama: 'Statistika 2',
    ikon: '📐',
    topik: [
      { kunci:'stat2-kurva-normal', nama:'Kurva Normal' },
      { kunci:'stat2-nilai-z',      nama:'Nilai Z dan Tabel Z' }
    ]
  },
  {
    kode: 'si',
    nama: 'Sistem Informasi',
    ikon: '🗂️',
    topik: [
      { kunci:'si-flowchart-popuri', nama:'Flowchart Proses Bisnis: Popuri Inc.' }
    ]
  }
];
