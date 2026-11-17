/*
  Isi cerita game Agenda Tersembunyi.

  Berkas ini hanya berisi naskah: skenario, kubu, tujuan, dan keunggulan. Cara aksi
  dihitung ada di mesin.js, dan tampilan ada di main.js.

  ATURAN GAYA BAHASA UNTUK SELURUH NASKAH DI SINI

  Naskah dibaca mahasiswa saat kelas berlangsung, jadi gaya bahasanya dijaga:
  mendidik, tidak terlalu santai, dan tidak kaku. Hindari tanda pisah panjang,
  tanda panah, tanda hubung di tengah kalimat (termasuk kata ulang seperti
  "masing" yang diulang), lambang "&", titik koma untuk menyambung klausa, emoji
  di tengah kalimat, serta frasa pembuka yang terdengar seperti tulisan mesin
  ("selain itu", "oleh karena itu", "pada dasarnya", dan sejenisnya).

  KENAPA TUJUAN DAN TITIK LEMAH MEMAKAI KODE

  Setiap skenario memakai lima tipe tujuan yang berbeda dan lima titik lemah
  yang berbeda. Kalimatnya disusun dari kode itu (lihat TUJUAN dan TITIK di
  bawah), sehingga kartu kubu, laporan intel, dan pengungkapan akhir selalu
  memakai kalimat yang sama untuk hal yang sama.

  Catatan jujur: berkas ini bisa dibaca siapa pun yang membuka sumber halaman.
  Rahasia kubu dijaga oleh tampilan, bukan oleh server. Untuk ice breaking di
  kelas, hal itu sudah memadai.
*/

/*
  Tipe tujuan.

  Angka target menyesuaikan jumlah ronde yang dipilih host (lihat
  targetTujuan di bawah), sehingga permainan tiga ronde dan sepuluh ronde
  sama sama masih bisa dimenangkan.

  Setiap tipe juga membawa satu keunggulan pasif. Keunggulan ini bukan aksi
  dan tidak perlu dipilih. Ia berlaku otomatis sepanjang permainan dan dibaca
  mesin.js lewat kolom "efek".
*/
export const TUJUAN = {
  ambisius: {
    nama: 'Ambisius',
    kalimat: (t) => `Mengumpulkan Pengaruh minimal ${t.ambisius} pada akhir permainan.`,
    kategori: 'mengumpulkan Pengaruh sebanyak mungkin',
    keunggulan: { nama: 'Mesin Pengaruh', efek: 'galangPlus', ket: 'Galang Kekuatan memberi kalian 3 PG, bukan 2.' },
  },
  penjaga: {
    nama: 'Penjaga',
    kalimat: (t) => `Bertahan sampai akhir dan memastikan paling banyak ${t.penjaga} kubu tereliminasi.`,
    kategori: 'menjaga agar tidak banyak kubu tersingkir',
    keunggulan: { nama: 'Siaga Penuh', efek: 'tamengHemat', ket: 'Bertahan tidak pernah memakan Pengaruh kalian, meski tidak ada yang menyerang.' },
  },
  rival: {
    nama: 'Rival',
    kalimat: (t, sasaran) => `Bertahan sampai akhir dan membuat ${sasaran} tereliminasi atau memiliki Pengaruh lebih rendah dari kalian.`,
    kategori: 'menjatuhkan satu kubu tertentu',
    keunggulan: { nama: 'Dendam Lama', efek: 'dendam', ket: 'Serangan kalian terhadap kubu sasaran mengurangi 1 KT lebih banyak.' },
  },
  diplomat: {
    nama: 'Diplomat',
    kalimat: (t) => `Bertahan sampai akhir dan berhasil bersekutu secara timbal balik minimal ${t.diplomat} kali.`,
    kategori: 'membangun persekutuan',
    keunggulan: { nama: 'Juru Runding', efek: 'runding', ket: 'Setiap persekutuan timbal balik memberi kalian tambahan 1 PG.' },
  },
  bayangan: {
    nama: 'Bayangan',
    kalimat: (t) => `Bertahan sampai akhir dengan Pengaruh minimal ${t.bayangan}.`,
    kategori: 'bertahan tanpa banyak menarik perhatian',
    keunggulan: { nama: 'Licin', efek: 'licin', ket: 'Setiap penyelidikan terhadap kalian berpeluang setengah untuk menghasilkan intel palsu.' },
  },
};

// Target tiap tipe tujuan menurut jumlah ronde.
export function targetTujuan(ronde){
  return {
    ambisius: 2 * ronde + 2,
    bayangan: ronde + 4,
    diplomat: ronde >= 7 ? 3 : 2,
    penjaga: ronde >= 8 ? 2 : 1,
  };
}

export const TITIK = {
  T1: { nama: 'Dikeroyok', kalimat: 'Tereliminasi jika diserang oleh dua kubu atau lebih dalam satu ronde.' },
  T2: { nama: 'Terbongkar', kalimat: 'Tereliminasi jika diselidiki sebanyak tiga kali.' },
  T3: { nama: 'Bangkrut', kalimat: 'Tereliminasi jika Pengaruh jatuh ke 0 setelah ronde pertama.' },
  T4: { nama: 'Dikhianati', kalimat: 'Tereliminasi jika mengajak bersekutu tetapi kubu yang diajak justru menyerang.' },
  T5: { nama: 'Kehilangan Momentum', kalimat: 'Tereliminasi jika hasil voting kubu adalah Diam dua ronde beruntun, termasuk Diam karena seri.' },
};

export const SKENARIO = {
  hotel: {
    id: 'hotel',
    judul: 'Berlian Mata Naga',
    latar: 'Hotel Kencana, 1958',
    satuanRonde: 'jam',
    briefing: [
      'Malam itu Hotel Kencana menggelar pesta gala untuk memamerkan berlian Mata Naga. Tepat pukul sebelas lampu padam selama satu menit. Saat lampu kembali menyala, kotak kaca di tengah aula sudah kosong.',
      'Badai di luar membuat semua tamu terkunci di dalam hotel sampai pagi. Lima kelompok punya kepentingannya sendiri, dan tidak ada yang sepenuhnya jujur.',
      'Setiap ronde mewakili satu jam. Saat fajar tiba, pintu hotel dibuka dan semua agenda akan terungkap.',
    ],
    kubu: {
      polisi: {
        nama: 'Inspektur dan Polisi Kota', warna: '#3d5a80',
        agenda: 'Kalian bertugas menjaga ketertiban di hotel sampai pagi. Kepanikan bisa membuat para tamu saling serang, dan nama baik kepolisian ikut dipertaruhkan.',
        tujuan: 'penjaga', titik: 'T1',
        saran: 'Kalian tidak harus menemukan pencurinya. Yang terpenting, jangan sampai banyak kubu yang tumbang.',
      },
      kucing: {
        nama: 'Komplotan Kucing Hitam', warna: '#2b2b2b',
        agenda: 'Berlian sudah di tangan kalian. Tugas berikutnya adalah bertahan sampai pagi tanpa ketahuan.',
        tujuan: 'bayangan', titik: 'T2',
        saran: 'Belum ada yang tahu bahwa kalian pencurinya. Gunakan keuntungan itu dengan cermat.',
      },
      fajar: {
        nama: 'Harian Suara Fajar', warna: '#7a5c2e',
        agenda: 'Kalian wartawan yang kebetulan meliput pesta. Berita pencurian ini bisa melambungkan nama koran kalian jika digarap dengan tepat.',
        tujuan: 'ambisius', titik: 'T5',
        saran: 'Koran yang diam tidak akan dibaca. Terus bergerak dan kumpulkan Pengaruh.',
      },
      wira: {
        nama: 'Keluarga Wiraatmadja', warna: '#6b2737',
        agenda: 'Kalian pemilik hotel ini. Pencurian malam ini bisa membuka skandal lama keluarga, dan wartawan adalah ancaman terbesar kalian.',
        tujuan: 'rival', sasaran: 'fajar', titik: 'T3',
        saran: 'Kalian tidak perlu menghancurkan Suara Fajar. Cukup pastikan Pengaruh mereka berada di bawah kalian.',
      },
      asuransi: {
        nama: 'Asuransi Garuda Mulia', warna: '#2f6b4f',
        agenda: 'Berlian itu diasuransikan pada perusahaan kalian dengan nilai sangat besar. Kalian butuh kawan, bukan musuh, agar klaimnya bisa ditekan.',
        tujuan: 'diplomat', titik: 'T4',
        saran: 'Ajak kubu lain bersekutu, tetapi pilih kubu yang bisa dipercaya.',
      },
    },
  },

  pulau: {
    id: 'pulau',
    judul: 'Pulau Karang Sunyi',
    latar: 'Pulau terpencil, musim angin barat',
    satuanRonde: 'hari',
    briefing: [
      'Sudah tiga hari demam aneh menyebar di Pulau Karang Sunyi. Sinyal telepon putus dan kapal berikutnya baru datang beberapa hari lagi.',
      'Vaksin percobaan yang tersedia hanya cukup untuk sebagian warga. Setiap kelompok punya rencana sendiri untuk melewati masa sulit ini.',
      'Setiap ronde mewakili satu hari. Saat kapal tiba, semua agenda akan terungkap.',
    ],
    kubu: {
      medis: {
        nama: 'Tim Medis Relawan', warna: '#2f6b4f',
        agenda: 'Kalian datang untuk merawat warga yang sakit. Persediaan obat terbatas dan setiap keputusan menentukan siapa yang selamat.',
        tujuan: 'penjaga', titik: 'T1',
        saran: 'Semakin sedikit kubu yang tumbang, semakin besar peluang kalian berhasil.',
      },
      desa: {
        nama: 'Kepala Desa dan Perangkat', warna: '#7a5c2e',
        agenda: 'Kalian memimpin desa ini. Warga mulai saling curiga, dan tugas kalian menjaga mereka tetap bersatu.',
        tujuan: 'diplomat', titik: 'T4',
        saran: 'Persekutuan adalah kekuatan kalian. Pastikan kubu yang kalian ajak tidak sedang mengincar kalian.',
      },
      biofarma: {
        nama: 'PT Biofarma Nusa', warna: '#3d5a80',
        agenda: 'Perusahaan kalian membawa vaksin percobaan. Wabah ini kesempatan besar untuk membuktikan produk kalian, meski ada hal yang kalian sembunyikan.',
        tujuan: 'ambisius', titik: 'T2',
        saran: 'Kumpulkan Pengaruh sebanyak mungkin, tetapi jangan sampai terlalu sering diselidiki.',
      },
      nelayan: {
        nama: 'Nelayan Pulau', warna: '#1f6f8b',
        agenda: 'Sejak pabrik itu berdiri, ikan di sekitar pulau mati satu per satu. Kalian yakin limbah pabriklah penyebab wabah ini.',
        tujuan: 'rival', sasaran: 'biofarma', titik: 'T3',
        saran: 'Jaga Pengaruh kalian tetap di atas nol sambil menekan PT Biofarma Nusa.',
      },
      penyelundup: {
        nama: 'Penyelundup Obat', warna: '#2b2b2b',
        agenda: 'Kalian menyimpan obat curian di gudang tersembunyi. Wabah ini membuat harga obat melambung.',
        tujuan: 'bayangan', titik: 'T5',
        saran: 'Jangan terlalu lama diam. Pembeli kalian bisa kabur.',
      },
    },
  },

  arunika: {
    id: 'arunika',
    judul: 'Arunika Gelap',
    latar: 'Kota Arunika, malam pertama pemadaman',
    satuanRonde: 'hari',
    briefing: [
      'Gardu induk Kota Arunika meledak tengah malam dan seluruh kota padam. Penjarahan mulai terjadi dan warga menuntut jawaban.',
      'Belum ada yang tahu apakah ledakan itu kecelakaan atau sabotase. Lima kelompok bergerak dengan kepentingannya sendiri.',
      'Setiap ronde mewakili satu hari tanpa listrik. Saat lampu kota kembali menyala, semua agenda akan terungkap.',
    ],
    kubu: {
      dinas: {
        nama: 'Dinas Energi Kota', warna: '#b08900',
        agenda: 'Kalian bertanggung jawab atas listrik kota. Setiap hari tanpa listrik membuat warga makin marah dan kota makin kacau.',
        tujuan: 'penjaga', titik: 'T1',
        saran: 'Kota yang tenang adalah kemenangan kalian. Cegah kubu lain saling menjatuhkan.',
      },
      polsek: {
        nama: 'Polsek Arunika', warna: '#3d5a80',
        agenda: 'Penjarahan genset dan BBM merajalela. Kalian curiga satu geng berada di balik semua kekacauan ini.',
        tujuan: 'rival', sasaran: 'lentera', titik: 'T4',
        saran: 'Kecurigaan itu wajar, tetapi jangan sembarangan menerima ajakan bersekutu.',
      },
      lentera: {
        nama: 'Geng Lentera Merah', warna: '#9b2226',
        agenda: 'Kota yang gelap adalah pasar terbaik. Kalian menguasai genset dan BBM yang sekarang paling dicari warga.',
        tujuan: 'ambisius', titik: 'T3',
        saran: 'Kumpulkan Pengaruh secepatnya, tetapi jangan biarkan Pengaruh kalian habis.',
      },
      paguyuban: {
        nama: 'Paguyuban Warga', warna: '#2f6b4f',
        agenda: 'Kalian mewakili warga kampung yang ingin aman. Kalian butuh teman untuk melewati malam yang panjang.',
        tujuan: 'diplomat', titik: 'T5',
        saran: 'Jangan sampai kubu kalian diam dua ronde beruntun. Sepakati pilihan dengan cepat.',
      },
      surya: {
        nama: 'Startup SuryaKita', warna: '#5a4a8a',
        agenda: 'Uji baterai kalian di dekat gardu malam itu gagal. Jika hal ini terungkap, perusahaan kalian tamat.',
        tujuan: 'bayangan', titik: 'T2',
        saran: 'Bersikaplah biasa saja. Kubu yang terlalu menonjol biasanya cepat diselidiki.',
      },
    },
  },

  kapal: {
    id: 'kapal',
    judul: 'Samudra Biru Terdampar',
    latar: 'Kapal pesiar di tengah badai',
    satuanRonde: 'hari',
    briefing: [
      'Kapal pesiar Samudra Biru kehilangan mesin di tengah badai. Sinyal hilang dan persediaan makanan mulai menipis.',
      'Pertolongan diperkirakan datang beberapa hari lagi. Di atas kapal, setiap kelompok mulai menyusun rencananya sendiri.',
      'Setiap ronde mewakili satu hari di tengah laut. Saat kapal penolong tiba, semua agenda akan terungkap.',
    ],
    kubu: {
      kru: {
        nama: 'Kapten dan Kru', warna: '#1f6f8b',
        agenda: 'Kalian bertanggung jawab atas seluruh penumpang. Kerusuhan di atas kapal bisa lebih berbahaya daripada badai.',
        tujuan: 'penjaga', titik: 'T1',
        saran: 'Kapal yang tenang adalah kapal yang selamat. Redam pertikaian sebisa mungkin.',
      },
      vip: {
        nama: 'Penumpang VIP', warna: '#5a4a8a',
        agenda: 'Kalian membayar mahal untuk pelayaran ini. Kalian merasa berhak atas jatah makanan dan sekoci pertama.',
        tujuan: 'ambisius', titik: 'T3',
        saran: 'Pengaruh adalah segalanya bagi kalian. Jangan sampai habis.',
      },
      dekbawah: {
        nama: 'Penumpang Dek Bawah', warna: '#7a5c2e',
        agenda: 'Jatah makanan kalian dipotong, sementara dek atas tetap berpesta. Kalian menuntut keadilan.',
        tujuan: 'rival', sasaran: 'vip', titik: 'T5',
        saran: 'Suara kalian banyak. Sepakati pilihan dengan cepat agar tidak terjebak diam.',
      },
      dokter: {
        nama: 'Dokter Kapal', warna: '#2f6b4f',
        agenda: 'Beberapa penumpang mulai demam. Kalian harus mencegah wabah dan kepanikan dengan bantuan kubu lain.',
        tujuan: 'diplomat', titik: 'T4',
        saran: 'Bangun persekutuan, tetapi waspadai kubu yang tersenyum sambil menyiapkan serangan.',
      },
      palka: {
        nama: 'Penyelundup di Palka', warna: '#2b2b2b',
        agenda: 'Di palka kapal ada muatan ilegal milik kalian. Jika ada yang menggeledah, semuanya berakhir.',
        tujuan: 'bayangan', titik: 'T2',
        saran: 'Jangan memancing rasa ingin tahu kubu lain. Kubu yang tenang jarang diselidiki.',
      },
    },
  },
};

export const URUTAN_SKENARIO = ['hotel', 'pulau', 'arunika', 'kapal'];

// Kalimat tujuan untuk satu kubu, lengkap dengan nama sasarannya bila ada.
export function kalimatTujuan(sk, idKubu, target){
  const k = sk.kubu[idKubu];
  const sasaran = k.sasaran ? sk.kubu[k.sasaran].nama : '';
  return TUJUAN[k.tujuan].kalimat(target, sasaran);
}
