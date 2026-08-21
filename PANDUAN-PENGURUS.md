# Panduan Pengurus KAFBE Hub

Panduan untuk yang mengelola jadwal dan pengumuman di kafbehub.vercel.app.
Tidak perlu bisa coding untuk memakai halaman operasional.

---

## Bagian 1 — Pemasangan pertama kali

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

## Bagian 2 — Pemakaian sehari-hari

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

## Bagian 3 — Mengelola admin

### Menambah admin baru

Ulangi langkah **1.2** dan **1.3**. Keduanya harus dikerjakan; melewatkan 1.3
membuat akun itu bisa masuk tapi tidak bisa mengubah apa pun.

### Mencabut akses

Hapus dokumennya dari koleksi `admins` di Firestore. Efeknya langsung.

Saat kepengurusan berganti, **cabut akses pengurus lama** dan buatkan akun baru
untuk penggantinya. Jangan mewariskan akun beserta kata sandinya.

---

## Bagian 4 — Kalau ada masalah

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

---

## Bagian 5 — Catatan teknis

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

Halaman `/operasional` sengaja tidak memakai navigasi ini dan tidak boleh
dimasukkan ke daftar menu, karena halaman pengurus memang tidak ditautkan dari
mana pun di situs.

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
