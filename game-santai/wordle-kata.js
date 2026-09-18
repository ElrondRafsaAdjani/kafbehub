/*
  Bank kata untuk Tebak Kata FBE.

  KENAPA DIPISAH DARI HALAMAN GAME

  Daftar kata ini akan tumbuh terus, sedangkan aturan mainnya hampir tidak
  pernah berubah. Kalau keduanya disimpan dalam satu berkas, setiap penambahan
  satu istilah memaksa orang membuka berkas berisi ratusan baris logika
  permainan, dan salah ketik di sana mematikan gamenya, bukan cuma katanya.

  Di sini menambah kata cukup menambah satu baris di akhir daftar. Tidak ada
  urutan yang perlu dijaga: kata harian dipilih lewat pengacakan tetap yang
  dihitung ulang dari seluruh isi daftar, jadi menyisipkan kata di tengah pun
  tidak merusak apa pun.

  ATURAN PEMILIHAN KATA — JANGAN DILANGGAR SAAT MENAMBAH

  Kata harus berarti istilah bisnis/ekonomi BERDIRI SENDIRI, tanpa perlu kata
  depan atau belakang. "NERACA" lolos. "TETAP" tidak, karena baru menjadi
  istilah setelah jadi "biaya tetap"; begitu juga "SURAT" yang baru berarti
  setelah jadi "surat berharga". Kata umum seperti itu membuat petunjuknya
  mengarang konteks yang tidak ada di kata yang ditebak, dan pemain yang benar
  menebaknya pun tidak belajar istilah apa pun.

  Panjang kata bebas, tetapi yang dipakai sekarang hanya 5 dan 6 huruf. Papan
  tebakan menyesuaikan sendiri dengan panjang kata harinya.

  ISI TIAP BARIS
    k : kata jawabannya, huruf besar semua, tanpa spasi dan tanda baca
    m : mata kuliah atau bidang tempat istilah ini diajarkan
    d : definisi singkat, dipakai sebagai petunjuk dan penjelasan penutup
*/
window.KafbeWordleKata = [

  /* ---------- 5 huruf: Akuntansi dan Keuangan Perusahaan ---------- */
  { k:'MODAL', m:'Pengantar Akuntansi', d:'Dana atau harta yang ditanamkan pemilik ke dalam usahanya.' },
  { k:'HARTA', m:'Pengantar Akuntansi', d:'Seluruh sumber daya yang dimiliki perusahaan; sisi kiri neraca.' },
  { k:'UTANG', m:'Pengantar Akuntansi', d:'Kewajiban kepada pihak lain yang suatu saat harus dilunasi.' },
  { k:'SALDO', m:'Pengantar Akuntansi', d:'Sisa nilai sebuah akun setelah seluruh mutasinya diperhitungkan.' },
  { k:'DEBIT', m:'Pengantar Akuntansi', d:'Sisi kiri pencatatan dalam jurnal.' },
  { k:'BIAYA', m:'Akuntansi Biaya', d:'Pengorbanan ekonomi untuk memperoleh barang atau jasa.' },
  { k:'BEBAN', m:'Pengantar Akuntansi', d:'Biaya yang manfaatnya sudah habis terpakai pada periode berjalan.' },
  { k:'BRUTO', m:'Pengantar Akuntansi', d:'Nilai sebelum dikurangi potongan apa pun.' },
  { k:'NETTO', m:'Pengantar Akuntansi', d:'Nilai bersih setelah seluruh pengurangan diperhitungkan.' },
  { k:'IMPAS', m:'Akuntansi Biaya', d:'Keadaan saat pendapatan persis menutup biaya: tidak untung, tidak rugi.' },
  { k:'TUNAI', m:'Pengantar Akuntansi', d:'Pembayaran yang langsung dilunasi dengan uang kas.' },
  { k:'OMZET', m:'Pengantar Manajemen', d:'Nilai seluruh penjualan dalam satu periode.' },
  { k:'RETUR', m:'Pengantar Akuntansi', d:'Pengembalian barang dari pembeli kepada penjual.' },
  { k:'STRUK', m:'Pengantar Akuntansi', d:'Bukti transaksi ringkas yang dicetak mesin kasir.' },
  { k:'WESEL', m:'Manajemen Keuangan', d:'Surat perintah membayar sejumlah uang pada tanggal tertentu.' },
  { k:'KASIR', m:'Pengantar Akuntansi', d:'Petugas yang menerima dan mengeluarkan uang tunai perusahaan.' },
  { k:'AUDIT', m:'Auditing', d:'Pemeriksaan laporan keuangan oleh pihak yang independen.' },
  { k:'FRAUD', m:'Auditing', d:'Kecurangan yang disengaja demi keuntungan yang tidak sah.' },
  { k:'RASIO', m:'Manajemen Keuangan', d:'Perbandingan dua angka laporan keuangan untuk menilai kinerja.' },

  /* ---------- 5 huruf: Perpajakan dan Hukum Bisnis ---------- */
  { k:'PAJAK', m:'Perpajakan', d:'Iuran wajib kepada negara yang dapat dipaksakan tanpa imbalan langsung.' },
  { k:'CUKAI', m:'Perpajakan', d:'Pungutan negara atas barang yang konsumsinya perlu dikendalikan.' },
  { k:'TARIF', m:'Perpajakan', d:'Besaran atau persentase yang dipakai menghitung sebuah pungutan.' },
  { k:'HIBAH', m:'Perpajakan', d:'Pemberian dari satu pihak ke pihak lain tanpa imbalan.' },
  { k:'DENDA', m:'Hukum Bisnis', d:'Sanksi berupa uang atas pelanggaran sebuah aturan.' },
  { k:'PATEN', m:'Hukum Bisnis', d:'Hak eksklusif atas sebuah penemuan di bidang teknologi.' },
  { k:'FIRMA', m:'Hukum Bisnis', d:'Badan usaha persekutuan yang dijalankan bersama atas nama bersama.' },

  /* ---------- 5 huruf: Pasar Modal, Perbankan, dan Asuransi ---------- */
  { k:'BURSA', m:'Pasar Modal', d:'Tempat resmi mempertemukan penjual dan pembeli efek.' },
  { k:'SAHAM', m:'Pasar Modal', d:'Bukti kepemilikan atas sebagian sebuah perusahaan.' },
  { k:'BUNGA', m:'Manajemen Keuangan', d:'Imbalan atas penggunaan uang selama jangka waktu tertentu.' },
  { k:'EMISI', m:'Pasar Modal', d:'Penerbitan efek baru oleh perusahaan untuk menghimpun dana.' },
  { k:'WARAN', m:'Pasar Modal', d:'Hak membeli saham pada harga tertentu di masa depan.' },
  { k:'SUKUK', m:'Pasar Modal', d:'Surat berharga berbasis aset yang imbalannya berupa bagi hasil.' },
  { k:'KUPON', m:'Pasar Modal', d:'Pembayaran bunga berkala kepada pemegang obligasi.' },
  { k:'YIELD', m:'Pasar Modal', d:'Tingkat imbal hasil yang diberikan sebuah instrumen investasi.' },
  { k:'HEDGE', m:'Manajemen Keuangan', d:'Tindakan melindungi nilai dari risiko perubahan harga.' },
  { k:'TENOR', m:'Manajemen Keuangan', d:'Jangka waktu sebuah pinjaman atau instrumen keuangan.' },
  { k:'GADAI', m:'Manajemen Keuangan', d:'Penyerahan barang sebagai jaminan atas sebuah pinjaman.' },
  { k:'VALAS', m:'Bisnis Internasional', d:'Mata uang negara lain yang diperdagangkan.' },
  { k:'FOREX', m:'Bisnis Internasional', d:'Pasar tempat mata uang antarnegara diperdagangkan.' },
  { k:'DINAR', m:'Manajemen Keuangan', d:'Satuan mata uang berbasis emas yang dipakai sejumlah negara.' },
  { k:'DOLAR', m:'Bisnis Internasional', d:'Mata uang yang paling banyak dipakai dalam perdagangan dunia.' },
  { k:'PREMI', m:'Asuransi', d:'Sejumlah uang yang dibayar tertanggung kepada penanggung.' },
  { k:'POLIS', m:'Asuransi', d:'Dokumen perjanjian antara tertanggung dan perusahaan asuransi.' },
  { k:'KLAIM', m:'Asuransi', d:'Tuntutan pembayaran ganti rugi kepada penanggung.' },
  { k:'SPLIT', m:'Pasar Modal', d:'Pemecahan nilai nominal saham sehingga jumlah lembarnya bertambah.' },

  /* ---------- 5 huruf: Manajemen, Pemasaran, dan Bisnis ---------- */
  { k:'PASAR', m:'Pengantar Mikroekonomi', d:'Tempat bertemunya permintaan dan penawaran.' },
  { k:'HARGA', m:'Pengantar Mikroekonomi', d:'Nilai tukar barang atau jasa yang dinyatakan dengan uang.' },
  { k:'PROMO', m:'Manajemen Pemasaran', d:'Kegiatan memperkenalkan produk agar dikenal lalu dibeli.' },
  { k:'IKLAN', m:'Manajemen Pemasaran', d:'Pesan berbayar untuk memperkenalkan produk melalui media.' },
  { k:'MEREK', m:'Manajemen Pemasaran', d:'Tanda pengenal yang membedakan produk satu penjual dari yang lain.' },
  { k:'LABEL', m:'Manajemen Pemasaran', d:'Keterangan yang menempel pada kemasan sebuah produk.' },
  { k:'BRAND', m:'Manajemen Pemasaran', d:'Identitas produk sebagaimana hidup di benak konsumen.' },
  { k:'GERAI', m:'Manajemen Pemasaran', d:'Tempat penjualan produk langsung kepada konsumen.' },
  { k:'LAPAK', m:'Manajemen Pemasaran', d:'Tempat berjualan, termasuk di pasar daring.' },
  { k:'RITEL', m:'Manajemen Pemasaran', d:'Penjualan barang ke konsumen akhir dalam jumlah kecil.' },
  { k:'SALES', m:'Manajemen Pemasaran', d:'Tenaga penjual yang menawarkan produk kepada calon pembeli.' },
  { k:'ORDER', m:'Manajemen Operasi', d:'Pesanan barang atau jasa yang diajukan pembeli.' },
  { k:'INDEN', m:'Manajemen Pemasaran', d:'Sistem membeli dengan memesan lebih dulu lalu menunggu barangnya.' },
  { k:'BAZAR', m:'Manajemen Pemasaran', d:'Pasar sementara yang digelar pada waktu tertentu saja.' },
  { k:'KARGO', m:'Manajemen Operasi', d:'Muatan barang yang dikirim melalui jasa angkutan.' },
  { k:'OBRAL', m:'Manajemen Pemasaran', d:'Penjualan dengan harga jauh di bawah harga biasanya.' },
  { k:'BONUS', m:'Manajemen SDM', d:'Tambahan imbalan di luar gaji tetap.' },
  { k:'KLIEN', m:'Pengantar Manajemen', d:'Pihak yang memakai jasa sebuah perusahaan.' },
  { k:'MITRA', m:'Pengantar Manajemen', d:'Pihak yang diajak bekerja sama menjalankan usaha.' },
  { k:'USAHA', m:'Pengantar Manajemen', d:'Kegiatan ekonomi yang dijalankan untuk memperoleh keuntungan.' },
  { k:'NIAGA', m:'Pengantar Manajemen', d:'Kegiatan jual beli barang untuk mencari laba.' },
  { k:'TREND', m:'Manajemen Pemasaran', d:'Arah perubahan yang berlangsung dalam jangka panjang.' },
  { k:'VIRAL', m:'Manajemen Pemasaran', d:'Menyebar cepat dari orang ke orang tanpa biaya iklan besar.' },
  { k:'KUOTA', m:'Bisnis Internasional', d:'Batas jumlah yang boleh diperdagangkan atau diproduksi.' },
  { k:'RISET', m:'Metodologi Penelitian', d:'Kegiatan mencari jawaban secara sistematis dan terukur.' },
  { k:'ETIKA', m:'Etika Bisnis', d:'Pedoman tentang perilaku yang benar dalam berbisnis.' },
  { k:'KARIR', m:'Manajemen SDM', d:'Rangkaian jabatan yang ditempuh seseorang sepanjang masa kerjanya.' },
  { k:'STAFF', m:'Manajemen SDM', d:'Pegawai pendukung yang menjalankan pekerjaan sehari-hari.' },
  { k:'SHIFT', m:'Manajemen Operasi', d:'Pembagian jam kerja secara bergiliran dalam sehari.' },

  /* ---------- 5 huruf: SDM dan Ketenagakerjaan ---------- */
  { k:'BURUH', m:'Manajemen SDM', d:'Pekerja yang menerima upah atas tenaganya.' },
  { k:'MOGOK', m:'Manajemen SDM', d:'Tindakan pekerja berhenti bekerja bersama-sama sebagai tuntutan.' },
  { k:'IURAN', m:'Manajemen SDM', d:'Uang yang disetor anggota secara berkala.' },

  /* ---------- 5 huruf: Ilmu Ekonomi dan Faktor Produksi ---------- */
  { k:'MAKRO', m:'Pengantar Makroekonomi', d:'Cabang ekonomi yang membahas perekonomian secara keseluruhan.' },
  { k:'MIKRO', m:'Pengantar Mikroekonomi', d:'Cabang ekonomi yang membahas perilaku pelaku secara individu.' },
  { k:'KURVA', m:'Pengantar Mikroekonomi', d:'Garis pada grafik yang menggambarkan hubungan dua variabel.' },
  { k:'IMPOR', m:'Bisnis Internasional', d:'Memasukkan barang dari luar negeri ke dalam negeri.' },
  { k:'RENTE', m:'Pengantar Mikroekonomi', d:'Imbalan atas pemakaian faktor produksi yang jumlahnya tetap.' },
  { k:'INPUT', m:'Manajemen Operasi', d:'Segala sesuatu yang dimasukkan ke dalam proses produksi.' },
  { k:'MESIN', m:'Manajemen Operasi', d:'Alat produksi yang menggantikan atau membantu tenaga manusia.' },
  { k:'TANAH', m:'Pengantar Mikroekonomi', d:'Faktor produksi berupa sumber daya alam.' },
  { k:'LAHAN', m:'Pengantar Mikroekonomi', d:'Bidang tanah yang dipakai untuk kegiatan produksi.' },

  /* ---------- 5 huruf: Statistika, Matematika Ekonomi, Metodologi ---------- */
  { k:'MODUS', m:'Statistika', d:'Nilai yang paling sering muncul dalam sekumpulan data.' },
  { k:'SIGMA', m:'Statistika', d:'Lambang simpangan baku, sekaligus lambang penjumlahan.' },
  { k:'GALAT', m:'Statistika', d:'Selisih antara nilai dugaan dan nilai yang sebenarnya.' },
  { k:'DESIL', m:'Statistika', d:'Pembagian data terurut menjadi sepuluh bagian sama banyak.' },
  { k:'ANOVA', m:'Statistika', d:'Uji untuk membandingkan rata-rata lebih dari dua kelompok.' },
  { k:'DERET', m:'Matematika Ekonomi', d:'Penjumlahan suku-suku sebuah barisan bilangan.' },
  { k:'LIMIT', m:'Matematika Ekonomi', d:'Nilai yang didekati sebuah fungsi di titik tertentu.' },
  { k:'MODEL', m:'Metodologi Penelitian', d:'Penyederhanaan kenyataan untuk menjelaskan hubungan antarvariabel.' },
  { k:'TEORI', m:'Metodologi Penelitian', d:'Kumpulan penjelasan teruji tentang suatu gejala.' },
  { k:'SKALA', m:'Statistika', d:'Aturan pemberian angka pada objek yang sedang diukur.' },

  /* ---------- 6 huruf: Akuntansi dan Keuangan Perusahaan ---------- */
  { k:'NERACA', m:'Pengantar Akuntansi', d:'Laporan posisi harta, utang, dan modal pada satu tanggal.' },
  { k:'JURNAL', m:'Pengantar Akuntansi', d:'Catatan pertama sebuah transaksi, disusun menurut waktu.' },
  { k:'AKTIVA', m:'Pengantar Akuntansi', d:'Istilah lain untuk seluruh harta perusahaan.' },
  { k:'PASIVA', m:'Pengantar Akuntansi', d:'Sisi kanan neraca, berisi utang dan modal.' },
  { k:'AKRUAL', m:'Pengantar Akuntansi', d:'Dasar pencatatan saat transaksi terjadi, bukan saat kas bergerak.' },
  { k:'FAKTUR', m:'Pengantar Akuntansi', d:'Dokumen tagihan yang diterbitkan penjual kepada pembeli.' },
  { k:'LEDGER', m:'Pengantar Akuntansi', d:'Buku besar tempat jurnal diringkas menurut akunnya.' },
  { k:'MUTASI', m:'Pengantar Akuntansi', d:'Perubahan nilai sebuah akun karena adanya transaksi.' },
  { k:'OPNAME', m:'Akuntansi Biaya', d:'Perhitungan fisik atas persediaan yang ada di gudang.' },
  { k:'KREDIT', m:'Pengantar Akuntansi', d:'Sisi kanan pencatatan jurnal; juga berarti pinjaman dari bank.' },
  { k:'MARJIN', m:'Akuntansi Biaya', d:'Selisih antara harga jual dan biaya yang dikeluarkan.' },
  { k:'PROFIT', m:'Manajemen Keuangan', d:'Kelebihan pendapatan atas seluruh biaya.' },
  { k:'KASBON', m:'Pengantar Akuntansi', d:'Pengambilan uang kas lebih dulu yang diperhitungkan kemudian.' },
  { k:'PANJAR', m:'Pengantar Akuntansi', d:'Uang muka sebagai tanda jadi sebuah transaksi.' },
  { k:'VOUCER', m:'Manajemen Pemasaran', d:'Bukti yang dapat ditukar dengan barang, jasa, atau potongan harga.' },

  /* ---------- 6 huruf: Perpajakan dan Hukum Bisnis ---------- */
  { k:'FISKUS', m:'Perpajakan', d:'Aparat negara yang berwenang memungut pajak.' },
  { k:'PABEAN', m:'Bisnis Internasional', d:'Instansi yang mengawasi lalu lintas barang antarnegara.' },
  { k:'SANKSI', m:'Hukum Bisnis', d:'Akibat yang dijatuhkan atas sebuah pelanggaran aturan.' },

  /* ---------- 6 huruf: Pasar Modal dan Perbankan ---------- */
  { k:'EMITEN', m:'Pasar Modal', d:'Perusahaan yang menerbitkan efek di bursa.' },
  { k:'BROKER', m:'Pasar Modal', d:'Perantara yang menjalankan transaksi atas nama nasabah.' },
  { k:'DEALER', m:'Pasar Modal', d:'Pedagang efek yang bertransaksi untuk akunnya sendiri.' },
  { k:'INDEKS', m:'Pasar Modal', d:'Angka gabungan yang menggambarkan pergerakan sekelompok data.' },
  { k:'DEVISA', m:'Bisnis Internasional', d:'Cadangan alat pembayaran luar negeri milik sebuah negara.' },
  { k:'AGUNAN', m:'Manajemen Keuangan', d:'Harta yang dijaminkan kepada pemberi pinjaman.' },
  { k:'PLAFON', m:'Manajemen Keuangan', d:'Batas tertinggi kredit yang boleh dipakai peminjam.' },
  { k:'TELLER', m:'Manajemen Keuangan', d:'Petugas bank yang melayani setoran dan penarikan di loket.' },
  { k:'BANKIR', m:'Manajemen Keuangan', d:'Pelaku profesional yang menjalankan usaha perbankan.' },
  { k:'BARTER', m:'Pengantar Makroekonomi', d:'Pertukaran barang dengan barang tanpa memakai uang.' },
  { k:'KOMISI', m:'Manajemen Pemasaran', d:'Imbalan bagi perantara atas transaksi yang berhasil.' },
  { k:'RUPIAH', m:'Pengantar Makroekonomi', d:'Mata uang resmi Republik Indonesia.' },

  /* ---------- 6 huruf: Perdagangan ---------- */
  { k:'EKSPOR', m:'Bisnis Internasional', d:'Mengirim barang dari dalam negeri ke luar negeri.' },
  { k:'DAGANG', m:'Pengantar Manajemen', d:'Kegiatan membeli barang untuk dijual kembali demi laba.' },

  /* ---------- 6 huruf: Manajemen dan Pemasaran ---------- */
  { k:'LELANG', m:'Hukum Bisnis', d:'Penjualan terbuka kepada penawar dengan harga tertinggi.' },
  { k:'TENDER', m:'Manajemen Operasi', d:'Undangan mengajukan penawaran untuk sebuah pengadaan.' },
  { k:'VENDOR', m:'Manajemen Operasi', d:'Pihak yang memasok barang atau jasa kepada perusahaan.' },
  { k:'PRODUK', m:'Manajemen Pemasaran', d:'Barang atau jasa yang ditawarkan untuk memenuhi kebutuhan.' },
  { k:'SEGMEN', m:'Manajemen Pemasaran', d:'Kelompok konsumen yang kebutuhannya saling mirip.' },
  { k:'PANGSA', m:'Manajemen Pemasaran', d:'Bagian penjualan sebuah perusahaan dibanding seluruh pasar.' },
  { k:'SURVEI', m:'Metodologi Penelitian', d:'Pengumpulan data dari banyak responden sekaligus.' },
  { k:'DISKON', m:'Manajemen Pemasaran', d:'Potongan dari harga yang seharusnya dibayar.' },
  { k:'GROSIR', m:'Manajemen Pemasaran', d:'Penjualan dalam jumlah besar kepada pedagang lain.' },
  { k:'OUTLET', m:'Manajemen Pemasaran', d:'Titik penjualan milik atau berlisensi sebuah merek.' },
  { k:'SLOGAN', m:'Manajemen Pemasaran', d:'Kalimat pendek yang mudah diingat untuk menandai merek.' },
  { k:'GUDANG', m:'Manajemen Operasi', d:'Tempat menyimpan persediaan barang.' },
  { k:'SUPLAI', m:'Manajemen Operasi', d:'Penyediaan barang untuk memenuhi kebutuhan.' },
  { k:'PROYEK', m:'Manajemen Operasi', d:'Rangkaian kegiatan dengan titik awal dan akhir yang jelas.' },
  { k:'TAKTIK', m:'Pengantar Manajemen', d:'Langkah jangka pendek untuk menjalankan sebuah strategi.' },
  { k:'MENTOR', m:'Manajemen SDM', d:'Orang berpengalaman yang membimbing yang lebih junior.' },

  /* ---------- 6 huruf: SDM ---------- */
  { k:'LEMBUR', m:'Manajemen SDM', d:'Bekerja melebihi jam kerja resmi.' },
  { k:'MAGANG', m:'Manajemen SDM', d:'Bekerja sementara untuk belajar dan menambah pengalaman.' },
  { k:'MANDOR', m:'Manajemen Operasi', d:'Pengawas langsung sekelompok pekerja di lapangan.' },
  { k:'ROTASI', m:'Manajemen SDM', d:'Perpindahan pekerja antarposisi secara berkala.' },
  { k:'DEMOSI', m:'Manajemen SDM', d:'Penurunan jabatan yang dikenakan pada seorang pekerja.' },
  { k:'ARISAN', m:'Pengantar Makroekonomi', d:'Kumpulan uang yang digilir di antara para anggotanya.' },

  /* ---------- 6 huruf: Ilmu Ekonomi ---------- */
  { k:'RISIKO', m:'Manajemen Keuangan', d:'Kemungkinan hasil menyimpang dari yang diharapkan.' },
  { k:'KARTEL', m:'Pengantar Mikroekonomi', d:'Persekongkolan antarprodusen untuk mengatur harga atau jumlah.' },
  { k:'KRISIS', m:'Pengantar Makroekonomi', d:'Keadaan perekonomian yang memburuk tajam dalam waktu singkat.' },
  { k:'RESESI', m:'Pengantar Makroekonomi', d:'Penurunan kegiatan ekonomi selama dua triwulan berturut-turut.' },
  { k:'FISKAL', m:'Pengantar Makroekonomi', d:'Berkaitan dengan penerimaan dan belanja negara.' },
  { k:'SEKTOR', m:'Pengantar Makroekonomi', d:'Pengelompokan kegiatan ekonomi yang sejenis.' },
  { k:'SIKLUS', m:'Pengantar Makroekonomi', d:'Perulangan naik turunnya kegiatan ekonomi.' },

  /* ---------- 6 huruf: Statistika dan Metodologi ---------- */
  { k:'MEDIAN', m:'Statistika', d:'Nilai tengah dari data yang sudah diurutkan.' },
  { k:'VARIAN', m:'Statistika', d:'Ukuran seberapa jauh data menyebar dari rata-ratanya.' },
  { k:'SENSUS', m:'Statistika', d:'Pendataan atas seluruh anggota populasi.' },
  { k:'SAMPEL', m:'Statistika', d:'Sebagian anggota populasi yang dipilih untuk diteliti.' },
  { k:'VEKTOR', m:'Matematika Ekonomi', d:'Besaran yang memiliki nilai sekaligus arah; juga larik bilangan.' },
  { k:'FUNGSI', m:'Matematika Ekonomi', d:'Hubungan yang memetakan tiap masukan ke tepat satu keluaran.' },
  { k:'ANGKET', m:'Metodologi Penelitian', d:'Daftar pertanyaan tertulis untuk mengumpulkan data.' },

  /* ---------- 6 huruf: Korporasi ---------- */
  { k:'MERGER', m:'Hukum Bisnis', d:'Penggabungan dua perusahaan menjadi satu.' },
  { k:'PAILIT', m:'Hukum Bisnis', d:'Keadaan perusahaan yang dinyatakan tidak mampu membayar utang.' }
];
