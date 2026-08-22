# Panduan Pengurus KAFBE Hub

Panduan untuk yang mengelola kafbehub.vercel.app. Tidak perlu bisa coding.

Ada dua halaman pengurus, dengan wewenang terpisah:

| Halaman | Untuk apa | Daftar wewenang |
|---|---|---|
| `/operasional` | Jadwal, perubahan sementara, pengajar, pengumuman | koleksi `admins` |
| `/adminkafbe` | Naskah situs, status fitur, status situs, catatan versi | koleksi `adminutama` |

Keduanya tidak saling mewarisi. Akun operasional tidak bisa membuka
`/adminkafbe`. Keduanya juga tidak ditautkan dari mana pun di situs.

---

## Bagian 1 - Pemasangan pertama kali

Bagian ini **hanya dikerjakan sekali**, saat sistem baru dipasang. Kalau
halaman operasional sudah bisa dipakai, lompat ke Bagian 2.

Semua langkah di bawah butuh akses ke
[Firebase Console](https://console.firebase.google.com) proyek **kafbe-hub**.

> **Menunya susah dicari?** Tata letak Firebase Console cukup sering berubah,
> jadi lebih aman memakai alamat langsung berikut:
>
> | Untuk langkah | Alamat |
> |---|---|
> | 1.1 Metode masuk | <https://console.firebase.google.com/project/kafbe-hub/authentication/providers> |
> | 1.2 Daftar akun | <https://console.firebase.google.com/project/kafbe-hub/authentication/users> |
> | 1.3 Isi basis data | <https://console.firebase.google.com/project/kafbe-hub/firestore/databases/-default-/data> |
> | 1.4 Aturan keamanan | <https://console.firebase.google.com/project/kafbe-hub/firestore/databases/-default-/rules> |
>
> Halaman Firestore punya beberapa tab berjajar di atas panel utama, kira-kira
> **Data · Rules · Indexes · Usage**. Kalau yang tampil justru grafik Reads dan
> Writes, berarti Anda sedang berada di tab **Usage**, bukan **Data**.

### 1.1 Aktifkan metode masuk

1. Firebase Console → **Authentication** → **Get started**
2. Tab **Sign-in method** → pilih **Email/Password** → **Enable** → **Save**

Jangan aktifkan metode lain kalau tidak dibutuhkan.

### 1.2 Buat akun admin pertama

1. Tab **Users** → **Add user**
2. Isi email dan kata sandi

Pakai **email yang benar-benar Anda miliki**. Kalau memakai alamat karangan,
fitur "lupa kata sandi" tidak akan bisa dipakai dan satu-satunya jalan
memulihkan akun adalah lewat Firebase Console.

Kata sandi minimal 6 karakter, tapi pakailah yang jauh lebih panjang. Akun ini
bisa mengubah seluruh jadwal yang dilihat semua mahasiswa.

### 1.3 Daftarkan akun itu sebagai admin

Punya akun saja **belum cukup**. Wewenangnya ditentukan di sini.

1. Salin **User UID** akun tadi dari tab Users
2. **Firestore Database** → **Data** → **Start collection**
   - Collection ID: `admins`
   - Document ID: tempel **User UID** tadi
   - Field: `nama` (type: string), isi nama orangnya
3. **Save**

### 1.4 Pasang aturan keamanan

1. **Firestore Database** → tab **Rules**
2. Hapus seluruh isinya
3. Buka berkas [`firestore.rules`](firestore.rules) di repo ini, salin seluruh isinya, tempel
4. **Publish**

> Langkah ini **wajib**. Tanpa aturan itu, halaman operasional tidak bisa
> menyimpan apa pun, dan yang lebih berbahaya, data bisa saja terbuka untuk
> siapa pun. Setiap kali `firestore.rules` di repo diubah, isinya harus
> ditempel ulang ke sini, karena Firebase tidak membacanya dari GitHub.

### 1.5 Impor data lama

1. Buka <https://kafbehub.vercel.app/operasional>
2. Masuk dengan akun tadi
3. Tab **Pengaturan** → tombol **Impor dari data lama**

Tombol ini menolak berjalan kalau datanya sudah ada, jadi aman ditekan.
Perubahan sementara tidak ikut terimpor, masukkan ulang manual bila masih
berlaku.

---

## Bagian 2 - Pemakaian sehari-hari

Alamatnya: **<https://kafbehub.vercel.app/operasional>**

Halaman ini **sengaja tidak ditautkan** dari mana pun di situs. Simpan
alamatnya sebagai bookmark.

### Mata Kuliah

Daftar acuan kode dan nama. **Isi tab ini dulu sebelum membuat jadwal**, karena
jadwal hanya boleh memakai kode yang terdaftar di sini. Itu yang menjaga agar
satu mata kuliah tidak ditulis dengan nama berbeda-beda.

Mengubah kode di sini otomatis memperbarui semua jadwal yang memakainya.
Menghapus mata kuliah yang masih dipakai jadwal akan ditolak.

### Jadwal Permanen

Jadwal mingguan yang berulang. Sistem menolak menyimpan bila:

- kode mata kuliahnya belum terdaftar
- jam selesai tidak lebih akhir daripada jam mulai
- kombinasi kode dan KP yang sama sudah ada
- **ruangannya bentrok**, yaitu ruang yang sama pada hari yang sama dengan jam
  yang saling menimpa

Ada juga peringatan kuning yang tidak menghalangi, misalnya satu mata kuliah
punya dua KP di jam beririsan. Kalau memang benar, tekan Simpan sekali lagi.

### Perubahan Sementara

Berlaku hanya pada satu tanggal. Tiga jenisnya:

| Jenis | Untuk apa |
|---|---|
| Kelas ditiadakan | Tanggal merah atau acara kampus, tanpa kelas pengganti |
| Kelas jadi daring | Jam tetap, kelas berlangsung online. Di halaman jadwal ruangnya berubah jadi label **Online** |
| Dipindah ke tanggal lain | Kelas diganti di hari lain, sekalian atur jam dan ruangnya |
| Pindah ruangan saja | Jam tetap, hanya ruangnya berubah hari itu |

Sistem memeriksa bahwa tanggal yang dipilih memang jatuh pada hari kelas itu
berlangsung. Untuk kelas yang dipindah, ruang tujuannya juga diperiksa agar
tidak menabrak kelas rutin maupun kelas pengganti lain.

Perubahan yang tanggalnya sudah lewat tidak mengganggu tampilan dan otomatis
hilang sendiri dari halaman publik. Rapikan sekali-sekali agar daftarnya enak
dibaca.

#### Membuat banyak sekaligus

Untuk kejadian yang menyentuh puluhan kelas, misalnya sepekan kuliah daring
saat orientasi, jangan memasukkannya satu per satu. Buka **"Buat banyak
sekaligus"** di tab yang sama.

1. Pilih jenisnya: **daring** atau **ditiadakan**
2. Isi **dari tanggal** dan **sampai tanggal**, misalnya Senin sampai Jumat
3. Tekan **Tampilkan kelas**

Semua kelas yang jatuh pada rentang itu muncul sebagai daftar centang, sudah
tercentang semua. **Hapus centang** pada kelas yang tidak terdampak, lalu tekan
**Buat sekaligus**.

Beberapa hal yang otomatis dijaga:

- Kelas yang perkuliahannya **belum dimulai** tidak dicentang secara bawaan,
  karena menandainya daring tidak ada gunanya
- Kelas yang **sudah punya perubahan sendiri** pada tanggal itu dilewati, tidak
  ditimpa, karena entri manual lebih spesifik daripada pembuatan massal
- Rentang lebih dari 31 hari ditolak, sebagai pengaman dari salah ketik tanggal

**Membatalkan.** Tiap pembuatan massal diberi penanda kelompok dan muncul di
kotak **"Hasil pembuatan massal"**. Satu tombol di situ menghapus seluruh
anggotanya sekaligus. Tanpa itu, membatalkan berarti menghapus puluhan baris
satu per satu, yaitu persoalan yang justru ingin dihindari.

### Pengajar

Nama dan NRP pengajar untuk tiap KP. Mata kuliahnya dipilih dari daftar **Mata
Kuliah**, jadi kode yang belum terdaftar di sana tidak bisa dipakai.

Satu KP boleh punya lebih dari satu pengajar. Kolom KP menampilkan saran
berdasarkan jadwal mata kuliah yang sedang dipilih.

Sistem menolak menyimpan bila:

- NRP yang sama didaftarkan dua kali pada KP yang sama
- NRP yang sama mengajar kelas lain yang **jamnya beririsan**, karena satu orang
  tidak mungkin berada di dua ruang pada waktu bersamaan

Kelas yang bersambung, misalnya 08.00–10.00 lalu 10.00–12.00, tidak dianggap
bentrok.

> **Data ini tidak tampil ke mahasiswa.** Hanya halaman operasional yang
> memakainya, dan isinya tidak ikut ditulis ke dokumen yang dibaca pengunjung.

### Pengumuman

Tampil di halaman utama. Centang **Sematkan** untuk menaruhnya paling atas.
Kosongkan tanggal mulai dan selesai kalau ingin tampil terus.

### Pengaturan

Tanggal mulai perkuliahan. Kelas yang belum mulai tetap tampil di halaman
jadwal, tapi diredupkan dan diberi label "Belum dimulai". Pengecualian per mata
kuliah dipakai misalnya untuk angkatan baru yang mulai belakangan.

Ingat menekan **Simpan pengaturan** setelah menambah atau menghapus
pengecualian.

---

## Bagian 2B - Halaman Admin Situs (`/adminkafbe`)

Halaman terpisah dari `/operasional`, dengan daftar wewenang sendiri. Di sini
diatur **tampilan** situs: naskah judul dan keterangan, status tiap fitur, dan
status seluruh situs.

Yang **tidak** diatur di sini: isi materi, isi jadwal, dan isi permainan.
Semua itu tetap lewat `/operasional` atau lewat berkas materinya.

### Kenapa akun operasional tidak bisa masuk

Wewenangnya ditentukan koleksi `adminutama`, bukan `admins`. Keduanya terpisah
dan tidak saling mewarisi. Pengurus operasional berganti tiap kepengurusan dan
jumlahnya banyak, sedangkan yang boleh menutup situs sebaiknya sedikit.

Cara memberi akses admin utama ada di **Bagian 3**.

### Aturan yang paling sering bikin bingung

**Naskah dan status fitur hanya bisa diubah saat situs berstatus
pemeliharaan.** Selama situs aktif, semua kotak isian mati dan tombol
simpannya menolak bekerja.

Ini bukan sekadar tombol yang dimatikan di halaman. Aturan Firestore menolak
penyimpanannya di server, jadi tidak bisa dilewati dengan cara apa pun.

Urutan kerjanya:

1. Buka tab **Status Situs**, pilih **Pemeliharaan**, tekan **Terapkan status**.
   Mulai saat ini pengunjung melihat layar pemberitahuan.
2. Kerjakan perubahannya di tab **Tampilan Situs**, lalu tekan
   **Simpan perubahan**.
3. Kembali ke **Status Situs**, pilih **Aktif**, tekan **Terapkan status**.

Palang berwarna di bagian atas halaman selalu menunjukkan keadaan yang sedang
berlaku, lengkap dengan tombol pintas untuk berpindah status.

### Tab Tampilan Situs

Isinya cerminan halaman publik, disusun mengikuti urutan aslinya: per halaman,
lalu per bagian.

**Status fitur** punya tiga pilihan:

| Status | Yang dilihat pengunjung |
|---|---|
| Aktif | Lencana hijau, tombolnya bisa ditekan |
| Dalam Pengembangan | Lencana kuning, tombolnya disembunyikan, kartunya diredupkan |
| Pemeliharaan | Lencana merah, tombolnya disembunyikan, kartunya diredupkan |

Mematikan sebuah fitur juga menutup halamannya. Misalnya, menyetel
**Statistika 2** ke Pemeliharaan membuat `/materi/stat2` dan seluruh halaman
visualisasinya menampilkan pemberitahuan, bukan isinya. Menu di bilah atas
yang menuju fitur itu ikut diredupkan.

**Naskah** diisi dalam dua bahasa berdampingan. Kotak yang dikosongkan berarti
"pakai naskah bawaan halaman", bukan "kosongkan tulisannya".

Penebalan dan miring boleh dipakai dengan `<b>`, `<i>`, `<em>`, `<strong>`, dan
`<br>`. Tag lain di luar itu akan tampil sebagai tulisan biasa, bukan sebagai
format.

Butir yang sedang menimpa naskah bawaan diberi tanda **Diubah**, dan punya
tautan **Kembalikan ke bawaan** untuk melepasnya.

> **Yang disimpan hanya selisihnya.** Kolom yang isinya sama dengan naskah asli
> di HTML tidak ikut tersimpan. Jadi kalau suatu hari naskah di berkas HTML
> diperbaiki, perbaikan itu tetap sampai ke pengunjung selama kolomnya belum
> pernah ditimpa lewat halaman ini.

### Tab Status Situs

Selain saklar aktif dan pemeliharaan, di sini juga diatur naskah yang dibaca
pengunjung selama situs ditutup. Dikosongkan berarti memakai kalimat bawaan.

Halaman `/adminkafbe` dan `/operasional` tetap bisa dibuka selama pemeliharaan.

### Tab Catatan Versi

Rekaman perubahan: nomor versi, tanggal, daftar perubahan (satu baris per
perubahan), dan centang halaman atau tab mana saja yang tersentuh.

Nomor versi yang sudah pernah dipakai akan ditolak, supaya riwayatnya tetap
bisa dipercaya.

Berbeda dari naskah dan status fitur, catatan versi **bisa ditulis kapan saja**,
termasuk saat situs sedang aktif. Catatan ini merekam pekerjaan yang sudah
selesai, dan biasanya baru sempat ditulis setelah situs dinyalakan kembali.

Nomor versi yang tampil di kaki halaman publik tidak diambil dari sini. Itu
naskah biasa bernama `penutup.versi` di tab **Tampilan Situs**, jadi ubah di
sana kalau ingin ikut berganti.

---

## Bagian 3 - Mengelola admin

### Menambah admin operasional baru

Ulangi langkah **1.2** dan **1.3**. Keduanya harus dikerjakan; melewatkan 1.3
membuat akun itu bisa masuk tapi tidak bisa mengubah apa pun.

### Menambah admin utama (akses `/adminkafbe`)

Sama seperti di atas, tapi pada langkah 1.3 pakai koleksi **`adminutama`**,
bukan `admins`.

Satu akun boleh terdaftar di kedua koleksi kalau memang perlu membuka kedua
halaman. Terdaftar di salah satunya saja tidak memberi akses ke yang lain.

### Mencabut akses

Hapus dokumennya dari koleksi `admins` (untuk operasional) atau `adminutama`
(untuk admin situs) di Firestore. Efeknya langsung.

Saat kepengurusan berganti, **cabut akses pengurus lama** dan buatkan akun baru
untuk penggantinya. Jangan mewariskan akun beserta kata sandinya.

---

## Bagian 4 - Kalau ada masalah

**"Akun ini berhasil masuk, tapi belum terdaftar sebagai admin"**
Langkah 1.3 belum dikerjakan untuk akun itu, atau Document ID-nya salah ketik.
Document ID harus **persis** sama dengan User UID.

**"Metode masuk email dan kata sandi belum diaktifkan"**
Langkah 1.1 belum dikerjakan.

**Tombol Simpan menampilkan "Missing or insufficient permissions"**
Aturan di langkah 1.4 belum terpasang atau tertimpa.

**Halaman jadwal menampilkan "Jadwal terkini sedang tidak bisa diambil"**
Situs gagal membaca data dari Firestore dan sedang menampilkan salinan
cadangan yang mungkin usang. Periksa status Firebase dan aturan di langkah 1.4.

**Data tersimpan tapi halaman publik tidak berubah**
Muat ulang halaman publik dengan Ctrl+F5. Kalau tetap, buka halaman
operasional lalu simpan ulang salah satu data untuk memicu penerbitan ulang.

**Di `/adminkafbe`, semua kotak isian mati dan tidak bisa diketik**
Situsnya sedang berstatus aktif. Masuk ke pemeliharaan dulu lewat tab
**Status Situs**, atau lewat tombol pintas di palang atas halaman.

**"Akun ini bukan admin utama"**
Akun itu belum didaftarkan di koleksi `adminutama`. Terdaftar di `admins` saja
tidak cukup, karena `/operasional` dan `/adminkafbe` memakai daftar terpisah.
Lihat Bagian 3.

**Menyimpan di `/adminkafbe` ditolak padahal statusnya sudah pemeliharaan**
Layarnya mungkin memegang keadaan lama. Tekan **Muat ulang dari situs**, lalu
periksa lagi warna palang di atas halaman.

**Situs publik terlanjur tertutup dan lupa cara membukanya**
Buka `/adminkafbe`, masuk, lalu tekan **Nyalakan situs** di palang atas.
Halaman `/adminkafbe` dan `/operasional` tidak pernah ikut tertutup.

**Semua halaman publik menampilkan layar pemeliharaan padahal statusnya aktif**
Peramban menyimpan status kunjungan sebelumnya untuk menghindari kedipan.
Muat ulang dengan Ctrl+F5. Status tersimpan itu selalu ditimpa jawaban dari
Firestore, jadi keadaannya akan menyesuaikan sendiri.

---

## Bagian 5 - Catatan teknis

Bagian ini untuk yang membaca kodenya. Pemakai biasa boleh melewatkannya.

### Aliran data

```
Pengurus  →  /operasional  →  koleksi matakuliah, jadwal, perubahan,
                              pengumuman, pengaturan
                                    ↓ dirangkum otomatis tiap menyimpan
Mahasiswa →  halaman publik  ←  satu dokumen  publik/terkini
```

Halaman publik sengaja hanya membaca **satu dokumen**. Kalau ia membaca koleksi
satu per satu, tiap pengunjung menimbulkan puluhan pembacaan Firestore dan
kuota harian bisa habis. Penulisan jarang, pembacaan sering, jadi kerja
merangkumnya ditaruh di sisi penulisan.

Pengaturan tampilan mengalir terpisah, lewat dokumennya sendiri:

```
Admin     →  /adminkafbe  →  satu dokumen  publik/situs
                                    ↓ dibaca tiap halaman publik
Mahasiswa →  halaman publik  ←  shared/situs.js
```

Jadi beranda membaca dua dokumen (`publik/terkini` untuk pengumuman dan
`publik/situs` untuk pengaturan), halaman lain membaca satu.

Dokumen `publik/situs` menyimpan **selisihnya saja**, bukan salinan lengkap
seluruh naskah situs. Naskah bawaan tetap tinggal di berkas HTML, sehingga
halaman tetap utuh saat Firestore tidak terjangkau.

### Membuat halaman baru

Navigasi atas **tidak boleh ditulis ulang** di halaman baru. Daftar menunya
hanya ada di [`shared/nav.js`](shared/nav.js), dan setiap halaman memanggilnya.

Dulu markup navigasi disalin di tiap berkas, dan akibatnya selalu sama: menu
baru hanya masuk ke sebagian halaman, sehingga pengunjung melihat menu yang
berbeda-beda. Itu bukan kelalaian, melainkan hal yang pasti terjadi kalau satu
informasi disimpan di sembilan tempat.

Untuk halaman baru, letakkan dua baris ini di awal `<body>`:

```html
<div id="kafbeNav"></div>
<script src="/shared/nav.js"></script>
```

Halaman itu juga perlu memuat `styles.css` dan menyalin blok `<symbol
id="kafbe-owl">` dari halaman yang sudah ada, karena lambangnya dipakai
navigasi.

**Menambah menu baru** cukup dengan menambah satu baris pada daftar `TAUTAN` di
`shared/nav.js`. Seluruh halaman langsung ikut berubah, termasuk yang dibuat
setelahnya.

Halaman `/operasional` dan `/adminkafbe` sengaja tidak memakai navigasi ini dan
tidak boleh dimasukkan ke daftar menu, karena halaman pengurus memang tidak
ditautkan dari mana pun di situs.

**Supaya halaman baru ikut mengenal status situs**, tambahkan dua baris ini di
dalam `<head>`, sebelum penutup `</head>`:

```html
<script src="/firebase-config.js"></script>
<script src="/shared/situs.js"></script>
```

Harus di `<head>` dan tanpa `defer`, supaya layar pemeliharaan sempat dipasang
sebelum isi halaman tergambar.

### Membuat naskah yang bisa diubah dari `/adminkafbe`

Tidak ada daftar yang perlu diperbarui di berkas mana pun. Cukup tandai
elemennya di HTML:

```html
<h2 data-teks="berita.judul" data-label="Judul halaman">Kabar Terbaru</h2>
```

- `data-teks` - nama kuncinya, harus unik di seluruh situs
- `data-label` - tulisan yang dibaca admin di panel

Untuk kartu yang punya status, tandai kartunya:

```html
<div class="feature-card" data-fitur="berita" data-fitur-label="Kabar Terbaru">
  <span class="badge badge-live">Aktif</span>
  ...
</div>
```

Lencana bawaannya menentukan status awal: `badge-live` berarti Aktif,
`badge-soon` berarti Dalam Pengembangan, `badge-maint` berarti Pemeliharaan.

Bungkus tiap kelompok dengan `data-bagian="Nama Bagian"` supaya panel admin
mengelompokkannya. Kalau ingin seluruh halaman ikut mati saat fiturnya
dimatikan, tambahkan `data-fitur-halaman="berita"` pada `<body>`.

Terakhir, daftarkan halamannya di `DAFTAR_HALAMAN` pada
[`shared/adminkafbe.js`](shared/adminkafbe.js). Itu satu-satunya bagian yang
masih manual.

Naskah aslinya **tetap ditulis di HTML** dan tidak boleh dikosongkan. Itulah
yang tampil kalau JavaScript mati, jaringan putus, atau Firestore bermasalah.
Nilai dari admin hanya menimpa, tidak pernah menggantikan.

### Keamanan

Seluruh JavaScript situs ini bisa dibaca siapa pun, dan siapa pun bisa
memanggil Firestore langsung lewat Console peramban tanpa melewati halaman
operasional. Karena itu pemeriksaan di dalam kode halaman **bukan pengaman**,
melainkan hanya kenyamanan pemakai.

Pengaman sesungguhnya cuma satu: [`firestore.rules`](firestore.rules), yang
dijalankan di server Google. Jangan pernah menaruh kata sandi atau kunci
rahasia di dalam kode situs.

Koleksi `admins` sengaja tidak bisa ditulis dari web sama sekali, bahkan oleh
admin, supaya akun yang diambil alih orang lain tidak bisa mengangkat admin
baru diam-diam.

### Google Sheets

Sudah tidak dipakai sebagai sumber jadwal. Sinkronisasi otomatisnya dimatikan
di [`.github/workflows/sync-jadwal.yml`](.github/workflows/sync-jadwal.yml),
beserta keterangan cara menghidupkannya kembali bila suatu saat dibutuhkan.

Berkas `data/jadwal.json` kini hanya salinan cadangan terakhir. Halaman jadwal
memakainya bila Firestore tidak terjangkau, dan saat itu terjadi ia memasang
peringatan agar mahasiswa tahu yang dilihatnya mungkin sudah tertinggal.
