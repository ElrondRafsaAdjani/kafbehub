# Panduan Pengurus KAFBE Hub

Panduan untuk yang mengelola kafbehub.vercel.app. Tidak perlu bisa coding.

Ada tiga wewenang pengurus yang terpisah, dan satu halaman pendaftaran yang
belum punya wewenang apa pun:

| Halaman | Untuk apa | Daftar wewenang |
|---|---|---|
| `/operasional` | Jadwal, perubahan sementara, pengajar, pengumuman | koleksi `admins` |
| `/pengajar` | Naskah materi kuliah, dibatasi per mata kuliah | koleksi `pengajarakun` |
| `/pengajar-daftar` | Pendaftaran akun pengajar, menunggu persetujuan | belum punya wewenang |
| `/adminkafbe` | Naskah situs, status fitur, status situs, catatan versi | koleksi `adminutama` |

Ketiga wewenang itu tidak saling mewarisi. Akun operasional tidak bisa membuka
`/adminkafbe` maupun `/pengajar`. Semua halaman di atas juga tidak ditautkan
dari mana pun di situs, kecuali `/pengajar-daftar` yang memang ditautkan dari
`/pengajar` supaya pengajar baru bisa menemukannya.

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

### 1.5 Isi data pertama kali

1. Buka <https://kafbehub.vercel.app/operasional>
2. Masuk dengan akun tadi
3. Tab **Excel** → unggah berkas Informasi Kelas Asistensi semester berjalan

Cara kerjanya dijelaskan di bagian **Excel** di bawah. Perubahan sementara
tidak ada di berkas itu, jadi masukkan manual lewat tabnya sendiri.

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
| **Dipindah, jadwalnya menyusul** | Perpindahannya sudah pasti, tapi belum tentu kapan dan di mana |
| Pindah ruangan saja | Jam tetap, hanya ruangnya berubah hari itu |

#### Dipindah, jadwalnya menyusul

Dipakai kalau sudah pasti kelasnya tidak jadi berlangsung pada tanggal itu dan
akan diganti, tapi tanggal, jam, atau ruang penggantinya belum ditentukan.

Kotak tanggal pengganti, jam, dan ruang **boleh dikosongkan**. Yang dikosongkan
tampil ke mahasiswa sebagai **menyusul**, jadi bisa diisi sebagian:

- Semua kosong: "Penggantinya tanggal dan jam menyusul, di ruang menyusul."
- Tanggal dan jam sudah ada, ruang belum: kelas penggantinya ikut tampil pada
  tanggal itu, dengan kolom ruang tertulis **Menyusul**.

Yang tetap ditolak adalah pengisian setengah jalan, misalnya jam mulai diisi
tapi jam selesai tidak, atau tanggal diisi tapi jamnya tidak. Keadaan seperti
itu biasanya bukan "belum ditentukan" melainkan lupa mengisi, dan kalau
diteruskan akan tampil ke mahasiswa sebagai jam yang tidak masuk akal.

Di halaman jadwal, kelas ini diberi label kuning **Jadwal menyusul**, bukan
merah seperti "Ditiadakan". Warnanya sengaja dibedakan karena kelasnya bukan
hilang, hanya belum jelas kapan dan di mana.

Begitu tanggal dan jamnya sudah pasti, ubah jenisnya menjadi **Dipindah ke
tanggal lain** supaya tampil sebagai kelas pengganti yang utuh.

#### Ditiadakan dan diganti bukan hal yang sama

Di halaman jadwal, kelas yang tidak berlangsung dibedakan menjadi tiga label
dengan warna berbeda:

| Label | Warna | Artinya |
|---|---|---|
| **Ditiadakan** | merah | Tidak ada kelas penggantinya |
| **Diganti** | biru | Ada penggantinya, dan sudah ditentukan kapan serta di mana |
| **Jadwal menyusul** | kuning | Ada penggantinya, tapi belum ditentukan |

Untuk yang **Diganti** dan **Jadwal menyusul**, mahasiswa langsung membaca
keterangan seperti *"Diganti pada Rabu, 26 Agustus 2026, pukul 18.30 - 20.10,
di ruang EA 02.05."* Bagian yang belum ditentukan tertulis *menyusul*, bukan
dikosongkan.

Perbedaan ini muncul sendiri dari jenis perubahan yang dipilih, jadi tidak ada
yang perlu diatur khusus.

Sistem memeriksa bahwa tanggal yang dipilih memang jatuh pada hari kelas itu
berlangsung. Pemeriksaan ini berjalan **seketika** begitu kelas dan tanggalnya
terisi, jadi tidak perlu menunggu tombol Simpan ditekan. Untuk kelas yang dipindah, ruang tujuannya juga diperiksa agar
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

### Excel

Tab ini menjembatani berkas **Informasi Kelas Asistensi** yang tiap semester
disusun pengurus dengan data yang dipakai situs.

**Unduh.** Menyusun berkas Excel dari data yang sedang tersimpan. Karena
berkasnya dibuat ulang tiap kali diunduh, Excel lama tidak perlu ikut disunting
setiap ada perubahan jadwal. Ubah di halaman ini, lalu unduh ketika berkasnya
dibutuhkan untuk dibagikan.

Bentuknya dibuat semirip berkas yang biasa diedarkan: kepala tabel berwarna
merah dengan tulisan putih, seluruh sel bergaris, kolom kode dan nama mata
kuliah digabung ke bawah untuk semua KP-nya, dan baris kepalanya dibekukan
supaya tetap terlihat saat digulir. Pada lembar Tim Pengajar, kolom KP ikut
digabung untuk pengajar yang mengampu kelas yang sama. Lembar Contact Koor dan
Tim Pengajar juga diberi baris judul seperti aslinya.

**Unggah.** Membaca berkas Excel dan memasukkan isinya ke basis data. Empat
lembar dibaca:

| Lembar | Mengisi |
| --- | --- |
| Jadwal + Ruang Kelas | Mata Kuliah dan Jadwal Permanen |
| Tim Pengajar | Pengajar |
| google classroom | Kode Google Classroom |
| Contact Koor | Koordinator Mata Kuliah |

Lembar **Rekap Jumlah Ngajar** sengaja tidak dibaca dan tidak ikut ditulis,
karena isinya hitungan yang bisa diturunkan sendiri dari lembar Tim Pengajar.

Berkas tidak langsung disimpan. Tombol **Bandingkan dengan data di web**
membaca berkasnya, lalu menampilkan perbedaannya baris per baris. Tidak ada
satu pun mata kuliah, jadwal, ruang, atau pengajar yang berubah sampai tombol
**Simpan perubahan** ditekan.

Tiap baris diberi tanda, dengan warna sekaligus kata supaya tetap terbaca kalau
halamannya dicetak hitam putih:

| Tanda | Warna | Artinya |
| --- | --- | --- |
| Baru | hijau | ada di berkas, belum ada di web |
| Berubah | kuning | ada di keduanya, isinya berbeda |
| Dihapus | merah | ada di web, tidak ada di berkas, dan akan dibuang |
| Dibiarkan | biru muda | ada di web, tidak ada di berkas, tapi tidak disentuh |

Pada baris yang berubah, nilai lamanya ditampilkan dicoret di sebelah kiri dan
nilai barunya ditebalkan di sebelah kanan, jadi arah perubahannya kelihatan
tanpa membuka tab lain. Yang isinya sudah sama tidak ditulis ulang, dan
jumlahnya disebut di kepingan hitungan paling atas.

Tiap baris bisa diperlakukan sendiri-sendiri lewat tiga tindakan:

| Tindakan | Gunanya |
| --- | --- |
| Kotak centang di kolom Simpan | menentukan baris itu ikut tersimpan atau tidak. Baris yang centangnya dilepas berubah menjadi abu-abu berlabel "Tidak disimpan" dan tetap tinggal di daftar |
| Tombol **Ubah** | menyunting nilai yang akan disimpan, misalnya membetulkan ruang atau jam yang salah ketik di Excel. Kode dan KP kelas yang sudah ada di web dikunci, karena keduanya penanda yang menghubungkan baris itu dengan data yang tersimpan |
| Tanda silang | membuang baris itu dari daftar sama sekali. Kalau ternyata masih dibutuhkan, tekan tombol bandingkan sekali lagi |

Suntingan pada satu baris diperiksa saat tombol **Simpan baris** ditekan. Jam
yang terbalik dan kolom wajib yang dikosongkan ditolak di tempat, jadi tidak
sampai tersimpan. Yang disimpan nanti persis yang terlihat di layar, termasuk
hasil suntingan itu.

Angka pada tombol simpan dan pada tiap judul bagian mengikuti pilihan Anda,
misalnya "2 dari 3 disimpan". Kalau tidak ada satu pun baris yang dicentang,
tombol simpannya mati sendiri.

Baris yang tidak bisa dibaca, misalnya jam yang formatnya kacau, masuk ke
bagian **Baris yang dilewati** beserta nomor barisnya di Excel.

Bentuk lembarnya boleh seperti berkas aslinya, dengan sel kode dan nama mata
kuliah yang digabung ke bawah, tiap KP memakan dua baris, dan baris kosong
penyekat. Catatan kerja yang biasa ditulis di kolom jauh, seperti "ganti
jadwal" dan "Y", tidak mengganggu pembacaan. Jam ditulis seperti
`13.00 - 14.40`. Berkas hasil unduhan juga bisa diunggah kembali apa adanya.

Centang **Hapus data yang tidak ada di berkas** menentukan keadaan awal baris
merahnya. Tanpa centang itu, semua baris yang ada di web tapi tidak ada di
berkas tampil sebagai "Dibiarkan" dan tidak akan disentuh. Dengan centang itu,
semuanya langsung tercentang sebagai "Dihapus". Apa pun pilihannya, tiap baris
tetap bisa diatur satu per satu sesudahnya, jadi menghapus satu kelas saja pun
bisa tanpa ikut membuang yang lain.

Kelas yang dihapus menyeret perubahan sementara yang menunjuknya, supaya tidak
ada perubahan yatim yang menunjuk kelas yang sudah tidak ada.

Mengubah centang itu setelah perbandingan tersusun akan membatalkan
ringkasannya, karena isinya sudah tidak lagi menggambarkan apa yang akan
terjadi. Tekan tombol bandingkan sekali lagi.

**Kode Google Classroom dan Koordinator Mata Kuliah** dikelola di tab ini juga,
karena keduanya tidak punya tempat di tab lain. Keduanya hanya dipakai pengurus,
tidak ditampilkan ke mahasiswa, dan tidak bisa dibaca pengunjung sama sekali.
Kode kelas adalah kunci masuk kelas daring, dan daftar kontak koordinator berisi
nomor pribadi, jadi keduanya ditutup di aturan keamanan.

> Kode di lembar **Contact Koor** kerap berbeda dari kode di lembar jadwal,
> karena mengikuti kurikulum yang lain. Karena itu kolom kodenya tidak dipaksa
> cocok dengan daftar Mata Kuliah, dan barisnya tetap tersimpan apa adanya.

### Pengumuman

Tampil di halaman utama. Centang **Sematkan** untuk menaruhnya paling atas.
Kosongkan tanggal mulai dan selesai kalau ingin tampil terus.

### Log

Catatan setiap penambahan, perubahan, dan penghapusan yang dilakukan di halaman
operasional, lengkap dengan waktu dan pelakunya. Yang tercatat mencakup mata
kuliah, jadwal permanen beserta ruangnya, perubahan sementara, pengajar,
pengumuman, kode Google Classroom, koordinator, pembuatan massal, dan
penyimpanan dari berkas Excel.

Waktunya diambil dari server, bukan dari jam komputer yang dipakai, dan
ditampilkan dalam waktu Jakarta. Jadi catatannya tetap benar walau ada yang jam
komputernya meleset atau membukanya dari zona waktu lain.

Tersedia kotak pencarian, saringan aksi, jenis data, pelaku, dan rentang
tanggal, serta pilihan urutan. Saringan bekerja pada catatan yang sedang
termuat, yaitu 200 catatan terbaru. Tombol **Muat catatan yang lebih lama**
menambah 200 berikutnya, dan **Muat ulang** mengambil yang paling baru.

Baris pada tab lain diberi warna berbeda menurut aksinya: hijau untuk
penambahan, kuning untuk perubahan, merah untuk penghapusan, biru untuk
pembuatan massal, dan abu-abu untuk penyimpanan dari Excel.

> **Catatan tidak bisa dihapus dari web, oleh siapa pun.** Aturan Firestore
> hanya mengizinkan menambah. Itu memang inti gunanya: catatan yang bisa
> dirapikan sendiri oleh pelakunya tidak bisa dipakai menelusuri apa pun.
> Kalau suatu saat catatannya sudah terlalu banyak dan ingin dipangkas, itu
> hanya bisa dikerjakan lewat Firebase Console, pada koleksi `log`.

Unggahan Excel dicatat sebagai satu baris berisi hitungan, bukan satu baris per
data. Satu berkas bisa berisi ratusan baris, dan mencatatnya satu per satu akan
menenggelamkan catatan lain yang justru dicari orang.

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

### Tab Dasbor

Catatan kunjungan halaman publik. Halaman `/adminkafbe` dan `/operasional`
sengaja tidak ikut dihitung, supaya angkanya tidak naik sendiri tiap kali
dasbornya dibuka.

Rentangnya dipilih lewat tombol **1 hari, 1 minggu, 1 bulan, 3 bulan, 6 bulan**.
Pada rentang 1 hari grafiknya berisi 24 batang per jam, selebihnya satu batang
per hari. Arahkan tetikus ke sebuah batang untuk melihat angka persisnya.

Yang ditampilkan: halaman dibuka hari ini, bulan ini, dan pada rentang terpilih;
jumlah perangkat berbeda; rata-rata lama membuka halaman; jam paling ramai;
serta daftar halaman yang paling sering dibuka.

> **Pencatatan dimulai sejak fitur ini dipasang.** Hari-hari sebelumnya tidak
> punya data dan memang akan kosong. Grafik enam bulan baru benar-benar penuh
> setelah situs berjalan enam bulan.

**Tiga hal yang perlu diingat saat membaca angkanya:**

Lama kunjungan dicatat pada saat halaman ditinggalkan, dan peramban tidak
menjamin ada waktu untuk mengirimnya. Kunjungan yang sangat singkat atau tab
yang ditutup paksa bisa tidak terhitung, jadi rata-ratanya perkiraan.

Perangkat dihitung dari penanda acak yang disimpan peramban. Satu orang yang
memakai ponsel dan laptop terhitung dua, dan orang yang membersihkan data
perambannya akan terhitung sebagai perangkat baru.

Angkanya ditulis langsung dari peramban pengunjung, jadi secara teknis bisa
dinaikkan orang yang memang berniat begitu. Bacalah sebagai gambaran ramai
sepinya kunjungan, bukan hitungan yang bisa dipertanggungjawabkan.

### Tab Tampilan Situs

Isinya **halaman publik yang digambar ulang apa adanya**, bukan daftar kotak
isian. Kartu yang Anda lihat di sini sama persis dengan yang dilihat mahasiswa,
lengkap dengan warna, lencana, dan tombolnya.

Tab ini terbagi dua. Di atas ada **Elemen Bersama**, yaitu tiga bagian yang
muncul di semua halaman sekaligus. Di bawahnya ada **Isi Tiap Halaman**, yaitu
cerminan tadi.

#### Elemen Bersama

| Saklar | Kalau dimatikan |
|---|---|
| Kepala navigasi | Bilah menu di atas halaman hilang dari seluruh situs |
| Penutup halaman | Bagian paling bawah, berisi kalimat penutup dan nomor versi, ikut hilang |
| Saklar bahasa ID dan EN | Tombol pengganti bahasa hilang dan situs tampil dalam bahasa Indonesia saja |

Ketiganya berlaku untuk seluruh situs, bukan satu halaman saja. Sama seperti
naskah, saklarnya hanya bisa digeser saat situs berstatus pemeliharaan, dan
baru berlaku setelah **Simpan perubahan** ditekan.

Pengunjung yang terakhir kali memilih bahasa Inggris akan dikembalikan ke
bahasa Indonesia begitu saklar bahasa dimatikan. Tanpa itu halamannya akan
terkunci berbahasa Inggris tanpa satu pun tombol untuk kembali.

#### Memilih satu halaman

Daftar **Halaman yang ditampilkan** menyaring cermin supaya hanya satu halaman
yang tampil. Ini yang dipakai kalau Anda sedang mengerjakan satu mata kuliah
saja. Pilih **Semua halaman** untuk melihat seluruh situs sekaligus seperti
sebelumnya. Kotak **Cari isi** di sebelahnya tetap bekerja atas naskah yang
sedang berlaku, bukan atas nama kuncinya saja.

Tiap kartu punya dua alat di pojok kanan atas:

| Alat | Gunanya |
|---|---|
| **Ubah** | Membuka jendela penyuntingan: status fitur, judul, keterangan, dan tombol, dalam dua bahasa |
| Pegangan **⠿** | Diseret untuk menukar urutan kartu |

Naskah yang bukan milik kartu, misalnya judul bagian dan kalimat pembuka,
diubah lewat tombol **Ubah teks bagian** di kepala tiap bingkai.

Semua perubahan baru tercatat di layar. Yang membuatnya berlaku di situs publik
tetap tombol **Simpan perubahan** di atas.

#### Palang perubahan yang belum disimpan

Naskah, status fitur, dan urutan kartu diubah dulu di layar lalu baru ditulis
saat Simpan ditekan. Status situs bekerja sebaliknya: begitu diterapkan, saat
itu juga tersimpan.

Perbedaan itu mudah menjebak. Karena itu, begitu ada yang belum disimpan,
muncul palang kuning di atas halaman yang menyebutkan berapa banyak yang
menunggu. Palang itu terlihat dari tab mana pun, termasuk dari tab Status Situs.

Menyalakan situs sambil membawa perubahan yang belum disimpan akan ditanya
lebih dulu. Kalau diteruskan, perubahan itu **tidak bisa disimpan lagi** sampai
situs ditutup untuk pemeliharaan sekali lagi, sebab saat aktif isinya terkunci.

Mengubah sesuatu lalu mengembalikannya seperti semula membuat palang itu hilang
sendiri. Yang dibandingkan isinya, bukan sekadar apakah sesuatu pernah disentuh.

#### Dua tanda pada kartu, dan bedanya

| Tanda | Warna | Artinya |
|---|---|---|
| **Diubah** | kuning | Sudah tersimpan dan sedang tayang untuk pengunjung |
| **Belum disimpan** | merah, dengan garis putus-putus di sekeliling kartu | Baru ada di layar ini. Pengunjung masih melihat yang lama |

Tanda merah menunjuk kartu yang mana, bukan cuma menyebut jumlahnya. Selama
tanda itu masih ada, apa pun yang Anda ubah **belum berlaku di situs publik**.

> **Kalau sebuah fitur sudah dikunci tapi masih bisa dibuka pengunjung**,
> hampir pasti perubahannya belum tersimpan. Buka tab Tampilan Situs dan cari
> tanda merah. Kalau ada, situsnya harus ditutup untuk pemeliharaan dulu, lalu
> tekan **Simpan perubahan**.

#### Memindahkan urutan kartu

Seret kartu ke kiri atau ke kanan untuk menukar posisinya dengan kartu lain.
Urutannya langsung tercatat begitu kartu dilepas.

**Yang bisa dipindah hanya urutan.** Tidak ada pengaturan posisi bebas,
kemiringan, atau ukuran, dan itu disengaja. Tata letak situs diatur `styles.css`
supaya menyesuaikan diri dari layar ponsel sampai layar lebar. Kartu yang
ditaruh di titik bebas akan berantakan begitu lebar layarnya berubah, dan
kerusakan itu baru ketahuan di perangkat orang lain, bukan di layar Anda.

Tombol **Kembalikan urutan** di atas mengembalikan semua kartu ke urutan
bawaan halaman sekaligus.

Kartu yang tidak berada di dalam kelompok yang bisa diurutkan tidak punya
pegangan seret. Itu bukan kerusakan, memang tidak ada kartu lain untuk ditukar.

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

**Tiap topik materi punya statusnya sendiri.** Di dalam halaman mata kuliah,
kartu seperti Crashing atau Valuasi Saham bisa disetel terpisah. Menyetel satu
topik ke Dalam Pengembangan menyembunyikan tombolnya di daftar topik dan
menutup halaman visualisasinya, sedangkan topik lain di mata kuliah yang sama
tetap terbuka. Inilah cara menahan materi yang belum siap ditampilkan tanpa
perlu menutup satu mata kuliah penuh.

Kalau mata kuliahnya dimatikan, seluruh topik di dalamnya ikut tertutup meski
statusnya sendiri masih Aktif. Yang dipakai selalu status yang paling
membatasi.

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

## Bagian 2C - Halaman Pengajar (`/pengajar`)

Halaman untuk asisten dan pengajar yang mengampu mata kuliah. Di sini diubah
**naskah materi**: kalimat penjelasan pada halaman visualisasi, kalimat tiap
langkah cerita, dan nama tiap bagian.

Yang **tidak** diubah di sini: grafik, bagan, angka contoh soal, dan cara
halaman menggambar. Semua itu tetap milik berkas materinya dan hanya bisa
diubah lewat kode. Jadi kalimatnya boleh dirapikan sesering apa pun tanpa
risiko merusak gambarnya.

### Cara pengajar mendapat akun

Pengajar mendaftar sendiri. Pengurus operasional yang menyetujui. Tidak ada
langkah di Firebase Console sama sekali.

1. Pengajar membuka `/pengajar`, menekan **Buat akun pengajar** sehingga
   berpindah ke `/pengajar-daftar`, lalu mengisi nama lengkap, NRP, email
   student UBAYA, dan kata sandi barunya dalam satu halaman.
2. Akunnya langsung jadi, tapi belum bisa mengubah apa pun. Yang dia lihat
   adalah layar **Pengajuan sedang ditinjau**.
3. Pengurus operasional membuka `/operasional` tab **Akun Pengajar**, menilai
   pengajuannya, lalu menerima atau menolak. Kalau diterima, pengurus sekaligus
   memilih mata kuliah mana saja yang boleh diubah.
4. Pengajar masuk lagi, dan sekarang halamannya terbuka.

Email yang diterima hanya email student UBAYA berbentuk
`s130223203@student.ubaya.ac.id`. Bentuk lain ditolak, dan penolakannya
dikerjakan aturan Firestore di server, bukan cuma oleh halamannya.

Halaman pendaftaran sengaja berdiri sendiri dan tidak memuat formulir masuk
sama sekali. Selama keduanya berada di satu halaman, pengelola kata sandi
membaca keduanya, menyimpulkan itu halaman masuk, lalu mengisi kotak email
dengan alamat pribadi yang tersimpan, bahkan kadang mengirimkannya sendiri.
Menyembunyikan formulir tidak menghapusnya dari dokumen, jadi memisahkan
halamannya adalah satu-satunya cara menghentikan tebakan itu.

### Wewenangnya dibatasi per mata kuliah

Akun pengajar disimpan di koleksi `pengajarakun`, terpisah dari `admins` maupun
`adminutama`. Dokumennya menyebut mata kuliah mana saja yang boleh disentuh,
dan pembatasan itu ditegakkan aturan Firestore di server, bukan sekadar dengan
menyembunyikan daftarnya di halaman.

Pendaftar hanya boleh membuat baris pengajuan atas namanya sendiri, dengan
status menunggu dan tanpa satu pun kolom wewenang. Jadi tidak ada cara
menyetujui diri sendiri, bahkan lewat Console peramban.

### Cara memakainya

1. Buka `/pengajar`, masuk dengan email dan kata sandi akun pengajar.
2. Pilih topiknya di daftar sebelah kiri. Halaman materinya dibuka diam-diam
   di latar belakang untuk diambil naskah aslinya, jadi tunggu sebentar.
3. Ubah kalimatnya di kotak isian. Kotak **Pratinjau** di bawahnya menunjukkan
   hasil akhirnya, termasuk penebalan dan miring.
4. Tekan **Simpan perubahan**. Mahasiswa yang membuka halaman materinya
   sesudah itu langsung membaca naskah yang baru.

Kotak yang isinya sudah berbeda dari naskah asli diberi bingkai kuning dan
lencana **Diubah**. Tombol **Kembalikan ke naskah asli** mengembalikan satu
kotak ke naskah bawaan halaman, dan perubahan itu baru berlaku setelah
disimpan.

### Markup yang boleh dipakai

Naskah boleh memuat HTML sederhana, misalnya `<strong>tebal</strong>`,
`<em>miring</em>`, `<br>`, daftar `<ul><li>`, dan tautan `<a href="...">`.

Yang tidak boleh akan dibuang sendiri saat naskahnya ditampilkan, termasuk
`<script>`, `<style>`, dan tautan berskema `javascript:`. Ini bukan untuk
membatasi pengajar, melainkan supaya akun pengajar yang suatu hari diambil
alih tidak bisa dipakai menanam apa pun di halaman yang dibaca mahasiswa.

Kelas CSS boleh ditulis dan tetap berlaku, sehingga potongan rumus yang sudah
ada di halaman bisa dipindah atau disalin tanpa kehilangan bentuknya.

### Naskah yang belum ada di daftar

Panel pengajar hanya menampilkan naskah yang sudah ditandai di berkas
materinya. Kalau ada kalimat di halaman materi yang tidak muncul di panel,
kalimat itu belum ditandai, dan penandaannya harus dikerjakan lewat kode.
Caranya dijelaskan di komentar bagian atas `shared/materi.js`.

Naskah pengantar di halaman daftar mata kuliah, misalnya `/materi/pemi`, tidak
diatur di sini melainkan di `/adminkafbe` tab **Tampilan Situs**.

### Tab Akun Pengajar di `/operasional`

Di sinilah pengurus operasional memutuskan pengajuan yang masuk. Tabelnya
memuat nama, NRP, email, status, dan satu kolom **Hasil pencocokan**.

Kolom pencocokan itu membandingkan NRP dan nama pendaftar dengan isi tab
**Pengajar**, lalu melaporkan tiga hal:

| Warna | Artinya |
| --- | --- |
| Hijau | Nama dan NRP cocok dengan data pengajar |
| Merah | NRP tidak ada di data pengajar, namanya berbeda, atau emailnya tidak sesuai NRP |
| Kuning | Perlu dilirik, misalnya NRP-nya tidak ketemu tapi ada nama yang sama |

Email student UBAYA dibentuk dari NRP-nya. NRP 130223001 memakai email
`s130223001@student.ubaya.ac.id`. Kalau keduanya tidak cocok, salah satunya
pasti keliru, dan keduanya sama-sama menentukan: NRP dipakai mencocokkan dengan
data pengajar, email dipakai masuk. Karena itu ketidakcocokan ini dihitung
merah, dan peringatannya sekaligus menyebutkan email yang seharusnya.

Peringatan ini **tidak** menghalangi apa pun. Data pengajar diisi manusia dan
sering tertinggal di awal semester, jadi penolakan otomatis akan menghambat
asisten yang sah hanya karena barisnya belum sempat dimasukkan. Yang memutuskan
tetap pengurus. Kalau ada peringatan merah dan pengurus tetap menerimanya,
tombol simpannya minta ditekan dua kali supaya keputusan itu benar-benar
disengaja.

Menerima sekaligus memilih mata kuliahnya. Pengajuan yang diterima tanpa satu
pun mata kuliah tidak bisa mengubah apa pun, jadi hal itu ditolak formulirnya.

Menolak harus disertai alasan, karena alasannya ditampilkan ke pendaftar di
halaman `/pengajar`. Kalau orangnya perlu mendaftar ulang, misalnya karena NRP
yang diisi salah ketik, hapus barisnya lebih dulu. Selama barisnya masih ada,
pendaftaran ulang dengan akun yang sama akan ditolak.

Semua keputusan di tab ini ikut tercatat di tab **Log** dengan jenis
**Akun pengajar**.

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

### Menambah akun pengajar (akses `/pengajar`)

**Tidak lewat Firebase Console.** Pengajar mendaftar sendiri di `/pengajar`,
lalu pengurus operasional menerimanya di tab **Akun Pengajar**. Langkahnya ada
di Bagian 2C.

Menambah lewat Console tetap mungkin untuk keadaan darurat, misalnya saat belum
ada satu pun pengurus operasional yang bisa menyetujui. Buat akunnya seperti
langkah **1.2**, lalu tambahkan dokumen di koleksi **`pengajarakun`** dengan
Document ID sama dengan User UID, berisi:

| Kolom | Jenis | Isi |
| --- | --- | --- |
| `nama` | string | Nama pengajarnya, dipakai pada catatan log |
| `nrp` | string | NRP-nya |
| `email` | string | Email akun Firebase-nya |
| `status` | string | Isi `diterima` |
| `mk` | array | Kode mata kuliah yang boleh diubah |
| `semua` | boolean | Isi `true` kalau boleh mengubah semua mata kuliah |

Kolom `mk` diisi kode materi, bukan nama panjangnya dan bukan kode mata kuliah
di tab Mata Kuliah. Kode yang berlaku sekarang: `pemi`, `mki`, `mo`, `stat2`,
dan `si`. Daftar lengkapnya beserta topiknya ada di `shared/materi-daftar.js`.

Kolom `semua` boleh tidak ditulis sama sekali. Kalau ditulis `true`, kolom `mk`
tidak lagi dipakai dan akun itu boleh mengubah naskah mata kuliah mana pun.
Isian ini disediakan untuk koordinator, supaya daftarnya tidak perlu ditambah
tiap kali ada mata kuliah baru.

### Mencabut akses

Untuk operasional dan admin situs, hapus dokumennya dari koleksi `admins` atau
`adminutama` di Firestore. Efeknya langsung.

Untuk pengajar, buka `/operasional` tab **Akun Pengajar**. Ada tiga pilihan
dengan akibat yang berbeda:

- **Tolak.** Wewenangnya hilang, barisnya tetap ada, dan orangnya melihat
  alasan penolakan saat mencoba masuk. Dipakai kalau memang tidak berhak.
- **Ubah wewenangnya.** Buang centang mata kuliah yang tidak lagi diampu.
  Dipakai saat kepengurusan berganti sebagian.
- **Hapus.** Barisnya hilang sama sekali, dan orangnya bisa mendaftar ulang.
  Dipakai kalau data pengajuannya keliru dan perlu diisi ulang.

Menghapus baris tidak menghapus akun Firebase-nya. Akun itu masih bisa masuk,
tapi tidak punya wewenang apa pun dan hanya melihat layar pengajuan. Kalau
akunnya memang harus dimatikan sekalian, nonaktifkan lewat Firebase Console
pada menu Authentication.

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

**Di `/pengajar`, layarnya berhenti di "Pengajuan sedang ditinjau"**
Memang begitu sampai pengurus operasional memutuskannya. Buka `/operasional`
tab **Akun Pengajar**, lalu terima atau tolak barisnya.

**Di `/pengajar`, tiba-tiba keluar sendiri saat sedang mengetik**
Sesi Firebase berakhir, biasanya karena jaringan mati cukup lama sehingga
pembaruan token gagal. Naskah yang sedang diketik tidak hilang: masuk lagi,
buka topik yang sama, dan naskahnya dipasang kembali beserta pemberitahuan.
Periksa dulu isinya, lalu simpan.

**Masuk ke `/pengajar` malah dilempar ke halaman pendaftaran**
Akun Firebase-nya sudah jadi tapi baris pengajuannya belum tersimpan, biasanya
karena jaringan putus saat mendaftar, atau karena mendaftar sebelum aturan
Firestore sempat dipasang. Formulirnya muncul dengan email yang sudah terkunci
dan tanpa kotak kata sandi, jadi tinggal mengisi nama dan NRP lalu mengirim.
Tidak perlu membuat akun baru.

**Saat mendaftar muncul "Email ini sudah punya akun"**
Email itu pernah dipakai mendaftar. Masuk saja memakai kata sandi lama. Kalau
lupa kata sandinya, minta pengurus mengatur ulang lewat Firebase Console pada
menu Authentication.

**Saat mendaftar muncul "Pendaftaran akun baru sedang dimatikan"**
Di Firebase Console, menu Authentication, pembuatan akun baru sedang ditutup.
Nyalakan lagi kalau pendaftaran pengajar memang sedang dibuka.

**Pendaftar tidak bisa mendaftar ulang setelah ditolak**
Barisnya masih ada, dan satu akun hanya boleh punya satu baris pengajuan. Hapus
barisnya di tab **Akun Pengajar**, baru dia bisa mendaftar lagi.

**Di `/pengajar`, daftar mata kuliahnya kosong padahal sudah diterima**
Saat menerima, mata kuliahnya belum dicentang. Buka barisnya lagi di tab
**Akun Pengajar**, tekan **Ubah**, lalu centang mata kuliahnya.

**Di `/pengajar`, "halaman materinya belum memuat shared/materi.js"**
Halaman materi itu belum dipasangi penerap naskah. Jalankan
`node scripts/periksa-halaman.mjs` untuk tahu halaman mana saja yang kurang.

**Naskah tersimpan di `/pengajar`, tapi halaman materinya masih naskah lama**
Muat ulang halaman materinya dengan Ctrl+F5. Halaman menyimpan salinan naskah
di peramban supaya tidak berkedip saat dibuka, dan salinan itu baru diperbarui
setelah jawaban Firestore yang baru diterima.

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

**Situs tidak bisa dibuka dari wifi kampus, tapi bisa dari koneksi lain**

Pesannya `ERR_CONNECTION_RESET` atau "This site can't be reached". Kalau di
tempat yang sama situsnya bisa dibuka lewat koneksi lain, berarti situsnya
sehat dan yang memutus sambungannya adalah jaringan kampus.

Penyebab yang paling mungkin: jaringan kampus memblokir seluruh domain
`vercel.app`, bukan situs ini secara khusus. Domain itu dipakai bersama oleh
siapa pun yang menumpang layanan gratis Vercel, jadi sering masuk daftar
blokir lembaga secara borongan.

Cara memastikannya, dari wifi kampus:

1. Buka situs `*.vercel.app` lain, misalnya <https://vercel.app>. Kalau ikut
   gagal, berarti yang diblokir seluruh domainnya.
2. Buka <https://vercel.com>. Kalau ini berhasil, dugaan di atas menguat,
   sebab domainnya berbeda meski perusahaannya sama.
3. Buka `chrome://flags/#enable-quic`, setel **Disabled**, mulai ulang
   peramban, lalu coba lagi. Kalau tiba-tiba bisa, penyebabnya bukan blokir
   domain melainkan penyaringan protokol QUIC.

Jalan keluarnya, berurutan dari yang paling menyelesaikan masalah:

| Cara | Biaya | Catatan |
|---|---|---|
| Minta subdomain resmi UBAYA, misalnya `kafbehub.ubaya.ac.id` | gratis | Paling ideal. Jaringan kampus tidak memblokir domainnya sendiri |
| Beli domain sendiri lalu arahkan ke Vercel | sekitar Rp150 ribu per tahun | Berlaku di jaringan mana pun, dan situs tetap bisa pindah penyedia kapan saja |
| Minta tim TI kampus membuka blokir `kafbehub.vercel.app` | gratis | Rapuh: sekali daftar blokirnya diperbarui, bisa tertutup lagi |

Menyuruh mahasiswa memakai kuota atau VPN bukan jalan keluar. Situs ini justru
paling dibutuhkan saat sedang di kampus.

**Cara memasang domain sendiri di Vercel:** buka proyek di Vercel, masuk
**Settings** lalu **Domains**, tambahkan nama domainnya, lalu salin data DNS
yang ditampilkan Vercel ke tempat domain itu dibeli. Sertifikat HTTPS-nya
diurus Vercel sendiri.

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
                              pengumuman
                                    ↓ dirangkum otomatis tiap menyimpan
Mahasiswa →  halaman publik  ←  satu dokumen  publik/terkini
```

Koleksi `log` juga berdiri di luar aliran itu. Isinya ditambah tiap kali ada
yang disimpan atau dihapus, tidak pernah ikut dirangkum ke `publik/terkini`,
dan aturannya hanya mengizinkan menambah, tidak mengubah maupun menghapus.

Dua koleksi lain juga di luar aliran itu, yaitu `classroom` dan `koordinator`.
Keduanya diisi lewat tab Excel, tidak pernah ikut dirangkum ke
`publik/terkini`, dan aturan keamanannya menutup pembacaan untuk siapa pun yang
bukan admin. Isinya kunci masuk kelas daring dan kontak pribadi pengurus.

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

Sebuah halaman boleh menyebut lebih dari satu kunci, dipisah spasi. Halaman
topik materi memakainya supaya ikut tertutup baik saat mata kuliahnya
dimatikan maupun saat topiknya sendiri yang dimatikan:

```html
<body data-fitur-halaman="materi-mo materi-mo-crashing">
```

Yang berlaku adalah status paling membatasi di antara kunci-kunci itu.

Supaya kartu di sebuah kelompok bisa ditukar urutannya, beri kisinya nama:

```html
<div class="card-grid" data-urutan="beranda-berita">
```

Namanya ditulis eksplisit, bukan disimpulkan dari nama halaman atau nama
bagian. Nama bagian seperti "Kepala Halaman" dipakai berulang di banyak
halaman, jadi menyimpulkan kunci dari situ akan membuat urutan satu halaman
merembet ke halaman lain suatu hari nanti.

Kartu yang kuncinya belum tercatat dalam urutan tersimpan tidak hilang, hanya
ditaruh di belakang. Jadi menambah kartu baru tetap aman meski urutannya belum
diperbarui lewat panel.

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
