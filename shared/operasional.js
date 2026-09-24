/*
  Halaman operasional KAFBE Hub.

  PENTING UNTUK YANG MERAWAT BERKAS INI:

  Berkas ini berjalan di peramban pengurus, jadi isinya bisa dibaca siapa pun.
  Jangan pernah menaruh kata sandi, kunci rahasia, atau pemeriksaan keamanan di
  sini. Semua pemeriksaan di bawah hanya untuk KENYAMANAN pemakai, misalnya
  memberi tahu jadwal bentrok sebelum tersimpan.

  Yang benar-benar menjaga data adalah firestore.rules, karena aturan itu
  dijalankan di server Google dan tidak bisa dilewati melalui Console peramban.
*/

import { bacaBerkas, susunBerkas, unduhBlob } from './excel.js';
import {
  bukaStory, buatStory, aturTemplate, adaTemplate, unduhBlobSebagai, TEMPLATE,
  muatDaftarFont, pasangFontGoogle, lengkapiElemen, keTeksStory, pasangPenyunting,
  elemenDariMeta, SATUAN_UKURAN,
} from './gambar-ig.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, limit, startAfter, serverTimestamp,
} = await import(`${SDK}/firebase-firestore.js`);

const app  = initializeApp(window.KAFBE_FIREBASE_CONFIG, 'operasional');
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   1. Alat bantu umum
   ============================================================ */

const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
               'Agustus','September','Oktober','November','Desember'];

const $ = id => document.getElementById(id);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// "07:50" -> 470. Menerima "07.50" juga supaya data lama tetap terbaca.
function keMenit(jam){
  const m = String(jam || '').match(/^(\d{1,2})[:.](\d{2})$/);
  if(!m) return null;
  const j = +m[1], n = +m[2];
  if(j > 23 || n > 59) return null;
  return j * 60 + n;
}

// 470 -> "07.50", bentuk yang digunakan halaman publik.
function keJamTitik(menit){
  const j = Math.floor(menit / 60), n = menit % 60;
  return `${String(j).padStart(2,'0')}.${String(n).padStart(2,'0')}`;
}

function rentangJam(mulai, selesai){
  return `${keJamTitik(keMenit(mulai))} - ${keJamTitik(keMenit(selesai))}`;
}

// Tanggal hari ini menurut zona waktu Jakarta (UTC+7), bukan zona waktu jam
// komputer pemakai. Jika pakai toISOString() biasa, pengumuman bisa dianggap
// belum berakhir karena jamnya masih dini hari menurut UTC padahal di
// Jakarta harinya sudah berganti.
function hariIniJakarta(){
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function hariDariTanggal(iso){
  const [y,m,d] = String(iso).split('-').map(Number);
  if(!y || !m || !d) return null;
  return HARI[new Date(Date.UTC(y, m-1, d)).getUTCDay()];
}

function tanggalPanjang(iso){
  const [y,m,d] = String(iso).split('-').map(Number);
  if(!y) return iso;
  return `${hariDariTanggal(iso)}, ${d} ${BULAN[m-1]} ${y}`;
}

// Dua rentang waktu dianggap bentrok jika saling menimpa, bukan sekadar
// bersentuhan di ujungnya. Kelas 08.00-09.00 dan 09.00-10.00 tidak bentrok.
function beririsan(mulai1, selesai1, mulai2, selesai2){
  return mulai1 < selesai2 && mulai2 < selesai1;
}

function samakanRuang(r){
  return String(r || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/*
  Sebagian "ruang" sebenarnya bukan tempat, melainkan keterangan bahwa kelasnya
  tidak menempati ruangan sama sekali.

  Dua kelas daring pada jam yang sama sama sekali tidak berebut apa pun, tetapi
  pemeriksa bentrok ruangan dulu memperlakukan tulisan ONLINE seperti nama
  ruangan biasa. Akibatnya memindahkan kelas ke hari lain sekaligus menjadikannya
  daring selalu ditolak dengan alasan ruangnya sudah digunakan kelas pengganti
  lain, padahal keduanya memang daring.

  Fungsi ini mengembalikan nama ruang hanya jika ruangnya benar-benar ada.
  Untuk kelas daring, ruang kosong, atau tanda hubung, hasilnya kosong sehingga
  pemeriksaan bentroknya dilewati.
*/
const RUANG_TANPA_TEMPAT = /^(ONLINE|DARING|ZOOM|GMEET|GOOGLE MEET|MS TEAMS|TEAMS)\b/;

function ruangFisik(r){
  const n = samakanRuang(r);
  if(!n || n === '-') return '';
  return RUANG_TANPA_TEMPAT.test(n) ? '' : n;
}

function pesan(el, teks, jenis){
  el.className = 'op-pesan tampil ' + (jenis || '');
  el.innerHTML = teks;
}
function bersihkanPesan(el){
  el.className = 'op-pesan';
  el.innerHTML = '';
}

function daftarKesalahan(judul, list){
  return `${esc(judul)}<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

/*
  Catatan langkah saat mencoba masuk.

  Kegagalan pada tahap ini sulit dilacak karena tersebar di beberapa proses
  asinkron, dan jika salah satunya gagal diam-diam pemakai hanya melihat
  halaman yang tidak bereaksi. Setiap langkah dicatat ke panel yang bisa dibuka
  di layar masuk, sehingga tidak perlu membuka developer tools untuk tahu
  langkah mana yang berhenti.
*/
function diag(teks){
  const el = $('diagnosa');
  if(!el) return;
  $('diagnosaBungkus').hidden = false;
  const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
  el.textContent += `[${jam}] ${teks}\n`;
  console.log('[operasional] ' + teks);
}

let waktuStatus = null;
function status(teks, jenis){
  const el = $('statusSimpan');
  el.hidden = false;
  el.className = 'op-status ' + (jenis || 'sibuk');
  el.textContent = teks;
  clearTimeout(waktuStatus);
  if(jenis === 'benar'){
    waktuStatus = setTimeout(() => { el.hidden = true; }, 4000);
  }
}

/* ============================================================
   2. Masuk dan keluar
   ============================================================ */

// Pesan bawaan Firebase berbahasa Inggris dan sebagian membingungkan,
// jadi diterjemahkan ke kalimat yang bisa ditindaklanjuti pemakai.
function pesanAuth(kode){
  switch(kode){
    case 'auth/invalid-email':
      return 'Format email tidak benar.';
    case 'auth/user-disabled':
      return 'Akun ini dinonaktifkan. Hubungi pemegang akses Firebase Console.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau kata sandi salah.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/network-request-failed':
      return 'Gagal menghubungi server. Periksa koneksi internet Anda.';
    case 'auth/configuration-not-found':
      return 'Metode masuk email dan kata sandi belum diaktifkan di Firebase Console.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah punya akun. Masuk dengan kata sandinya, atau hubungi pengurus kalau lupa.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu pendek. Pakai paling sedikit 8 karakter.';
    default:
      return 'Tidak bisa masuk (' + kode + ').';
  }
}

$('formMasuk').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tombol = $('tombolMasuk');
  bersihkanPesan($('pesanMasuk'));
  tombol.disabled = true;
  tombol.textContent = 'Memeriksa…';
  try{
    diag('Mengirim email dan kata sandi ke Firebase…');
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('sandi').value);
    diag('Kredensial diterima Firebase.');
    $('sandi').value = '';
  }catch(err){
    diag('DITOLAK saat masuk: ' + (err.code || err.message));
    pesan($('pesanMasuk'), esc(pesanAuth(err.code || '')), 'salah');
  }finally{
    tombol.disabled = false;
    tombol.textContent = 'Masuk';
  }
});

$('tombolKeluar').addEventListener('click', () => signOut(auth));

/* ---------- pendaftaran pengurus baru ---------- */

/*
  Pendaftaran berjalan dalam dua langkah yang harus berurutan: membuat akun
  Firebase, lalu menulis baris pengajuan atas nama akun itu. Aturan Firestore
  hanya mengizinkan pemilik akun menulis pengajuannya sendiri, jadi urutannya
  memang tidak bisa dibalik.

  Kalau langkah kedua gagal, akunnya sudah terlanjur jadi. Formulir yang sama
  lalu berpindah ke keadaan melengkapi: kotak email dan kata sandi dilepas,
  dan yang tersisa tinggal nama dan NRP. Keadaan yang sama juga dipakai saat
  akun seperti itu masuk lagi di lain hari.
*/
let sedangMendaftar = false;
let akunLanjutan = null;   // akun yang sudah ada, tinggal pengajuannya

function tampilkanDaftar(buka){
  $('formMasuk').hidden = buka;
  $('formDaftar').hidden = !buka;
  $('catatanMasuk').hidden = buka;
  $('catatanDaftar').hidden = !buka;
  bersihkanPesan($('pesanMasuk'));
  bersihkanPesan($('pesanDaftar'));
  if(buka) $('dfNama').focus();
  else $('email').focus();
}

function pasangModeLanjutan(user){
  akunLanjutan = user;
  $('dfBagianAkun').hidden = true;
  $('dfCatatanLanjutan').hidden = false;
  $('dfCatatanLanjutan').textContent =
    `Akun ${user.email} sudah ada, tinggal pengajuannya yang belum tersimpan. Lengkapi nama dan NRP, lalu kirim.`;
  tampilkanDaftar(true);
}

function lepasModeLanjutan(){
  akunLanjutan = null;
  $('dfBagianAkun').hidden = false;
  $('dfCatatanLanjutan').hidden = true;
}

$('bukaDaftar').addEventListener('click', () => { lepasModeLanjutan(); tampilkanDaftar(true); });
$('bukaMasuk').addEventListener('click', async () => {
  // Kembali dari keadaan melengkapi berarti meninggalkan akun yang sedang
  // masuk. Dikeluarkan dulu supaya halaman masuk benar-benar bersih.
  if(akunLanjutan){
    try{ await signOut(auth); }catch(err){ console.warn('Gagal keluar', err); }
  }
  lepasModeLanjutan();
  tampilkanDaftar(false);
});

$('formDaftar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanDaftar');
  const tombol = $('tombolDaftar');
  bersihkanPesan(el);

  const nama = $('dfNama').value.trim().replace(/\s+/g, ' ');
  const nrp = $('dfNrp').value.trim();
  const email = akunLanjutan ? akunLanjutan.email : $('dfEmail').value.trim().toLowerCase();
  const sandi = $('dfSandi').value;
  const sandi2 = $('dfSandi2').value;

  // Pemeriksaan di sini hanya untuk kenyamanan. Yang benar-benar menolak
  // pengajuan yang tidak sah adalah aturan Firestore.
  const salah = [];
  if(nama.length < 3) salah.push('Nama lengkap paling sedikit 3 huruf.');
  if(!/^[0-9]{6,15}$/.test(nrp)) salah.push('NRP harus berupa angka, 6 sampai 15 digit.');
  if(!akunLanjutan){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) salah.push('Format email tidak benar.');
    if(sandi.length < 8) salah.push('Kata sandi paling sedikit 8 karakter.');
    if(sandi !== sandi2) salah.push('Kata sandi dan ulangannya tidak sama.');
  }
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa dikirim:', salah), 'salah'); return; }

  tombol.disabled = true;
  tombol.textContent = 'Mengirim…';
  sedangMendaftar = true;

  try{
    let user = akunLanjutan;
    if(!user){
      diag('Membuat akun Firebase untuk ' + email + ' …');
      const hasil = await createUserWithEmailAndPassword(auth, email, sandi);
      user = hasil.user;
      diag('Akun dibuat. UID: ' + user.uid);
      $('dfSandi').value = '';
      $('dfSandi2').value = '';
      // Kalau langkah berikutnya gagal, formulir sudah dalam keadaan
      // melengkapi dan percobaan ulang tinggal menekan tombolnya lagi.
      pasangModeLanjutan(user);
    }

    diag('Menulis pengajuan ke adminakun/' + user.uid + ' …');
    await setDoc(doc(db, 'adminakun', user.uid), {
      status: 'menunggu',
      nama, nrp,
      email: user.email,
      dibuatPada: serverTimestamp(),
    });
    diag('Pengajuan tersimpan, menunggu keputusan pengurus.');

    // Akun dikeluarkan lagi: sampai diterima, tidak ada yang bisa dibuka.
    try{ await signOut(auth); }catch(err){ console.warn('Gagal keluar setelah mendaftar', err); }
    lepasModeLanjutan();
    $('formDaftar').reset();
    tampilkanDaftar(false);
    pesan($('pesanMasuk'),
      `Pengajuan atas nama <strong>${esc(nama)}</strong> sudah terkirim. `
      + 'Tunggu pengurus yang sudah ada menerimanya, lalu masuk seperti biasa dengan email dan kata sandi tadi.',
      'benar');
  }catch(err){
    diag('GAGAL mendaftar: ' + (err.code || err.message));
    pesan(el, err.code === 'permission-denied'
      ? 'Server menolak pengajuan ini. Biasanya berarti aturan keamanan Firestore belum diperbarui. Hubungi pengurus operasional.'
      : esc(pesanAuth(err.code || '')), 'salah');
  }finally{
    sedangMendaftar = false;
    tombol.disabled = false;
    tombol.textContent = 'Kirim pengajuan';
  }
});

onAuthStateChanged(auth, async (user) => {
  if(!user){
    $('layarMasuk').hidden = false;
    $('aplikasi').hidden = true;
    return;
  }

  // Selagi mendaftar, akunnya sudah jadi tetapi pengajuannya belum tertulis.
  // Kalau sesi baru itu dinilai sekarang, ia terbaca sebagai akun tanpa
  // pengajuan dan langsung dikeluarkan di tengah pendaftaran.
  if(sedangMendaftar) return;

  diag('Sesi aktif sebagai ' + user.email);
  diag('UID akun ini: ' + user.uid);
  diag('Membaca dokumen admins/' + user.uid + ' …');

  // Punya akun saja tidak cukup. Wewenang ditentukan oleh dokumen di koleksi
  // "admins", dan aturan Firestore memeriksa hal yang sama di sisi server.
  let profil = null;
  let galat = null;
  try{
    const snap = await getDoc(doc(db, 'admins', user.uid));
    diag('Dokumen admins terbaca. Ada isinya? ' + (snap.exists() ? 'YA' : 'TIDAK'));
    if(snap.exists()) profil = snap.data();
  }catch(err){
    console.error('Gagal memeriksa status admin', err);
    diag('GAGAL membaca admins: ' + (err.code || err.message));
    galat = err;
  }

  if(!profil){
    // Pesan dipasang LEBIH DULU, baru keluar. Jika urutannya dibalik dan
    // signOut gagal, pemakai hanya melihat halaman masuk kosong tanpa
    // penjelasan apa pun, dan itu justru yang paling membingungkan.
    if(galat){
      pesan($('pesanMasuk'),
        'Masuk berhasil, tetapi status pengurus tidak bisa diperiksa.<br>'
        + `Pesan aslinya: <code>${esc(galat.message || galat.code || 'tidak diketahui')}</code><br><br>`
        + 'Biasanya ini berarti aturan keamanan Firestore belum terpasang. '
        + 'Lihat langkah 1.4 di PANDUAN-PENGURUS.md.',
        'salah');
      try{ await signOut(auth); }
      catch(err){ console.warn('Gagal keluar setelah penolakan admin', err); }
      return;
    }

    /*
      Akun ini sah, tetapi belum diangkat. Ada tiga kemungkinan, dan pemakai
      berhak tahu yang mana:

        1. Sudah mengajukan dan masih menunggu keputusan.
        2. Sudah diputuskan ditolak, beserta alasannya.
        3. Belum pernah mengajukan, misalnya karena jaringan putus tepat
           setelah akunnya dibuat. Formulirnya dibuka lagi dalam keadaan
           melengkapi, tanpa kotak kata sandi, karena akunnya sudah ada.

      Dulu yang ditampilkan di sini adalah petunjuk mengisi Firebase Console.
      Petunjuk itu tetap ada di rincian teknis, untuk keadaan darurat.
    */
    diag('Membaca pengajuan adminakun/' + user.uid + ' …');
    let ajuan = null;
    try{
      const snap = await getDoc(doc(db, 'adminakun', user.uid));
      if(snap.exists()) ajuan = snap.data();
      diag('Pengajuan ' + (ajuan ? 'ditemukan, status ' + (ajuan.status || 'menunggu') : 'tidak ada'));
    }catch(err){
      diag('GAGAL membaca adminakun: ' + (err.code || err.message));
    }
    diag('Untuk pengangkatan darurat lewat Firebase Console, buat dokumen admins/' + user.uid);

    if(ajuan && (ajuan.status || 'menunggu') === 'ditolak'){
      pesan($('pesanMasuk'),
        'Pengajuan akun ini <strong>ditolak</strong> oleh pengurus.'
        + (ajuan.alasan ? `<br>Alasannya: ${esc(ajuan.alasan)}` : '')
        + '<br><br>Kalau menurut Anda keliru, hubungi pengurus operasional yang masih aktif.',
        'salah');
    }else if(ajuan && ['dicabut', 'diterima'].includes(ajuan.status)){
      // Statusnya diterima atau dicabut, tetapi dokumen admins-nya sudah tidak
      // ada. Keduanya berarti hal yang sama: wewenangnya pernah ada dan kini
      // sudah dicabut, entah dari web maupun dari Firebase Console.
      pesan($('pesanMasuk'),
        'Akun ini <strong>pernah menjadi pengurus</strong>, tetapi wewenangnya sudah dicabut, '
        + 'jadi halaman ini tidak bisa dibuka lagi. Kalau menurut Anda keliru, hubungi pengurus yang masih aktif.',
        'salah');
    }else if(ajuan){
      pesan($('pesanMasuk'),
        'Masuk berhasil. Pengajuan Anda <strong>masih menunggu</strong> keputusan pengurus, '
        + 'jadi halaman ini belum bisa dibuka. Coba lagi setelah ada kabar dari pengurus.',
        'hati');
    }else{
      // Tidak dikeluarkan: menulis pengajuan butuh akun yang sedang masuk.
      // Pesannya dipasang SESUDAH formulirnya dibuka, karena membuka formulir
      // ikut membersihkan pesan lama.
      pasangModeLanjutan(user);
      pesan($('pesanDaftar'),
        'Masuk berhasil, tetapi akun ini belum pernah mengajukan diri sebagai pengurus. '
        + 'Lengkapi pengajuannya di atas, lalu kirim.',
        'hati');
      return;
    }

    try{ await signOut(auth); }
    catch(err){ console.warn('Gagal keluar setelah penolakan admin', err); }
    return;
  }

  diag('Terverifikasi sebagai admin. Membuka halaman…');
  pemakai = { nama: profil.nama || '', email: user.email || '' };
  $('siapa').textContent = (profil.nama ? profil.nama + ' · ' : '') + user.email;
  $('layarMasuk').hidden = true;
  $('aplikasi').hidden = false;
  await muatSemua();
});

/* ============================================================
   3. Memuat data
   ============================================================ */

// Siapa yang sedang menggunakan halaman, diisi setelah login dan digunakan sebagai
// pelaku pada catatan log.
let pemakai = { nama: '', email: '' };

const data = {
  matakuliah: [],
  jadwal: [],
  perubahan: [],
  pengumuman: [],
  pengajar: [],
  // Dua koleksi di bawah hanya digunakan halaman ini dan berkas Excel. Isinya
  // tidak pernah ikut diterbitkan ke dokumen publik.
  classroom: [],
  koordinator: [],
  // Pengajuan akun dari halaman /pengajar. Isinya nama, NRP, dan email orang,
  // jadi tidak pernah ikut diterbitkan ke dokumen publik.
  pengajarakun: [],
  adminakun: [],
  admins: [],
};

/*
  Tiap koleksi diambil sendiri-sendiri dan kegagalannya ditangkap di sini.

  Sebelumnya semuanya diambil dengan Promise.all, sehingga satu koleksi yang
  gagal menjatuhkan seluruh halaman: jadwal, perubahan, dan pengumuman ikut
  kosong padahal tidak bermasalah. Sekarang bagian yang berhasil tetap tampil,
  dan yang gagal dilaporkan sendiri.
*/
const gagalMuat = new Map();   // nama koleksi -> pesan kegagalan

async function ambilKoleksi(nama){
  try{
    const snap = await getDocs(collection(db, nama));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    gagalMuat.delete(nama);
    return out;
  }catch(err){
    console.error(`Gagal memuat koleksi "${nama}"`, err);
    gagalMuat.set(nama, err.code === 'permission-denied'
      ? 'Aturan keamanan Firestore belum mengizinkan koleksi ini. Tempel ulang isi firestore.rules melalui Firebase Console, lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
      : (err.message || 'tidak diketahui'));
    return [];
  }
}

async function muatSemua(){
  status('Memuat data…', 'sibuk');
  try{
    const [mk, jd, pb, pm, pg, gc, ko, ap, ao, ad] = await Promise.all([
      ambilKoleksi('matakuliah'),
      ambilKoleksi('jadwal'),
      ambilKoleksi('perubahan'),
      ambilKoleksi('pengumuman'),
      ambilKoleksi('pengajar'),
      ambilKoleksi('classroom'),
      ambilKoleksi('koordinator'),
      ambilKoleksi('pengajarakun'),
      ambilKoleksi('adminakun'),
      ambilKoleksi('admins'),
    ]);
    data.matakuliah = mk.sort((a,b) => (a.nama||'').localeCompare(b.nama||''));
    data.jadwal = jd;
    data.perubahan = pb.sort((a,b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    data.pengumuman = pm;
    data.pengajar = pg;
    data.classroom = gc;
    data.koordinator = ko;
    // Yang menunggu keputusan diletakkan paling atas, sebab itulah satu-satunya
    // baris yang menuntut pekerjaan dari pengurus.
    data.pengajarakun = ap.sort((a, b) =>
      (a.status === 'menunggu' ? 0 : 1) - (b.status === 'menunggu' ? 0 : 1)
      || String(a.nama || '').localeCompare(String(b.nama || '')));
    data.adminakun = ao.sort((a, b) =>
      (a.status === 'menunggu' ? 0 : 1) - (b.status === 'menunggu' ? 0 : 1)
      || String(a.nama || '').localeCompare(String(b.nama || '')));
    data.admins = ad.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));

    gambarSemua();

    if(gagalMuat.size === 0){
      $('statusSimpan').hidden = true;
    }else{
      status(
        `Sebagian data tidak bisa dimuat: ${[...gagalMuat.keys()].join(', ')}. `
        + 'Bagian lainnya tetap bisa digunakan seperti biasa.', 'salah');
    }
  }catch(err){
    console.error(err);
    status('Gagal memuat data: ' + err.message, 'salah');
  }
}

function gambarSemua(){
  isiPilihanMatkul();
  isiPilihanKelas();
  isiPilihanPengajar();
  isiDaftarKodeMk();
  gambarMatkul();
  gambarJadwal();
  gambarPerubahan();
  gambarKelompok();
  gambarPengajar();
  gambarAkunPengajar();
  gambarAkunOperasional();
  gambarPengurus();
  gambarPengumuman();
  gambarClassroom();
  gambarKoordinator();
}

function namaMatkul(kode){
  const m = data.matakuliah.find(x => x.kode === kode);
  return m ? m.nama : '';
}

/* ============================================================
   4. Tab
   ============================================================ */

document.querySelectorAll('.op-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.op-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.op-panel').forEach(p => {
      p.hidden = p.id !== 'panel-' + btn.dataset.tab;
    });
    // Catatan log baru diambil saat tabnya benar-benar dibuka. Pengurus yang
    // hanya mengubah satu jadwal tidak perlu ikut menanggung pembacaannya.
    if(btn.dataset.tab === 'log' && !logSudahDimuat) muatLog(false);
    if(btn.dataset.tab === 'pr') segarkanTabTemplate();
  });
});

// Tombol "Batal ubah" pada tiap formulir mengembalikannya ke mode tambah.
document.querySelectorAll('[data-batal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const form = $(btn.dataset.batal);
    form.reset();
    form.querySelector('input[type=hidden]').value = '';
    btn.hidden = true;
    bersihkanPesan(form.querySelector('.op-pesan'));
    if(form.id === 'formPerubahan') aturTampilanPerubahan();
  });
});

function modeUbah(formId, aktif){
  const btn = document.querySelector(`[data-batal="${formId}"]`);
  if(btn) btn.hidden = !aktif;
}

/* ============================================================
   4B. Alat bantu catatan log
   ============================================================ */

/*
  Catatan "Ubah" harus menyebut apa yang berubah, bukan sekadar bahwa ada yang
  berubah. Dua fungsi di bawah ini yang menyusun kalimatnya.

  Yang dibandingkan hanya kolom yang disebutkan pemanggil, dan yang ditulis
  hanya kolom yang isinya memang berbeda. Kolom yang sama tidak ikut disebut,
  supaya catatan satu perubahan ruang tidak tenggelam di antara lima kolom
  yang tidak berubah.
*/
function bedaKolom(lama, baru, kolom){
  const out = [];
  for(const k of kolom){
    const a = k.ambil ? k.ambil(lama || {}) : (lama ? lama[k.k] : undefined);
    const b = k.ambil ? k.ambil(baru || {}) : (baru ? baru[k.k] : undefined);
    const ta = String(a == null ? '' : a).trim();
    const tb = String(b == null ? '' : b).trim();
    if(ta === tb) continue;
    out.push(`${k.label} ${ta || 'kosong'} menjadi ${tb || 'kosong'}`);
  }
  return out.join('; ');
}

const KOLOM_LOG = {
  matakuliah: [
    { k:'kode', label:'kode' },
    { k:'nama', label:'nama' },
  ],
  jadwal: [
    { k:'hari', label:'hari' },
    { label:'jam', ambil: x => (x.mulai || x.selesai) ? rentangJam(x.mulai, x.selesai) : '' },
    { k:'ruang', label:'ruang' },
    { k:'kp', label:'KP' },
    { k:'kode', label:'kode' },
  ],
  pengajar: [
    { k:'nama', label:'nama' },
    { k:'nrp', label:'NRP' },
    { label:'kelas', ambil: x => x.kode ? `${namaMatkul(x.kode) || x.kode} KP ${x.kp}` : '' },
  ],
  pengumuman: [
    { k:'judul', label:'judul' },
    { label:'isi', ambil: x => String(x.isi || '').slice(0, 80) + (String(x.isi || '').length > 80 ? '…' : '') },
    { label:'disematkan', ambil: x => x.pin ? 'ya' : 'tidak' },
    { label:'tayang mulai', ambil: x => x.mulai ? tanggalPanjang(x.mulai) : '' },
    { label:'tayang sampai', ambil: x => x.selesai ? tanggalPanjang(x.selesai) : '' },
  ],
  classroom: [
    { k:'classroom', label:'kode kelas' },
    { k:'nama', label:'nama mata kuliah' },
    { k:'kp', label:'KP' },
    { k:'kode', label:'kode' },
  ],
  koordinator: [
    { k:'koordinator', label:'koordinator' },
    { k:'nrp', label:'NRP' },
    { k:'kontak', label:'kontak' },
    { k:'nama', label:'nama mata kuliah' },
  ],
  perubahan: [
    { label:'jenis', ambil: x => LABEL_TIPE_LOG[x.tipe] || x.tipe || '' },
    { label:'tanggal', ambil: x => x.tanggal ? tanggalPanjang(x.tanggal) : '' },
    { label:'tanggal pengganti', ambil: x => x.tanggalBaru ? tanggalPanjang(x.tanggalBaru) : '' },
    { label:'jam pengganti', ambil: x => (x.mulaiBaru && x.selesaiBaru) ? rentangJam(x.mulaiBaru, x.selesaiBaru) : '' },
    { label:'ruang pengganti', ambil: x => x.ruangBaru || '' },
    { k:'catatan', label:'catatan' },
  ],
};

const LABEL_TIPE_LOG = {
  libur: 'ditiadakan',
  daring: 'daring',
  pindah: 'dipindah',
  menyusul: 'dipindah, jadwal menyusul',
  ruang: 'pindah ruang',
};

/*
  Satu kalimat utuh untuk satu perubahan sementara, disusun menurut jenisnya.

  Bentuk mentahnya, misalnya "jenis ruang", tidak menjawab pertanyaan yang
  sebenarnya ditanyakan orang yang membaca log: dari ruang mana ke ruang mana,
  atau dari hari dan jam berapa pindah ke hari dan jam berapa. Kalimat di sini
  menyebut keduanya, dengan data kelas aslinya diambil dari jadwal permanen.
*/
function uraiPerubahan(p){
  const j = data.jadwal.find(x => x.id === p.jadwalId) || {};
  const kelas = `${namaMatkul(p.kode) || p.kode} KP ${p.kp}`;
  const jamAsli = (j.mulai || j.selesai) ? ` ${rentangJam(j.mulai, j.selesai)}` : '';
  const ruangAsli = j.ruang || 'tanpa ruang';
  const asal = `${tanggalPanjang(p.tanggal)}${jamAsli} di ${ruangAsli}`;

  const jamBaru = (p.mulaiBaru && p.selesaiBaru) ? rentangJam(p.mulaiBaru, p.selesaiBaru) : '';
  const tujuanPasti = [
    p.tanggalBaru ? tanggalPanjang(p.tanggalBaru) : '',
    jamBaru,
    p.ruangBaru ? `di ${p.ruangBaru}` : '',
  ].filter(Boolean).join(' ');

  switch(p.tipe){
    case 'libur':
      return `${kelas} ditiadakan pada ${asal}`;
    case 'daring':
      return `${kelas} menjadi daring pada ${asal}`;
    case 'ruang':
      return `${kelas} pada ${tanggalPanjang(p.tanggal)}${jamAsli} pindah ruang dari ${ruangAsli} ke ${p.ruangBaru || 'ruang yang belum diisi'}`;
    case 'pindah':
      return `${kelas} dipindah dari ${asal} ke ${tujuanPasti || 'tujuan yang belum diisi'}`
        + (p.ruangBaru ? '' : ` di ${ruangAsli}`);
    case 'menyusul':
      return `${kelas} dipindah dari ${asal}, penggantinya ${tujuanPasti ? tujuanPasti + ', sisanya menyusul' : 'masih menyusul'}`;
    default:
      return `${kelas} pada ${asal}`;
  }
}

/* ============================================================
   5. Mata kuliah
   ============================================================ */

function gambarMatkul(){
  const t = $('tabelMatkul');
  if(data.matakuliah.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada mata kuliah. Tambahkan melalui formulir di atas.</td></tr></tbody>';
    return;
  }
  t.innerHTML = `
    <thead><tr><th>Kode</th><th>Nama</th><th>Dipakai jadwal</th><th></th></tr></thead>
    <tbody>${data.matakuliah.map(m => {
      const digunakan = data.jadwal.filter(j => j.kode === m.kode).length;
      return `<tr>
        <td><strong>${esc(m.kode)}</strong></td>
        <td>${esc(m.nama)}</td>
        <td class="op-samar">${digunakan} kelas</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-ubah-mk="${esc(m.id)}">Ubah</button>
          <button class="op-mini op-hapus" data-hapus-mk="${esc(m.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-mk]').forEach(b => b.addEventListener('click', () => {
    const m = data.matakuliah.find(x => x.id === b.dataset.ubahMk);
    if(!m) return;
    $('mkId').value = m.id; $('mkKode').value = m.kode; $('mkNama').value = m.nama;
    modeUbah('formMatkul', true);
    $('mkKode').focus();
  }));

  t.querySelectorAll('[data-hapus-mk]').forEach(b => b.addEventListener('click', () => {
    hapusMatkul(b.dataset.hapusMk);
  }));
}

$('formMatkul').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanMatkul');
  const id = $('mkId').value;
  const kode = $('mkKode').value.trim().toUpperCase();
  const nama = $('mkNama').value.trim();

  const salah = [];
  if(!kode) salah.push('Kode tidak boleh kosong.');
  if(!nama) salah.push('Nama tidak boleh kosong.');
  const kembar = data.matakuliah.find(m => m.kode === kode && m.id !== id);
  if(kembar) salah.push(`Kode ${kode} sudah digunakan untuk "${kembar.nama}".`);

  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  try{
    status('Menyimpan…', 'sibuk');
    if(id){
      const lama = data.matakuliah.find(m => m.id === id);
      await updateDoc(doc(db, 'matakuliah', id), { kode, nama });
      await catat('ubah', 'matakuliah', `${kode} · ${nama}`,
        bedaKolom(lama, { kode, nama }, KOLOM_LOG.matakuliah));
      // Kode adalah tali penghubung ke jadwal, jadi jika kode berubah,
      // semua jadwal yang memakainya harus ikut diperbarui. Jika tidak,
      // jadwalnya jadi yatim dan namanya hilang di halaman publik.
      if(lama && lama.kode !== kode){
        const terdampak = data.jadwal.filter(j => j.kode === lama.kode);
        for(const j of terdampak) await updateDoc(doc(db, 'jadwal', j.id), { kode });
        const pbTerdampak = data.perubahan.filter(p => p.kode === lama.kode);
        for(const p of pbTerdampak) await updateDoc(doc(db, 'perubahan', p.id), { kode });
        const pgTerdampak = data.pengajar.filter(p => p.kode === lama.kode);
        for(const p of pgTerdampak) await updateDoc(doc(db, 'pengajar', p.id), { kode });
      }
    }else{
      await addDoc(collection(db, 'matakuliah'), { kode, nama });
      await catat('tambah', 'matakuliah', `${kode} · ${nama}`);
    }
    e.target.reset(); $('mkId').value = ''; modeUbah('formMatkul', false);
    bersihkanPesan(el);
    await muatSemua();
    await terbitkan();
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

async function hapusMatkul(id){
  const m = data.matakuliah.find(x => x.id === id);
  if(!m) return;
  const digunakan = data.jadwal.filter(j => j.kode === m.kode);
  if(digunakan.length){
    pesan($('pesanMatkul'),
      `"${esc(m.nama)}" masih digunakan ${digunakan.length} kelas di Jadwal Permanen. `
      + 'Hapus atau pindahkan kelas-kelas itu dulu supaya jadwal tidak kehilangan namanya.',
      'salah');
    return;
  }
  const pengajarnya = data.pengajar.filter(p => p.kode === m.kode);
  if(pengajarnya.length){
    pesan($('pesanMatkul'),
      `"${esc(m.nama)}" masih punya ${pengajarnya.length} pengajar terdaftar. `
      + 'Hapus dulu datanya di tab Pengajar.',
      'salah');
    return;
  }
  if(!confirm(`Hapus mata kuliah "${m.nama}" (${m.kode})?`)) return;
  try{
    status('Menghapus…', 'sibuk');
    await deleteDoc(doc(db, 'matakuliah', id));
    await catat('hapus', 'matakuliah', `${m.kode} · ${m.nama}`);
    await muatSemua();
    await terbitkan();
  }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
}

/* ============================================================
   6. Jadwal permanen
   ============================================================ */

function isiPilihanMatkul(){
  const opsi = data.matakuliah
    .map(m => `<option value="${esc(m.kode)}">${esc(m.kode)} · ${esc(m.nama)}</option>`).join('');
  $('jdKode').innerHTML = '<option value="">— pilih —</option>' + opsi;
}

function urutJadwal(a, b){
  const ha = HARI.indexOf(a.hari), hb = HARI.indexOf(b.hari);
  if(ha !== hb) return ha - hb;
  return (keMenit(a.mulai) || 0) - (keMenit(b.mulai) || 0);
}

function gambarJadwal(){
  const t = $('tabelJadwal');
  const q = ($('cariJadwal').value || '').trim().toLowerCase();
  const baris = data.jadwal
    .filter(j => !q || [j.kode, namaMatkul(j.kode), j.kp, j.ruang, j.hari].join(' ').toLowerCase().includes(q))
    .sort(urutJadwal);

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      data.jadwal.length ? 'Tidak ada yang cocok dengan pencarian.' : 'Belum ada jadwal.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr><th>Hari</th><th>Jam</th><th>Mata Kuliah</th><th>KP</th><th>Ruang</th><th></th></tr></thead>
    <tbody>${baris.map(j => `<tr>
      <td>${esc(j.hari)}</td>
      <td>${esc(rentangJam(j.mulai, j.selesai))}</td>
      <td>${esc(namaMatkul(j.kode) || '(kode tidak dikenal)')}<br><span class="op-samar">${esc(j.kode)}</span></td>
      <td>${esc(j.kp)}</td>
      <td>${esc(j.ruang || '—')}</td>
      <td><div class="op-tombol-baris">
        <button class="op-mini" data-story-jd="${esc(j.id)}" title="Buat story Instagram perpindahan permanen">Story IG</button>
        <button class="op-mini" data-ubah-jd="${esc(j.id)}">Ubah</button>
        <button class="op-mini op-hapus" data-hapus-jd="${esc(j.id)}">Hapus</button>
      </div></td>
    </tr>`).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-jd]').forEach(b => b.addEventListener('click', () => {
    const j = data.jadwal.find(x => x.id === b.dataset.ubahJd);
    if(!j) return;
    $('jdId').value = j.id; $('jdKode').value = j.kode; $('jdKp').value = j.kp;
    $('jdHari').value = j.hari; $('jdMulai').value = j.mulai;
    $('jdSelesai').value = j.selesai; $('jdRuang').value = j.ruang || '';
    modeUbah('formJadwal', true);
    $('jdKode').focus();
  }));

  t.querySelectorAll('[data-story-jd]').forEach(b => b.addEventListener('click', () => {
    const j = data.jadwal.find(x => x.id === b.dataset.storyJd);
    if(j) bukaStoryPermanen(j, null);
  }));

  t.querySelectorAll('[data-hapus-jd]').forEach(b => b.addEventListener('click', () => {
    hapusJadwal(b.dataset.hapusJd);
  }));
}

$('cariJadwal').addEventListener('input', gambarJadwal);

// Pemeriksaan inilah yang mencegah dua kelas menggunakan ruangan yang sama pada
// jam yang beririsan, dan mencegah satu KP tercatat dua kali.
function periksaJadwal({ id, kode, kp, hari, mulai, selesai, ruang }){
  const salah = [];
  const hati = [];

  if(!kode) salah.push('Mata kuliah belum dipilih.');
  else if(!data.matakuliah.some(m => m.kode === kode))
    salah.push(`Kode ${kode} tidak ada di daftar Mata Kuliah.`);

  if(!kp) salah.push('KP belum diisi.');

  const m1 = keMenit(mulai), m2 = keMenit(selesai);
  if(m1 === null) salah.push('Jam mulai tidak valid.');
  if(m2 === null) salah.push('Jam selesai tidak valid.');
  if(m1 !== null && m2 !== null && m2 <= m1)
    salah.push('Jam selesai harus lebih akhir daripada jam mulai.');

  if(m1 !== null && m2 !== null){
    const kembar = data.jadwal.find(j =>
      j.id !== id && j.kode === kode && String(j.kp).toUpperCase() === String(kp).toUpperCase());
    if(kembar){
      salah.push(`${kode} KP ${kp} sudah terdaftar pada ${kembar.hari} ${rentangJam(kembar.mulai, kembar.selesai)}.`);
    }

    const ruangIni = ruangFisik(ruang);
    if(ruangIni){
      const bentrok = data.jadwal.filter(j =>
        j.id !== id
        && j.hari === hari
        && ruangFisik(j.ruang) === ruangIni
        && beririsan(m1, m2, keMenit(j.mulai), keMenit(j.selesai)));
      for(const b of bentrok){
        salah.push(
          `Ruang ${ruang} sudah digunakan ${b.kode} KP ${b.kp} pada ${b.hari} `
          + `${rentangJam(b.mulai, b.selesai)}.`);
      }
    }else if(!samakanRuang(ruang)){
      hati.push('Ruang dikosongkan, jadi bentrok ruangan tidak bisa diperiksa.');
    }

    // Bukan kesalahan, tetapi pantas ditanyakan: satu mata kuliah dengan dua KP
    // berbeda di jam yang sama biasanya berarti salah ketik KP.
    const barengan = data.jadwal.filter(j =>
      j.id !== id && j.kode === kode && j.hari === hari
      && beririsan(m1, m2, keMenit(j.mulai), keMenit(j.selesai)));
    if(barengan.length){
      hati.push(`${kode} juga punya kelas lain (KP ${barengan.map(b => b.kp).join(', ')}) di jam yang beririsan.`);
    }
  }

  return { salah, hati };
}

$('formJadwal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanJadwal');
  const isi = {
    id: $('jdId').value,
    kode: $('jdKode').value,
    kp: $('jdKp').value.trim().toUpperCase(),
    hari: $('jdHari').value,
    mulai: $('jdMulai').value,
    selesai: $('jdSelesai').value,
    ruang: $('jdRuang').value.trim(),
  };

  const { salah, hati } = periksaJadwal(isi);
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }
  if(hati.length && el.dataset.konfirmasi !== '1'){
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi jika memang benar:', hati), 'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  const muatan = {
    kode: isi.kode, kp: isi.kp, hari: isi.hari,
    mulai: isi.mulai, selesai: isi.selesai, ruang: isi.ruang,
  };

  try{
    status('Menyimpan…', 'sibuk');
    const lamaJd = isi.id ? data.jadwal.find(x => x.id === isi.id) : null;
    if(isi.id) await updateDoc(doc(db, 'jadwal', isi.id), muatan);
    else await addDoc(collection(db, 'jadwal'), muatan);
    await catat(isi.id ? 'ubah' : 'tambah', 'jadwal',
      `${namaMatkul(muatan.kode) || muatan.kode} KP ${muatan.kp} · ${muatan.hari} `
      + `${rentangJam(muatan.mulai, muatan.selesai)} · ${muatan.ruang || 'tanpa ruang'}`,
      lamaJd ? bedaKolom(lamaJd, muatan, KOLOM_LOG.jadwal) : '');
    e.target.reset(); $('jdId').value = ''; modeUbah('formJadwal', false);
    bersihkanPesan(el);
    await muatSemua();
    await terbitkan();

    // Jadwal yang pindah hari, jam, atau ruang biasanya perlu diumumkan.
    // Jadwal lamanya hanya diketahui saat ini, jadi tawarannya muncul di sini.
    const pindah = lamaJd && (lamaJd.hari !== muatan.hari || lamaJd.mulai !== muatan.mulai
      || lamaJd.selesai !== muatan.selesai || samakanRuang(lamaJd.ruang) !== samakanRuang(muatan.ruang));
    if(pindah){
      const lama = { ...lamaJd };
      const baru = { ...muatan };
      pesan(el, 'Jadwal tersimpan. <button type="button" class="op-mini" id="jdStoryBaru">'
        + 'Buat story perpindahan permanen</button>', 'benar');
      $('jdStoryBaru').addEventListener('click', () => bukaStoryPermanen(baru, lama));
    }
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

async function hapusJadwal(id){
  const j = data.jadwal.find(x => x.id === id);
  if(!j) return;
  const terkait = data.perubahan.filter(p => p.jadwalId === id);
  const tambahan = terkait.length
    ? `\n\n${terkait.length} perubahan sementara yang menunjuk kelas ini akan ikut terhapus.` : '';
  if(!confirm(`Hapus kelas ${j.kode} KP ${j.kp} (${j.hari} ${rentangJam(j.mulai, j.selesai)})?${tambahan}`)) return;
  try{
    status('Menghapus…', 'sibuk');
    for(const p of terkait) await deleteDoc(doc(db, 'perubahan', p.id));
    await deleteDoc(doc(db, 'jadwal', id));
    await catat('hapus', 'jadwal',
      `${namaMatkul(j.kode) || j.kode} KP ${j.kp} · ${j.hari} ${rentangJam(j.mulai, j.selesai)}`,
      terkait.length ? `${terkait.length} perubahan sementara ikut terhapus` : '');
    await muatSemua();
    await terbitkan();
  }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
}

/* ============================================================
   7. Perubahan sementara
   ============================================================ */

/*
  Kelas kampus West dikenali dari KP-nya, yang selalu diawali huruf W: WA, WZ,
  dan turunannya. Sisanya kampus utama.
*/
function kampusDari(kp){
  return /^W/i.test(String(kp || '').trim()) ? 'west' : 'utama';
}

/*
  Daftar pilihan kelas menggunakan NAMA mata kuliah, bukan kodenya.

  Kode seperti 1303MW24 tidak dihafal siapa pun, jadi memilih kelas berarti
  mencocokkan kode satu per satu dengan daftar di tab Mata Kuliah. Nama mata
  kuliahnya yang dikenal, jadi itu yang diletakkan paling depan. Kodenya sengaja
  tidak dibuang sama sekali, hanya dipindah ke belakang sebagai penegas jika
  ada dua mata kuliah bernama mirip.

  Pilihannya juga dikelompokkan per hari. Dengan puluhan kelas dalam satu
  daftar, pengelompokan itu yang membuat gulirannya masih bisa diikuti mata.
*/
function isiPilihanKelas(){
  const el = $('pbKelas');
  const terpilih = el.value;

  const saringHari   = $('pbSaringHari') ? $('pbSaringHari').value : '';
  const saringKampus = $('pbSaringKampus') ? $('pbSaringKampus').value : '';

  const cocok = data.jadwal.filter(j =>
    (!saringHari   || j.hari === saringHari) &&
    (!saringKampus || kampusDari(j.kp) === saringKampus));

  const perHari = new Map();
  for(const j of [...cocok].sort(urutJadwal)){
    if(!perHari.has(j.hari)) perHari.set(j.hari, []);
    perHari.get(j.hari).push(j);
  }

  let opsi = '';
  for(const [hari, daftar] of perHari){
    opsi += `<optgroup label="${esc(hari)}">` + daftar.map(j => {
      const nama = namaMatkul(j.kode) || j.kode;
      return `<option value="${esc(j.id)}">`
        + `${esc(nama)} · KP ${esc(j.kp)} · ${esc(rentangJam(j.mulai, j.selesai))}`
        + ` · ${esc(j.ruang || 'tanpa ruang')} · ${esc(j.kode)}</option>`;
    }).join('') + '</optgroup>';
  }

  el.innerHTML = '<option value="">— pilih —</option>' + opsi;

  // Kelas yang sedang dipilih dipertahankan jika masih lolos saringan. Jika
  // tersaring keluar, pilihannya dikosongkan supaya tidak ada kelas tersembunyi
  // yang diam-diam masih terpilih.
  el.value = terpilih;
  if(el.value !== terpilih) el.value = '';

  if($('pbJumlahKelas')){
    $('pbJumlahKelas').textContent = cocok.length === data.jadwal.length
      ? `${data.jadwal.length} kelas`
      : `${cocok.length} dari ${data.jadwal.length} kelas`;
  }
}

// Jenis "daring" dan "libur" tidak butuh ruang maupun tanggal pengganti,
// jadi kolomnya disembunyikan supaya tidak membingungkan.
/*
  Jenis "menyusul" menggunakan kotak isian yang sama dengan "pindah", bedanya
  seluruh kotak itu boleh dikosongkan. Dipakai untuk perpindahan yang sudah
  pasti terjadi tetapi tanggal, jam, atau ruangnya belum ditentukan.
*/
function aturTampilanPerubahan(){
  const tipe = $('pbTipe').value;
  $('barisPindah').hidden = !(tipe === 'pindah' || tipe === 'menyusul');
  $('barisRuang').hidden  = !(tipe === 'pindah' || tipe === 'ruang' || tipe === 'menyusul');
  $('catatanMenyusul').hidden = tipe !== 'menyusul';
}
$('pbTipe').addEventListener('change', aturTampilanPerubahan);
aturTampilanPerubahan();

['pbSaringHari', 'pbSaringKampus'].forEach(id => {
  $(id).addEventListener('change', () => { isiPilihanKelas(); periksaHariLangsung(); });
});

/*
  Tanggal terdampak yang tidak jatuh pada hari kelasnya memang sudah ditolak
  saat menyimpan. Namun menunggu sampai tombol Simpan ditekan berarti pengurus
  sudah terlanjur mengisi seluruh formulir sebelum tahu tanggalnya keliru.

  Pemeriksaan yang sama dijalankan lagi di sini begitu kelas dan tanggalnya
  terisi, jadi ketahuannya di detik itu juga. Ini hanya mendahulukan kabar,
  bukan menggantikan pemeriksaan saat menyimpan.
*/
function periksaHariLangsung(){
  const el = $('pesanHari');
  const j = data.jadwal.find(x => x.id === $('pbKelas').value);
  const tgl = $('pbTanggal').value;

  if(!j || !tgl){ bersihkanPesan(el); return; }

  // tanggalPanjang() sudah memuat nama harinya, jadi harinya tidak perlu
  // disebut dua kali. Yang justru perlu ditegaskan adalah hari kelasnya,
  // sebab itu yang tidak terlihat dari kotak tanggal.
  const hari = hariDariTanggal(tgl);
  if(hari === j.hari){
    pesan(el, `Tanggalnya cocok, kelas ini memang berlangsung hari ${esc(hari)}.`, 'benar');
  }else{
    pesan(el,
      `${esc(tanggalPanjang(tgl))} bukan hari kelas ini. `
      + `${esc(namaMatkul(j.kode) || j.kode)} KP ${esc(j.kp)} berlangsung hari `
      + `<strong>${esc(j.hari)}</strong>. Perbaiki tanggalnya, atau pilih kelas yang lain.`,
      'salah');
  }
}

$('pbKelas').addEventListener('change', periksaHariLangsung);
$('pbTanggal').addEventListener('change', periksaHariLangsung);
$('pbTanggal').addEventListener('input', periksaHariLangsung);

function gambarPerubahan(){
  const t = $('tabelPerubahan');
  if(data.perubahan.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada perubahan sementara.</td></tr></tbody>';
    return;
  }
  const hariIni = hariIniJakarta();
  t.innerHTML = `
    <thead><tr>
      <th class="op-kolom-centang"><input type="checkbox" id="igCentangSemua"
        title="Centang semua perubahan yang belum lewat" aria-label="Centang semua perubahan yang belum lewat" /></th>
      <th>Tanggal</th><th>Jenis</th><th>Kelas</th><th>Keterangan</th><th></th></tr></thead>
    <tbody>${data.perubahan.map(p => {
      const j = data.jadwal.find(x => x.id === p.jadwalId);
      const lewat = p.tanggal < hariIni;
      let ket = esc(p.catatan || '');
      if(p.tipe === 'pindah'){
        ket = `Ke ${esc(tanggalPanjang(p.tanggalBaru))} ${esc(rentangJam(p.mulaiBaru, p.selesaiBaru))}`
            + (p.ruangBaru ? ` di ${esc(p.ruangBaru)}` : '') + (p.catatan ? `<br><span class="op-samar">${esc(p.catatan)}</span>` : '');
      }else if(p.tipe === 'ruang'){
        ket = `Pindah ke ruang ${esc(p.ruangBaru || '?')}`
            + (p.catatan ? `<br><span class="op-samar">${esc(p.catatan)}</span>` : '');
      }else if(p.tipe === 'menyusul'){
        // Yang sudah pasti ditulis apa adanya, sisanya disebut menyusul, supaya
        // sekali lihat ketahuan bagian mana yang masih perlu ditentukan.
        const kapan = p.tanggalBaru
          ? `${esc(tanggalPanjang(p.tanggalBaru))} ${esc(rentangJam(p.mulaiBaru, p.selesaiBaru))}`
          : '<strong>tanggal dan jam menyusul</strong>';
        const tempat = p.ruangBaru ? esc(p.ruangBaru) : '<strong>ruang menyusul</strong>';
        ket = `Ke ${kapan}, di ${tempat}`
            + (p.catatan ? `<br><span class="op-samar">${esc(p.catatan)}</span>` : '');
      }else if(p.tipe === 'daring'){
        ket = 'Kelas berlangsung daring'
            + (p.catatan ? `<br><span class="op-samar">${esc(p.catatan)}</span>` : '');
      }
      if(p.kelompok){
        ket += `<br><span class="op-samar">dari pembuatan massal: ${esc(p.kelompok)}</span>`;
      }
      const label = { libur:'Ditiadakan', daring:'Online', pindah:'Dipindah',
                      menyusul:'Menyusul', ruang:'Ganti ruang' }[p.tipe] || p.tipe;
      return `<tr${lewat ? ' style="opacity:.55"' : ''}>
        <td class="op-kolom-centang"><input type="checkbox" data-pilih-pb="${esc(p.id)}"
          ${igPilih.has(p.id) ? 'checked' : ''} aria-label="Pilih untuk story Instagram" /></td>
        <td>${esc(tanggalPanjang(p.tanggal))}${lewat ? '<br><span class="op-samar">sudah lewat</span>' : ''}</td>
        <td><span class="op-lencana ${esc(p.tipe)}">${esc(label)}</span></td>
        <td>${esc(p.kode)} KP ${esc(p.kp)}${j ? '' : '<br><span class="op-samar">kelas sudah dihapus</span>'}</td>
        <td>${ket}</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-ig-pb="${esc(p.id)}" title="Buat story Instagram untuk perubahan ini">Story IG</button>
          <button class="op-mini" data-ubah-pb="${esc(p.id)}">Ubah</button>
          <button class="op-mini op-hapus" data-hapus-pb="${esc(p.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

  // Centangan dipertahankan antar penggambaran ulang, kecuali untuk
  // perubahan yang sudah tidak ada.
  for(const id of [...igPilih]) if(!data.perubahan.some(p => p.id === id)) igPilih.delete(id);
  perbaruiBilahIg();

  t.querySelectorAll('[data-pilih-pb]').forEach(c => c.addEventListener('change', () => {
    if(c.checked) igPilih.add(c.dataset.pilihPb); else igPilih.delete(c.dataset.pilihPb);
    perbaruiBilahIg();
  }));

  $('igCentangSemua').addEventListener('change', e => {
    const akanDatang = data.perubahan.filter(p => p.tanggal >= hariIni).map(p => p.id);
    if(e.target.checked) akanDatang.forEach(id => igPilih.add(id));
    else igPilih.clear();
    t.querySelectorAll('[data-pilih-pb]').forEach(c => { c.checked = igPilih.has(c.dataset.pilihPb); });
    perbaruiBilahIg();
  });

  t.querySelectorAll('[data-ig-pb]').forEach(b => b.addEventListener('click', () => {
    const p = data.perubahan.find(x => x.id === b.dataset.igPb);
    if(p) bukaIg([p]);
  }));

  t.querySelectorAll('[data-ubah-pb]').forEach(b => b.addEventListener('click', () => {
    const p = data.perubahan.find(x => x.id === b.dataset.ubahPb);
    if(!p) return;
    $('pbId').value = p.id; $('pbTipe').value = p.tipe; $('pbKelas').value = p.jadwalId || '';
    $('pbTanggal').value = p.tanggal || '';
    $('pbTanggalBaru').value = p.tanggalBaru || '';
    $('pbMulai').value = p.mulaiBaru || ''; $('pbSelesai').value = p.selesaiBaru || '';
    $('pbRuang').value = p.ruangBaru || ''; $('pbCatatan').value = p.catatan || '';
    aturTampilanPerubahan(); modeUbah('formPerubahan', true);
    $('pbTipe').focus();
  }));

  t.querySelectorAll('[data-hapus-pb]').forEach(b => b.addEventListener('click', async () => {
    const p = data.perubahan.find(x => x.id === b.dataset.hapusPb);
    if(!p || !confirm(`Hapus perubahan ${p.kode} KP ${p.kp} pada ${tanggalPanjang(p.tanggal)}?`)) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'perubahan', p.id));
      await catat('hapus', 'perubahan', uraiPerubahan(p),
        'Perubahan ini dibatalkan, kelasnya kembali berjalan seperti jadwal permanen');
      await muatSemua();
      await terbitkan();
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

/* ============================================================
   7b-2. Story Instagram
   ============================================================

   Perubahan yang dicentang, atau jadwal permanen yang baru dipindah, disusun
   menjadi kalimat pengumuman untuk mahasiswa, lalu diserahkan ke
   shared/gambar-ig.js untuk ditulis di template story. Tampilan gambarnya
   sendiri diatur di berkas itu, dan template-nya dikelola di tab
   PR.

   Kalimat yang disusun di sini hanya usulan awal. Judul dan kalimat
   pembukanya masih bisa disunting di jendela pratinjau sebelum diunduh.
*/

const igPilih = new Set();

function perbaruiBilahIg(){
  const n = igPilih.size;
  $('igDariCentang').disabled = n === 0;
  $('igDariCentang').textContent = n ? `Buat story Instagram (${n})` : 'Buat story Instagram';
  $('igJumlahCentang').textContent = n
    ? `${n} perubahan dicentang.`
    : 'Centang perubahan untuk dijadikan story Instagram.';
}

$('igDariCentang').addEventListener('click', () => {
  bukaIg(data.perubahan.filter(p => igPilih.has(p.id)));
});

const HARI_PENDEK = { Minggu:'Min', Senin:'Sen', Selasa:'Sel', Rabu:'Rab', Kamis:'Kam', Jumat:'Jum', Sabtu:'Sab' };

function tanggalRingkas(iso){
  const [, m, d] = String(iso).split('-').map(Number);
  if(!m) return iso;
  return `${HARI_PENDEK[hariDariTanggal(iso)] || ''}, ${d} ${BULAN[m-1].slice(0, 3)}`;
}

function butirSementara(p){
  const j = data.jadwal.find(x => x.id === p.jadwalId) || {};
  const jamAsli = (j.mulai || j.selesai) ? rentangJam(j.mulai, j.selesai) : '';
  const ruangAsli = String(j.ruang || '').trim();
  const jamBaru = (p.mulaiBaru && p.selesaiBaru) ? rentangJam(p.mulaiBaru, p.selesaiBaru) : '';
  const asal = [tanggalRingkas(p.tanggal), jamAsli, ruangAsli].filter(Boolean).join(' · ');

  // Jadwal yang berubah ditulis tegas (**...**): isi warna sekunder, tebal,
  // bergaris tepi warna primer. Kata pengantarnya (Semula, Menjadi) biasa.
  let hasil;
  switch(p.tipe){
    case 'libur':  hasil = '**Ditiadakan**'; break;
    case 'daring': hasil = '**Online (daring)**'; break;
    case 'ruang':  hasil = `Menjadi: **ruang ${p.ruangBaru || 'menyusul'}**`; break;
    case 'pindah':
      hasil = 'Menjadi: **' + [tanggalRingkas(p.tanggalBaru), jamBaru, p.ruangBaru || ruangAsli]
        .filter(Boolean).join(' · ') + '**';
      break;
    case 'menyusul': {
      const kapan = p.tanggalBaru
        ? [tanggalRingkas(p.tanggalBaru), jamBaru].filter(Boolean).join(' · ')
        : 'tanggal dan jam menyusul';
      hasil = `Pengganti: **${kapan} · ${p.ruangBaru || 'ruang menyusul'}**`;
      break;
    }
    default: hasil = p.tipe;
  }

  const pindahan = p.tipe === 'pindah' || p.tipe === 'menyusul' || p.tipe === 'ruang';
  return {
    judul: `${namaMatkul(p.kode) || p.kode} KP ${p.kp}`,
    baris: [
      { teks: pindahan ? `Semula: **${asal}**` : asal, gaya: 'lembut' },
      { teks: hasil, gaya: 'tebal' },
      ...(p.catatan ? [{ teks: p.catatan, gaya: 'catatan' }] : []),
    ],
    urut: `${p.tanggal} ${j.mulai || ''} ${p.kode} ${p.kp}`,
  };
}

function kontenSementara(daftar){
  const urut = [...daftar].sort((a, b) =>
    butirSementara(a).urut.localeCompare(butirSementara(b).urut));
  const tipe = new Set(urut.map(p => p.tipe === 'menyusul' ? 'pindah' : p.tipe));
  const kelas = new Set(urut.map(p => `${p.kode}|${p.kp}`));
  const tanggal = new Set(urut.map(p => p.tanggal));
  const satuTipe = tipe.size === 1 ? [...tipe][0] : 'campur';

  const judul = {
    libur:  'Perkuliahan Ditiadakan',
    daring: 'Perkuliahan Online',
    ruang:  'Perpindahan Ruang Sementara',
    pindah: 'Jadwal Perpindahan Sementara',
    campur: 'Perubahan Jadwal Sementara',
  }[satuTipe];

  const kerja = {
    libur:  'perkuliahan *DITIADAKAN* sebagai berikut:',
    daring: 'perkuliahan dilaksanakan secara *ONLINE* sebagai berikut:',
    ruang:  'ruangan perkuliahan akan dipindah *SEMENTARA* sesuai dengan jadwal berikut:',
    pindah: 'perkuliahan akan dipindah *SEMENTARA* sesuai dengan jadwal berikut:',
    campur: 'terdapat perubahan jadwal *SEMENTARA* sebagai berikut:',
  }[satuTipe];

  const p0 = urut[0];
  const siapa = kelas.size === 1
    ? `kelas *${namaMatkul(p0.kode) || p0.kode} KP ${p0.kp}*`
    : 'kelas-kelas berikut';
  const kapan = tanggal.size === 1 ? `, khusus pada *${tanggalPanjang(p0.tanggal)}*` : '';

  return {
    judul,
    isi: `Diharapkan bagi mahasiswa yang mengambil ${siapa}${kapan}, ${kerja}`,
    daftar: urut.map(butirSementara),
  };
}

function teksJadwal(j){
  return `${j.hari}, ${rentangJam(j.mulai, j.selesai)} di ${j.ruang || 'ruang menyusul'}`;
}

// lama boleh kosong, misalnya bila story dibuat dari tombol di tabel dan
// jadwal sebelumnya tidak diketahui.
function kontenPermanen(j, lama){
  const waktu = lama && (lama.hari !== j.hari || lama.mulai !== j.mulai || lama.selesai !== j.selesai);
  const ruang = lama && samakanRuang(lama.ruang) !== samakanRuang(j.ruang);
  const apa = ruang && !waktu ? 'ruangan'
    : waktu && ruang ? 'jadwal dan ruangan kelas'
    : 'jadwal kelas';
  return {
    judul: 'Jadwal Perpindahan Permanen',
    isi: `Diharapkan bagi mahasiswa yang mengambil kelas *${namaMatkul(j.kode) || j.kode} KP ${j.kp}*, `
      + `${apa} akan dipindah *PERMANEN* sebagai berikut:`,
    daftar: [{
      baris: [
        ...(lama ? [{ teks: `Semula: **${teksJadwal(lama)}**`, gaya: 'lembut' }] : []),
        { teks: `${lama ? 'Menjadi: ' : ''}**${teksJadwal(j)}**`, gaya: 'tebal' },
      ],
    }],
  };
}

/*
  Story hanya bisa dibuat di atas template yang diunggah tim. Bila belum ada,
  pengurus diarahkan ke tab PR, alih-alih diberi gambar
  dengan latar yang bukan milik KAFBE.
*/
async function templateSiap(jenis){
  const pakai = await templateUntuk(jenis);
  if(pakai){
    aturTemplate({ ...pakai.t.meta, gambar: pakai.t.gambar });
    return true;
  }
  aturTemplate({});
  if(confirm(`Belum ada template story Instagram untuk ${JENIS_TEMPLATE[jenis].nama.toLowerCase()}.\n\n`
    + 'Buka tab PR untuk mengunggahnya sekarang?')){
    jenisPR = jenis;
    document.querySelector('.op-tab-btn[data-tab="pr"]').click();
  }
  return false;
}

// Jenis template untuk sekumpulan perubahan sementara. Ditiadakan dan
// campuran beberapa jenis memakai template perpindahan jadwal sementara.
function jenisSementara(daftar){
  const tipe = new Set(daftar.map(p => p.tipe));
  if(tipe.size === 1 && tipe.has('ruang')) return 'ruang';
  if(tipe.size === 1 && tipe.has('daring')) return 'online';
  return 'sementara';
}

async function bukaIg(daftar){
  if(daftar.length === 0) return;
  if(!await templateSiap(jenisSementara(daftar))) return;
  const tgl = daftar.map(p => p.tanggal).sort();
  const awal = tgl[0], akhir = tgl[tgl.length - 1];
  bukaStory(kontenSementara(daftar), `kafbe-story-${awal}${awal === akhir ? '' : '-sd-' + akhir}`);
}

async function bukaStoryPermanen(j, lama){
  if(!await templateSiap('permanen')) return;
  bukaStory(kontenPermanen(j, lama),
    `kafbe-story-permanen-${String(namaMatkul(j.kode) || j.kode).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${j.kp}`);
}

/* ---------- Template story (tab PR) ----------

   Firestore tidak punya tempat khusus untuk berkas, dan Firebase Storage
   mensyaratkan paket berbayar. Jadi gambar template disimpan sebagai teks
   base64 di koleksi templateig, dipotong-potong karena satu dokumen Firestore
   paling besar 1 MB:

     templateig/story            { potongan, elemen, font, warna, footerTeks,
                                   namaBerkas, oleh, diunggah }
     templateig/story-potongan-0 { isi: '...' }
     templateig/story-potongan-1 { isi: '...' }

   Itu untuk jenis perpindahan jadwal sementara. Jenis lain memakai nama
   dokumen sendiri dengan susunan yang sama (lihat JENIS_TEMPLATE di bawah),
   misalnya templateig/story-permanen dan templateig/story-permanen-potongan-0.

   Gambarnya diperkecil dulu ke 1080 x 1920 dan dijadikan JPEG, jadi
   biasanya cukup dua atau tiga potongan.
*/

// Jauh di bawah batas 1 MB per dokumen, supaya tiap penulisan kecil dan
// tidak terhenti di jaringan yang lambat.
const UKURAN_POTONGAN = 250000;

/*
  Tiap jenis pengumuman punya template dan pengaturannya sendiri, diatur di
  sub-tab tab PR. Template jenis "sementara" memakai dokumen templateig/story
  yang sudah ada sejak sebelum ada sub-tab, jadi tidak perlu dipindahkan.

  Jenis yang belum punya template sendiri memakai template perpindahan
  jadwal sementara, supaya story tetap bisa dibuat.
*/
const JENIS_TEMPLATE = {
  sementara: { nama: 'Perpindahan jadwal sementara', dok: 'story' },
  permanen:  { nama: 'Perpindahan jadwal permanen', dok: 'story-permanen' },
  ruang:     { nama: 'Perpindahan ruangan sementara', dok: 'story-ruang' },
  online:    { nama: 'Kelas online', dok: 'story-online' },
};
const dokTemplate = jenis => JENIS_TEMPLATE[jenis].dok;

let jenisPR = 'sementara';    // sub-tab yang sedang dibuka di tab PR
let templateIg = null;        // { meta, dataUrl, gambar } milik jenisPR
const janjiTemplate = {};     // jenis -> Promise
const galatTemplate = {};     // jenis -> kegagalan terakhir saat membaca

function muatGambarDari(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('gambar tidak bisa dibaca'));
    img.src = src;
  });
}

async function ambilTemplateIg(jenis){
  const dok = dokTemplate(jenis);
  const snap = await getDoc(doc(db, 'templateig', dok));
  const meta = snap.exists() ? snap.data() : {};
  let dataUrl = '', gambar = null;
  if(meta.potongan > 0){
    const bagian = await Promise.all(Array.from({ length: meta.potongan }, (_, i) =>
      getDoc(doc(db, 'templateig', `${dok}-potongan-${i}`))));
    dataUrl = bagian.map(b => (b.exists() ? b.data().isi : '')).join('');
    try{ gambar = await muatGambarDari(dataUrl); }
    catch(err){ console.error(err); dataUrl = ''; }
  }
  return { meta, dataUrl, gambar };
}

// Template tiap jenis hanya diambil sekali per kunjungan, kecuali diminta ulang.
function siapkanTemplateIg(jenis, ulang = false){
  if(ulang || !janjiTemplate[jenis]){
    delete galatTemplate[jenis];
    janjiTemplate[jenis] = ambilTemplateIg(jenis).catch(err => {
      console.error(err);
      galatTemplate[jenis] = err;
      delete janjiTemplate[jenis];
      return null;
    });
  }
  return janjiTemplate[jenis];
}

// Template yang dipakai untuk membuat story jenis tertentu, dengan cadangan
// template perpindahan jadwal sementara.
async function templateUntuk(jenis){
  const t = await siapkanTemplateIg(jenis);
  if(t?.gambar) return { t, jenis };
  if(jenis !== 'sementara'){
    const c = await siapkanTemplateIg('sementara');
    if(c?.gambar) return { t: c, jenis: 'sementara', cadangan: true };
  }
  return null;
}

// Contoh isi pratinjau tiap sub-tab, satu perubahan saja.
const CONTOH_STORY = {
  sementara: {
    judul: 'Jadwal Perpindahan Sementara',
    isi: 'Diharapkan bagi mahasiswa yang mengambil kelas *Akuntansi Keuangan Menengah I KP B*, '
      + 'khusus pada *Kamis, 2 Oktober 2026*, perkuliahan akan dipindah *SEMENTARA* sesuai dengan jadwal berikut:',
    daftar: [{ judul: 'Akuntansi Keuangan Menengah I KP B', baris: [
      { teks: 'Semula: **Kam, 2 Okt · 13.00 - 14.40 · FG 06.02**' },
      { teks: 'Menjadi: **Jum, 3 Okt · 17.00 - 18.40 · EA 02.05**' },
    ] }],
  },
  permanen: {
    judul: 'Jadwal Perpindahan Permanen',
    isi: 'Diharapkan bagi mahasiswa yang mengambil kelas *Analisis dan Visualisasi Data Bisnis KP B1*, '
      + 'ruangan akan dipindah *PERMANEN* sebagai berikut:',
    daftar: [{ baris: [
      { teks: 'Semula: **Senin, 18.30 - 20.20 di EA 01.03**' },
      { teks: 'Menjadi: **Senin, 18.30 - 20.20 di EA 02.05**' },
    ] }],
  },
  ruang: {
    judul: 'Perpindahan Ruang Sementara',
    isi: 'Diharapkan bagi mahasiswa yang mengambil kelas *Akuntansi Keuangan Menengah I KP B*, '
      + 'khusus pada *Kamis, 2 Oktober 2026*, ruangan perkuliahan akan dipindah *SEMENTARA* sesuai dengan jadwal berikut:',
    daftar: [{ judul: 'Akuntansi Keuangan Menengah I KP B', baris: [
      { teks: 'Semula: **Kam, 2 Okt · 13.00 - 14.40 · FG 06.02**' },
      { teks: 'Menjadi: **ruang TF 02.02**' },
    ] }],
  },
  online: {
    judul: 'Perkuliahan Online',
    isi: 'Diharapkan bagi mahasiswa yang mengambil kelas *Akuntansi Keuangan Menengah I KP B*, '
      + 'khusus pada *Kamis, 2 Oktober 2026*, perkuliahan dilaksanakan secara *ONLINE* sebagai berikut:',
    daftar: [{ judul: 'Akuntansi Keuangan Menengah I KP B', baris: [
      { teks: 'Kam, 2 Okt · 13.00 - 14.40 · FG 06.02' },
      { teks: '**Online (daring)**' },
    ] }],
  },
};

// Posisi dan ukuran keempat elemen yang sedang diatur di tab PR. Posisi
// diubah dengan menyeret di pratinjau, ukuran huruf lewat kotak isian.
let elemenPR = lengkapiElemen({});

// Isian ukuran dan spasi per elemen, dengan id tpl-<elemen>-<kolom>.
const ISIAN_TIPOGRAFI = ['header', 'body', 'daftar', 'footer']
  .flatMap(n => ['ukuran', 'spasiBaris', 'spasiHuruf', 'tebal', 'garis'].map(k => [n, k]));

// Seluruh pengaturan di tab PR. Bentuknya sama dengan yang disimpan di
// templateig/story dan yang diterima aturTemplate().
function pengaturanDariIsian(){
  const angka = (id, bawaan) => {
    const n = Number($(id).value);
    return Number.isFinite(n) && $(id).value !== '' ? n : bawaan;
  };
  const elemen = lengkapiElemen(elemenPR);
  for(const [n, k] of ISIAN_TIPOGRAFI) elemen[n][k] = angka(`tpl-${n}-${k}`, elemen[n][k]);
  for(const n of NAMA_ELEMEN_PR) elemen[n].warnaGaris = $(`tpl-${n}-warnaGaris`).value;
  return {
    garisTegas: angka('tplGarisTegas', TEMPLATE.garisTegasBawaan),
    // Ukuran disimpan dalam satuan Canva (pt); lihat elemenDariMeta.
    satuanUkuran: SATUAN_UKURAN,
    elemen,
    font: { primer: $('tplFontPrimer').value, sekunder: $('tplFontSekunder').value },
    warna: {
      primer: $('tplWarnaPrimer').value, sekunder: $('tplWarnaSekunder').value,
      tegasIsi: $('tplWarnaTegasIsi').value, tegasGaris: $('tplWarnaTegasGaris').value,
    },
    footerTeks: $('tplFooterTeks').value.trim(),
  };
}

// Kotak warna dan kotak kode hex selalu seiring: mengubah salah satunya
// mengubah yang lain. Kode hex yang belum lengkap diabaikan sampai benar.
const NAMA_ELEMEN_PR = ['header', 'body', 'daftar', 'footer'];
const PASANGAN_WARNA = [
  ['tplWarnaPrimer', 'tplHexPrimer'],
  ['tplWarnaSekunder', 'tplHexSekunder'],
  ['tplWarnaTegasIsi', 'tplHexTegasIsi'],
  ['tplWarnaTegasGaris', 'tplHexTegasGaris'],
  ...NAMA_ELEMEN_PR.map(n => [`tpl-${n}-warnaGaris`, `tpl-${n}-hexGaris`]),
];
function aturWarna(idWarna, idHex, nilai){
  $(idWarna).value = nilai;
  $(idHex).value = nilai;
  $(idHex).classList.remove('op-salah-isi');
}

function isiIsianPengaturan(m){
  const ambil = (k, b) => ({ ...TEMPLATE[b], ...(m?.[k] || {}) });
  const f = ambil('font', 'fontBawaan'), w = ambil('warna', 'warnaBawaan');
  elemenPR = elemenDariMeta(m);
  for(const [n, k] of ISIAN_TIPOGRAFI) $(`tpl-${n}-${k}`).value = elemenPR[n][k];
  for(const n of NAMA_ELEMEN_PR) aturWarna(`tpl-${n}-warnaGaris`, `tpl-${n}-hexGaris`, elemenPR[n].warnaGaris);
  $('tplGarisTegas').value = m?.garisTegas ?? TEMPLATE.garisTegasBawaan;
  pilihFont('tplFontPrimer', f.primer); pilihFont('tplFontSekunder', f.sekunder);
  aturWarna('tplWarnaPrimer', 'tplHexPrimer', w.primer);
  aturWarna('tplWarnaSekunder', 'tplHexSekunder', w.sekunder);
  aturWarna('tplWarnaTegasIsi', 'tplHexTegasIsi', w.tegasIsi);
  aturWarna('tplWarnaTegasGaris', 'tplHexTegasGaris', w.tegasGaris);
  $('tplFooterTeks').value = typeof m?.footerTeks === 'string' ? m.footerTeks : TEMPLATE.footerTeksBawaan;
}

/* ---------- Pilihan font ----------

   Daftarnya diambil dari shared/daftar-font.js (seluruh Google Fonts yang
   mendukung huruf Latin), dikelompokkan per jenis. Di bawah tiap pilihan ada
   contoh tulisan dengan font itu, supaya tidak perlu menebak dari namanya.
*/
const JENIS_FONT = { s: 'Sans serif', r: 'Serif', d: 'Display', h: 'Tulisan tangan', m: 'Monospace' };
let pilihanFontSiap = null;

function isiPilihanFont(){
  if(!pilihanFontSiap){
    pilihanFontSiap = muatDaftarFont().then(daftar => {
      const kelompok = Object.entries(JENIS_FONT).map(([k, nama]) =>
        `<optgroup label="${esc(nama)}">${daftar.filter(r => r[1] === k)
          .map(r => `<option value="${esc(r[0])}">${esc(r[0])}</option>`).join('')}</optgroup>`).join('');
      for(const id of ['tplFontPrimer', 'tplFontSekunder']) $(id).innerHTML = kelompok;
    });
  }
  return pilihanFontSiap;
}

// Font yang tersimpan tapi tidak ada di daftar (misalnya daftar sudah lama)
// tetap ditampilkan sebagai pilihan, supaya tidak diam-diam tertukar.
function pilihFont(id, nama){
  const el = $(id);
  if(nama && ![...el.options].some(o => o.value === nama)){
    el.insertAdjacentHTML('afterbegin', `<option value="${esc(nama)}">${esc(nama)}</option>`);
  }
  el.value = nama;
  contohFont(id);
}

async function contohFont(id){
  const nama = $(id).value;
  const el = $(id + 'Contoh');
  if(!nama){ el.textContent = ''; return; }
  el.textContent = 'Memuat contoh…';
  el.style.fontFamily = '';
  const ok = await pasangFontGoogle(nama);
  try{ await document.fonts.load(`400 24px "${nama}"`); }catch{ /* lanjut saja */ }
  if($(id).value !== nama) return;
  el.style.fontFamily = `"${nama}", sans-serif`;
  el.textContent = ok ? 'JADWAL PERPINDAHAN · Diharapkan bagi mahasiswa 0123' : 'Font ini gagal dimuat dari Google Fonts.';
}

/* ---------- Geser posisi langsung di pratinjau ----------

   Sama dengan jendela story: header, body, dan footer tampil sebagai bingkai
   di atas pratinjau yang bisa diseret dan diubah lebarnya. Di tab PR,
   posisinya menjadi posisi awal untuk semua story berikutnya setelah
   disimpan. Contoh teksnya memakai teks footer yang sedang diisi.
*/
const penyuntingPR = pasangPenyunting($('tplKanvas'), {
  ambil: () => elemenPR,
  ubah: e => { elemenPR = e; },
  selesai: () => pratinjauDariIsian(),
});

// Beberapa pratinjau bisa diminta berturut-turut saat mengetik; hanya yang
// terakhir yang dipasang.
let nomorPratinjau = 0;
async function gambarPratinjauTemplate(){
  const ada = adaTemplate();
  $('tplKanvas').hidden = !ada;
  $('tplKosong').hidden = ada;
  if(!ada) return;
  const nomor = ++nomorPratinjau;
  // Cukup satu perubahan sebagai contoh, seperti pengumuman pada umumnya.
  const teks = keTeksStory(CONTOH_STORY[jenisPR]);
  const [kanvas] = await buatStory(teks);
  if(nomor !== nomorPratinjau) return;
  $('tplPratinjau').src = kanvas.toDataURL('image/jpeg', 0.85);
  penyuntingPR.perbarui(kanvas.tataLetak);
}

async function segarkanTabTemplate(ulang = false){
  const jenis = jenisPR;
  document.querySelectorAll('[data-jenis-pr]').forEach(b =>
    b.classList.toggle('active', b.dataset.jenisPr === jenis));
  $('tplJudulJenis').textContent = JENIS_TEMPLATE[jenis].nama;
  const [t] = await Promise.all([siapkanTemplateIg(jenis, ulang), isiPilihanFont()]);
  if(jenis !== jenisPR) return;   // sub-tab sudah berganti selagi memuat
  templateIg = t;
  const galatTemplateIg = galatTemplate[jenis];
  const m = t?.meta || {};
  const unggahan = !!t?.gambar;
  const cadangan = !unggahan && jenis !== 'sementara' && !galatTemplateIg;
  let waktu = '';
  if(m.diunggah?.toDate){
    const d = m.diunggah.toDate();
    waktu = ` pada ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  }
  $('tplStatus').innerHTML = unggahan
    ? `Template periode ini: <strong>${esc(m.namaBerkas || 'template story')}</strong>`
      + `${m.oleh ? `, diunggah oleh ${esc(m.oleh)}` : ''}${esc(waktu)}.`
    : galatTemplateIg
      ? `<strong>Template tidak bisa dibaca:</strong> ${esc(galatTemplateIg.message)}`
        + (galatTemplateIg.code ? ` (kode: ${esc(galatTemplateIg.code)})` : '')
        + (galatTemplateIg.code === 'permission-denied'
          ? '. Pastikan isi firestore.rules terbaru sudah ditempel dan di-Publish.' : '')
      : cadangan
        ? '<strong>Belum ada template khusus untuk jenis ini.</strong> Sampai diunggah, story jenis ini memakai template Perpindahan jadwal sementara. Unggah template baru, atau salin dari jenis lain di bawah.'
        : '<strong>Belum ada template.</strong> Story Instagram belum bisa dibuat sampai template diunggah.';
  $('tplUnduh').hidden = !unggahan;
  $('tplLabelUnggah').firstChild.textContent = unggahan ? 'Ganti template ' : 'Upload template ';
  isiIsianPengaturan(m);
  await gambarPratinjauTemplate();
}

let jedaPratinjau = null;
function pratinjauDariIsian(){
  aturTemplate({ ...pengaturanDariIsian(), gambar: templateIg?.gambar || null });
  clearTimeout(jedaPratinjau);
  jedaPratinjau = setTimeout(gambarPratinjauTemplate, 400);
}

[...ISIAN_TIPOGRAFI.map(([n, k]) => `tpl-${n}-${k}`), 'tplFooterTeks', 'tplGarisTegas']
  .forEach(id => $(id).addEventListener('input', pratinjauDariIsian));

['tplFontPrimer', 'tplFontSekunder'].forEach(id => $(id).addEventListener('change', () => {
  contohFont(id);
  pratinjauDariIsian();
}));

for(const [idWarna, idHex] of PASANGAN_WARNA){
  $(idWarna).addEventListener('input', () => {
    $(idHex).value = $(idWarna).value;
    $(idHex).classList.remove('op-salah-isi');
    pratinjauDariIsian();
  });
  $(idHex).addEventListener('input', () => {
    let v = $(idHex).value.trim();
    if(v && v[0] !== '#') v = '#' + v;
    // Bentuk singkat #abc diperluas menjadi #aabbcc, karena kotak warna
    // hanya menerima bentuk enam digit.
    if(/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join('');
    const sah = /^#[0-9a-f]{6}$/i.test(v);
    $(idHex).classList.toggle('op-salah-isi', !sah);
    if(!sah) return;
    $(idWarna).value = v.toLowerCase();
    pratinjauDariIsian();
  });
}

$('tplSimpan').addEventListener('click', async () => {
  const el = $('pesanTemplate');
  const atur = pengaturanDariIsian();
  const { elemen, font, warna, footerTeks } = atur;
  const salah = [];
  for(const n of ['header', 'body', 'daftar', 'footer']){
    const e = elemen[n];
    if(!(e.ukuran >= 8 && e.ukuran <= 150)) salah.push(`Ukuran ${n} harus antara 8 dan 150 pt.`);
    if(!(e.spasiBaris >= 0.5 && e.spasiBaris <= 3)) salah.push(`Spasi baris ${n} harus antara 0.5 dan 3.`);
    if(!(e.spasiHuruf >= -200 && e.spasiHuruf <= 800)) salah.push(`Spasi huruf ${n} harus antara -200 dan 800.`);
    if(!(e.garis >= 0 && e.garis <= 40)) salah.push(`Garis tepi ${n} harus antara 0 dan 40 px.`);
  }
  if(!(atur.garisTegas >= 0 && atur.garisTegas <= 40)) salah.push('Garis tepi teks perpindahan harus antara 0 dan 40 px.');
  if(PASANGAN_WARNA.some(([, h]) => $(h).classList.contains('op-salah-isi'))) salah.push('Ada kode warna yang belum benar. Tulis enam digit, misalnya #13192f.');
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  try{
    await setDoc(doc(db, 'templateig', dokTemplate(jenisPR)), atur, { merge: true });
    await catat('ubah', 'template story', `Pengaturan template story diubah: ${JENIS_TEMPLATE[jenisPR].nama}`,
      `font ${font.primer} / ${font.sekunder}; ukuran ${elemen.header.ukuran}/${elemen.body.ukuran}/${elemen.daftar.ukuran}/${elemen.footer.ukuran}; `
      + `warna ${warna.primer} / ${warna.sekunder}; footer "${footerTeks.slice(0, 60)}"`);
    await segarkanTabTemplate(true);
    pesan(el, 'Pengaturan tersimpan dan berlaku untuk semua story berikutnya.', 'benar');
  }catch(err){
    console.error(err);
    pesan(el, 'Gagal menyimpan pengaturan: ' + esc(err.message)
      + (err.code ? ` <span class="op-samar">(kode: ${esc(err.code)})</span>` : ''), 'salah');
  }
});

$('tplPengaturanAwal').addEventListener('click', () => {
  isiIsianPengaturan({});
  pratinjauDariIsian();
  pesan($('pesanTemplate'), 'Semua pengaturan dikembalikan ke awal. Tekan Simpan pengaturan untuk menyimpannya.', 'hati');
});

$('tplUnduh').addEventListener('click', async () => {
  const t = await siapkanTemplateIg(jenisPR);
  if(t?.gambar && t.dataUrl){
    // Tidak memakai fetch(dataUrl), karena connect-src halaman ini tidak
    // mengizinkan data:.
    const [kepala, isi] = t.dataUrl.split(',');
    const biner = atob(isi);
    const byte = new Uint8Array(biner.length);
    for(let i = 0; i < biner.length; i++) byte[i] = biner.charCodeAt(i);
    const tipe = (kepala.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    unduhBlobSebagai(new Blob([byte], { type: tipe }), `template-story-kafbe-${jenisPR}.jpg`);
  }
});

$('tplBerkas').addEventListener('change', async e => {
  const el = $('pesanTemplate');
  const berkas = e.target.files[0];
  // Jenisnya dikunci di awal, supaya berpindah sub-tab selagi mengunggah
  // tidak membuat template tersimpan di jenis yang salah.
  const jenisUnggah = jenisPR;
  const dok = dokTemplate(jenisUnggah);
  e.target.value = '';
  if(!berkas) return;
  // Sebagian sistem tidak mengisi jenis berkas, jadi ekstensinya ikut dilihat.
  if(!/^image\/(png|jpeg|webp)$/.test(berkas.type) && !/\.(png|jpe?g|webp)$/i.test(berkas.name)){
    pesan(el, 'Berkasnya harus gambar PNG, JPG, atau WEBP.', 'salah');
    return;
  }
  if(templateIg?.gambar && !confirm(
    `Ganti template yang sekarang (${templateIg.meta.namaBerkas || 'template lama'}) dengan ${berkas.name}?\n\n`
    + 'Template lama akan terhapus. Unduh dulu bila masih ingin menyimpannya.')) return;

  // Langkah yang sedang berjalan ikut disebut bila gagal, supaya penyebabnya
  // bisa dilacak tanpa membuka Console peramban.
  let langkah = 'membaca berkas';
  try{
    status('Mengunggah template…', 'sibuk');
    // Dibaca sebagai data URL, bukan blob URL: aturan keamanan halaman ini
    // (Content-Security-Policy img-src) hanya mengizinkan 'self' dan data:.
    const img = await muatGambarDari(await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('berkas tidak bisa dibaca'));
      r.readAsDataURL(berkas);
    }));

    langkah = 'menyiapkan gambar';
    const { w, h } = TEMPLATE;
    const kanvas = document.createElement('canvas');
    kanvas.width = w; kanvas.height = h;
    const ctx = kanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    const r = Math.max(w / img.width, h / img.height);
    ctx.drawImage(img, (w - img.width * r) / 2, (h - img.height * r) / 2, img.width * r, img.height * r);

    let mutu = 0.9;
    let dataUrl = kanvas.toDataURL('image/jpeg', mutu);
    while(dataUrl.length > 1500000 && mutu > 0.5){
      mutu -= 0.1;
      dataUrl = kanvas.toDataURL('image/jpeg', mutu);
    }

    const potongan = [];
    for(let i = 0; i < dataUrl.length; i += UKURAN_POTONGAN) potongan.push(dataUrl.slice(i, i + UKURAN_POTONGAN));
    const lama = templateIg?.meta?.potongan || 0;

    // Potongan ditulis satu per satu karena satu transaksi Firestore dibatasi
    // 10 MB. Dokumen utamanya ditulis paling akhir, jadi selama unggahan
    // belum selesai, template lama tetap dipakai utuh.
    for(let i = 0; i < potongan.length; i++){
      langkah = `menyimpan bagian ${i + 1} dari ${potongan.length}`;
      await setDoc(doc(db, 'templateig', `${dok}-potongan-${i}`), { isi: potongan[i] });
    }
    langkah = 'menyimpan info template';
    await setDoc(doc(db, 'templateig', dok), {
      potongan: potongan.length,
      ...pengaturanDariIsian(),
      namaBerkas: berkas.name,
      oleh: pemakai.nama || pemakai.email || '',
      diunggah: serverTimestamp(),
    });
    langkah = 'menghapus sisa template lama';
    for(let i = potongan.length; i < lama; i++){
      await deleteDoc(doc(db, 'templateig', `${dok}-potongan-${i}`));
    }

    await catat('ubah', 'template story', `Template story diganti: ${JENIS_TEMPLATE[jenisUnggah].nama}`, berkas.name);
    langkah = 'memuat ulang template';
    await segarkanTabTemplate(true);
    $('statusSimpan').hidden = true;

    const rasio = img.width / img.height;
    pesan(el, Math.abs(rasio - w / h) > 0.02
      ? `Template tersimpan, tetapi ukurannya ${img.width} × ${img.height}, bukan 9:16, jadi bagian tepinya terpotong. Periksa pratinjaunya.`
      : 'Template tersimpan. Periksa pratinjaunya, lalu sesuaikan area teks, font, dan warna bila perlu.',
      Math.abs(rasio - w / h) > 0.02 ? 'hati' : 'benar');
  }catch(err){
    console.error(err);
    status('Gagal mengunggah template.', 'salah');
    const izin = err.code === 'permission-denied'
      ? ' Aturan Firestore belum mengizinkan koleksi templateig. Pastikan isi firestore.rules terbaru sudah ditempel dan di-Publish (langkah 1.4 di PANDUAN-PENGURUS.md).'
      : '';
    pesan(el, `Gagal mengunggah template saat ${esc(langkah)}: ${esc(err.message)}`
      + (err.code ? ` <span class="op-samar">(kode: ${esc(err.code)})</span>` : '') + esc(izin), 'salah');
  }
});


/* ---------- Sub-tab jenis pengumuman dan salin pengaturan ---------- */

document.querySelectorAll('[data-jenis-pr]').forEach(b => b.addEventListener('click', () => {
  if(jenisPR === b.dataset.jenisPr) return;
  jenisPR = b.dataset.jenisPr;
  bersihkanPesan($('pesanTemplate'));
  isiPilihanSalin();
  segarkanTabTemplate();
}));

function isiPilihanSalin(){
  $('tplSalinDari').innerHTML = Object.entries(JENIS_TEMPLATE)
    .filter(([k]) => k !== jenisPR)
    .map(([k, v]) => `<option value="${k}">${esc(v.nama)}</option>`).join('');
}
isiPilihanSalin();

/*
  Menyalin template (gambar dan seluruh pengaturannya) dari jenis lain ke
  sub-tab yang sedang dibuka, supaya tiap jenis tidak perlu diatur dari nol.
*/
$('tplSalin').addEventListener('click', async () => {
  const el = $('pesanTemplate');
  const dari = $('tplSalinDari').value;
  const ke = jenisPR;
  const sumber = await siapkanTemplateIg(dari);
  if(!sumber?.gambar){
    pesan(el, `${esc(JENIS_TEMPLATE[dari].nama)} belum punya template untuk disalin.`, 'salah');
    return;
  }
  if(!confirm(`Salin template dan seluruh pengaturan ${JENIS_TEMPLATE[dari].nama} ke ${JENIS_TEMPLATE[ke].nama}?`
    + (templateIg?.gambar ? '\n\nTemplate dan pengaturan yang sekarang akan tertimpa.' : ''))) return;

  try{
    status('Menyalin template…', 'sibuk');
    const dok = dokTemplate(ke);
    const lama = (await siapkanTemplateIg(ke))?.meta?.potongan || 0;
    const { potongan: jumlah, ...pengaturan } = sumber.meta;
    const potongan = [];
    for(let i = 0; i < sumber.dataUrl.length; i += UKURAN_POTONGAN) potongan.push(sumber.dataUrl.slice(i, i + UKURAN_POTONGAN));
    for(let i = 0; i < potongan.length; i++){
      await setDoc(doc(db, 'templateig', `${dok}-potongan-${i}`), { isi: potongan[i] });
    }
    await setDoc(doc(db, 'templateig', dok), {
      ...pengaturan,
      potongan: potongan.length,
      oleh: pemakai.nama || pemakai.email || '',
      diunggah: serverTimestamp(),
    });
    for(let i = potongan.length; i < lama; i++) await deleteDoc(doc(db, 'templateig', `${dok}-potongan-${i}`));
    await catat('ubah', 'template story', `Template story disalin ke ${JENIS_TEMPLATE[ke].nama}`,
      `Dari ${JENIS_TEMPLATE[dari].nama}`);
    $('statusSimpan').hidden = true;
    await segarkanTabTemplate(true);
    pesan(el, `Tersalin dari ${esc(JENIS_TEMPLATE[dari].nama)}. Sesuaikan lalu tekan Simpan pengaturan bila perlu.`, 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyalin template.', 'salah');
    pesan(el, 'Gagal menyalin template: ' + esc(err.message)
      + (err.code ? ` <span class="op-samar">(kode: ${esc(err.code)})</span>` : ''), 'salah');
  }
});

function periksaPerubahan(isi){
  const salah = [];
  const hati = [];
  const j = data.jadwal.find(x => x.id === isi.jadwalId);

  if(!j){ salah.push('Kelas belum dipilih.'); return { salah, hati }; }
  if(!isi.tanggal){ salah.push('Tanggal terdampak belum diisi.'); return { salah, hati }; }

  // Tanggal harus jatuh pada hari kelas itu berlangsung. Tanpa pemeriksaan ini
  // orang mudah salah pilih tanggal dan perubahannya tidak pernah muncul.
  const hari = hariDariTanggal(isi.tanggal);
  if(hari !== j.hari){
    salah.push(`${tanggalPanjang(isi.tanggal)} jatuh pada ${hari}, sedangkan kelas ini berlangsung hari ${j.hari}.`);
  }

  const kembar = data.perubahan.find(p =>
    p.id !== isi.id && p.jadwalId === isi.jadwalId && p.tanggal === isi.tanggal);
  if(kembar) salah.push('Kelas ini sudah punya perubahan lain pada tanggal yang sama.');

  if(isi.tipe === 'ruang' && !samakanRuang(isi.ruangBaru)){
    salah.push('Ruang baru belum diisi.');
  }

  if(isi.tipe === 'pindah' || isi.tipe === 'menyusul'){
    const belumPasti = isi.tipe === 'menyusul';
    const m1 = keMenit(isi.mulaiBaru), m2 = keMenit(isi.selesaiBaru);

    /*
      Untuk "pindah" semuanya wajib. Untuk "menyusul" semuanya boleh kosong,
      sebab justru ketidakpastian itulah yang sedang dicatat.

      Yang tetap ditolak pada "menyusul" adalah pengisian yang setengah jalan,
      misalnya jam mulai diisi tetapi jam selesai tidak. Keadaan begitu bukan
      "belum ditentukan", melainkan kemungkinan besar lupa mengisi, dan jika
      diteruskan akan tampil ke mahasiswa sebagai jam yang tidak masuk akal.
    */
    if(!belumPasti){
      if(!isi.tanggalBaru) salah.push('Tanggal pengganti belum diisi.');
      if(m1 === null || m2 === null) salah.push('Jam pengganti belum lengkap.');
    }else{
      if((m1 === null) !== (m2 === null)){
        salah.push('Jam pengganti baru terisi sebagian. Isi keduanya, atau kosongkan keduanya supaya tampil sebagai menyusul.');
      }
      if(isi.tanggalBaru && (m1 === null || m2 === null)){
        salah.push('Tanggal pengganti sudah diisi, jadi jam mulai dan jam selesainya juga perlu diisi.');
      }
      if(!isi.tanggalBaru && m1 !== null){
        salah.push('Jam pengganti sudah diisi, jadi tanggalnya juga perlu diisi.');
      }
    }

    if(m1 !== null && m2 !== null && m2 <= m1){
      salah.push('Jam selesai pengganti harus lebih akhir daripada jam mulai.');
    }

    if(isi.tanggalBaru && isi.tanggalBaru === isi.tanggal){
      salah.push('Tanggal pengganti sama dengan tanggal aslinya.');
    }

    if(isi.tanggalBaru && m1 !== null && m2 !== null){
      const hariBaru = hariDariTanggal(isi.tanggalBaru);

      /*
        Ruang yang benar-benar digunakan kelas pengganti ini: yang diisi di kotak
        Ruang baru jika ada, jika kosong berarti tetap menggunakan ruang aslinya.

        Jika yang diisi ternyata bukan ruang fisik, misalnya ONLINE, hasilnya
        kosong dan seluruh pemeriksaan bentrok ruangan dilewati. Sengaja TIDAK
        jatuh kembali ke ruang asli dalam keadaan itu, sebab kelas yang sudah
        dipindah ke daring memang tidak lagi menempati ruang aslinya.
      */
      const ruang = samakanRuang(isi.ruangBaru)
        ? ruangFisik(isi.ruangBaru)
        : ruangFisik(j.ruang);

      // Kelas pengganti tidak boleh menabrak kelas rutin di ruangan yang sama.
      if(ruang){
        const bentrok = data.jadwal.filter(x =>
          x.hari === hariBaru
          && ruangFisik(x.ruang) === ruang
          && beririsan(m1, m2, keMenit(x.mulai), keMenit(x.selesai)));
        for(const b of bentrok){
          salah.push(`Ruang ${isi.ruangBaru || j.ruang} sudah digunakan ${b.kode} KP ${b.kp} setiap ${b.hari} ${rentangJam(b.mulai, b.selesai)}.`);
        }
      }

      // Dan tidak boleh menabrak kelas pengganti lain di tanggal yang sama.
      // Kelas pengganti dari jenis "menyusul" yang tanggal dan jamnya sudah
      // terisi menempati ruang sungguhan juga, jadi ikut diperiksa.
      const gantiLain = data.perubahan.filter(p =>
        p.id !== isi.id
        && (p.tipe === 'pindah' || p.tipe === 'menyusul')
        && p.tanggalBaru === isi.tanggalBaru);
      for(const p of gantiLain){
        // Ruang kelas pengganti lain dicari dengan aturan yang sama. Dulu yang
        // dibaca hanya ruangBaru miliknya, sehingga kelas pengganti yang tetap
        // menggunakan ruang aslinya luput dari pemeriksaan.
        const asal = data.jadwal.find(x => x.id === p.jadwalId);
        const ruangLain = samakanRuang(p.ruangBaru)
          ? ruangFisik(p.ruangBaru)
          : ruangFisik(asal && asal.ruang);

        if(ruang && ruangLain === ruang
           && beririsan(m1, m2, keMenit(p.mulaiBaru), keMenit(p.selesaiBaru))){
          salah.push(`Ruang itu sudah digunakan kelas pengganti ${p.kode} KP ${p.kp} pada tanggal yang sama.`);
        }
      }

      const durasiAsli = keMenit(j.selesai) - keMenit(j.mulai);
      if(Math.abs((m2 - m1) - durasiAsli) > 10){
        hati.push(`Durasi pengganti ${m2-m1} menit, aslinya ${durasiAsli} menit. Pastikan bukan salah ketik.`);
      }
    }
  }

  return { salah, hati };
}

$('formPerubahan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanPerubahan');
  const j = data.jadwal.find(x => x.id === $('pbKelas').value);

  const isi = {
    id: $('pbId').value,
    tipe: $('pbTipe').value,
    jadwalId: $('pbKelas').value,
    tanggal: $('pbTanggal').value,
    tanggalBaru: $('pbTanggalBaru').value,
    mulaiBaru: $('pbMulai').value,
    selesaiBaru: $('pbSelesai').value,
    ruangBaru: $('pbRuang').value.trim(),
    catatan: $('pbCatatan').value.trim(),
  };

  const { salah, hati } = periksaPerubahan(isi);
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }
  if(hati.length && el.dataset.konfirmasi !== '1'){
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi jika memang benar:', hati), 'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  const muatan = {
    tipe: isi.tipe, jadwalId: isi.jadwalId, kode: j.kode, kp: j.kp,
    tanggal: isi.tanggal, catatan: isi.catatan,
    tanggalBaru: (isi.tipe === 'pindah' || isi.tipe === 'menyusul') ? isi.tanggalBaru : '',
    mulaiBaru:   (isi.tipe === 'pindah' || isi.tipe === 'menyusul') ? isi.mulaiBaru : '',
    selesaiBaru: (isi.tipe === 'pindah' || isi.tipe === 'menyusul') ? isi.selesaiBaru : '',
    ruangBaru:   (isi.tipe === 'pindah' || isi.tipe === 'menyusul' || isi.tipe === 'ruang') ? isi.ruangBaru : '',
  };

  try{
    status('Menyimpan…', 'sibuk');
    const lamaPb = isi.id ? data.perubahan.find(x => x.id === isi.id) : null;
    if(isi.id) await updateDoc(doc(db, 'perubahan', isi.id), muatan);
    else await addDoc(collection(db, 'perubahan'), muatan);
    await catat(isi.id ? 'ubah' : 'tambah', 'perubahan', uraiPerubahan(muatan),
      lamaPb ? bedaKolom(lamaPb, muatan, KOLOM_LOG.perubahan) : (muatan.catatan || ''));
    e.target.reset(); $('pbId').value = ''; modeUbah('formPerubahan', false);
    aturTampilanPerubahan(); bersihkanPesan(el);
    await muatSemua();
    await terbitkan();
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

/* ============================================================
   7b. Pembuatan massal
   ============================================================

   Memasukkan perubahan satu per satu tidak masuk akal untuk kejadian yang
   menyentuh puluhan kelas sekaligus, misalnya sepekan kuliah daring saat
   orientasi. Di sini pengurus memilih rentang tanggal, mencentang kelas mana
   saja yang terdampak, lalu semuanya dibuat sekali jalan.

   Tiap hasilnya diberi penanda kelompok. Tanpa penanda itu, membatalkan
   pembuatan massal berarti menghapus puluhan baris satu per satu, dan
   pengurus kembali ke persoalan yang sama.
*/

// Semua tanggal antara dua tanggal, termasuk kedua ujungnya.
function rentangTanggal(dari, sampai){
  const out = [];
  const a = new Date(dari + 'T00:00:00Z');
  const b = new Date(sampai + 'T00:00:00Z');
  if(isNaN(a) || isNaN(b) || b < a) return out;
  for(let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)){
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

let massalKandidat = [];   // { jadwalId, tanggalList[] }

$('msTampilkan').addEventListener('click', () => {
  const el = $('pesanMassal');
  const dari = $('msDari').value, sampai = $('msSampai').value;
  bersihkanPesan(el);
  $('msDaftar').innerHTML = '';
  $('msAksi').hidden = true;
  massalKandidat = [];

  if(!dari || !sampai){ pesan(el, 'Isi dulu tanggal mulai dan tanggal akhirnya.', 'salah'); return; }
  const tanggalList = rentangTanggal(dari, sampai);
  if(tanggalList.length === 0){ pesan(el, 'Tanggal akhir mendahului tanggal mulai.', 'salah'); return; }
  if(tanggalList.length > 31){ pesan(el, 'Rentangnya lebih dari 31 hari. Persempit dulu supaya tidak salah buat.', 'salah'); return; }

  // Satu kelas bisa muncul beberapa kali dalam rentang, misalnya rentang dua
  // pekan. Pencentangannya tetap per kelas, lalu entri dibuat untuk setiap
  // kemunculannya.
  const peta = new Map();
  for(const tgl of tanggalList){
    const hari = HARI[new Date(tgl + 'T00:00:00Z').getUTCDay()];
    for(const j of data.jadwal.filter(x => x.hari === hari)){
      if(!peta.has(j.id)) peta.set(j.id, []);
      peta.get(j.id).push(tgl);
    }
  }

  if(peta.size === 0){ pesan(el, 'Tidak ada kelas yang jatuh pada rentang tanggal itu.', 'salah'); return; }

  massalKandidat = [...peta.entries()].map(([jadwalId, tgls]) => ({
    jadwalId, tanggalList: tgls,
  })).sort((a, b) => {
    const ja = data.jadwal.find(x => x.id === a.jadwalId);
    const jb = data.jadwal.find(x => x.id === b.jadwalId);
    return urutJadwal(ja, jb);
  });

  const baris = massalKandidat.map(k => {
    const j = data.jadwal.find(x => x.id === k.jadwalId);
    return `<label class="op-centang-baris">
      <input type="checkbox" data-massal="${esc(k.jadwalId)}" checked />
      <span>
        <strong>${esc(namaMatkul(j.kode) || j.kode)}</strong> KP ${esc(j.kp)}
        <span class="op-samar">· ${esc(j.hari)} ${esc(rentangJam(j.mulai, j.selesai))} · ${esc(j.ruang || 'tanpa ruang')}
        · ${k.tanggalList.length} tanggal</span>
      </span>
    </label>`;
  }).join('');

  const jumlahTercentang = massalKandidat.length;
  $('msDaftar').innerHTML = `
    <div class="op-massal-kepala">
      <strong>${massalKandidat.length} kelas</strong> jatuh pada ${tanggalList.length} hari terpilih.
      <button type="button" class="op-mini" id="msSemua">Centang semua</button>
      <button type="button" class="op-mini" id="msKosong">Hapus semua centang</button>
    </div>
    <div class="op-massal-daftar">${baris}</div>`;

  $('msSemua').addEventListener('click', () =>
    $('msDaftar').querySelectorAll('[data-massal]').forEach(c => c.checked = true));
  $('msKosong').addEventListener('click', () =>
    $('msDaftar').querySelectorAll('[data-massal]').forEach(c => c.checked = false));

  $('msAksi').hidden = false;
  pesan(el, `${jumlahTercentang} kelas tercentang. Hapus centang pada kelas yang tidak terdampak, lalu tekan "Buat sekaligus".`, 'hati');
});

$('msBuat').addEventListener('click', async () => {
  const el = $('pesanMassal');
  const tipe = $('msTipe').value;
  const catatan = $('msCatatan').value.trim();
  const terpilih = [...$('msDaftar').querySelectorAll('[data-massal]:checked')].map(c => c.dataset.massal);

  if(terpilih.length === 0){ pesan(el, 'Belum ada kelas yang dicentang.', 'salah'); return; }

  // Kelas yang sudah punya perubahan pada tanggal itu dilewati, bukan
  // ditimpa. Perubahan yang dibuat manual lebih spesifik, jadi tidak pantas
  // tergilas oleh pembuatan massal.
  const akanDibuat = [];
  let dilewati = 0;
  for(const jadwalId of terpilih){
    const k = massalKandidat.find(x => x.jadwalId === jadwalId);
    const j = data.jadwal.find(x => x.id === jadwalId);
    if(!k || !j) continue;
    for(const tgl of k.tanggalList){
      const sudahAda = data.perubahan.some(p => p.jadwalId === jadwalId && p.tanggal === tgl);
      if(sudahAda){ dilewati++; continue; }
      akanDibuat.push({ j, tgl });
    }
  }

  if(akanDibuat.length === 0){
    pesan(el, `Tidak ada yang dibuat. Seluruh ${dilewati} kemunculan sudah punya perubahan sendiri.`, 'salah');
    return;
  }

  const namaJenis = tipe === 'daring' ? 'Daring' : 'Ditiadakan';
  const kelompok = `${namaJenis} ${$('msDari').value} s/d ${$('msSampai').value}`;
  const ringkas = `${akanDibuat.length} entri untuk ${terpilih.length} kelas`
    + (dilewati ? `, ${dilewati} dilewati karena sudah punya perubahan sendiri` : '');

  if(!confirm(`Buat ${ringkas}?\n\nKelompok: ${kelompok}`)) return;

  try{
    status('Membuat ' + akanDibuat.length + ' perubahan…', 'sibuk');

    // Ditulis sebagai satu transaksi. Jika di tengah jalan gagal, tidak ada
    // yang tersimpan sama sekali, sehingga tidak pernah ada keadaan separuh
    // jadi yang membingungkan untuk dibereskan.
    const BATAS = 450;   // Firestore membatasi 500 operasi per transaksi
    for(let i = 0; i < akanDibuat.length; i += BATAS){
      const batch = writeBatch(db);
      for(const { j, tgl } of akanDibuat.slice(i, i + BATAS)){
        batch.set(doc(collection(db, 'perubahan')), {
          tipe, jadwalId: j.id, kode: j.kode, kp: j.kp,
          tanggal: tgl, catatan,
          tanggalBaru: '', mulaiBaru: '', selesaiBaru: '', ruangBaru: '',
          kelompok,
        });
      }
      await batch.commit();
    }

    await catat('massal', 'perubahan', kelompok,
      `${akanDibuat.length} perubahan dibuat sekaligus untuk ${terpilih.length} kelas`
      + (dilewati ? `, ${dilewati} dilewati karena sudah punya perubahan sendiri` : ''));

    $('msDaftar').innerHTML = ''; $('msAksi').hidden = true; massalKandidat = [];
    $('msCatatan').value = '';
    await muatSemua();
    await terbitkan();
    pesan(el, `Selesai. ${ringkas}.`, 'benar');
  }catch(err){
    console.error(err);
    pesan(el, 'Gagal membuat: ' + esc(err.message), 'salah');
    status('Pembuatan massal gagal.', 'salah');
  }
});

/* Daftar kelompok, supaya pembuatan massal bisa dibatalkan sekaligus. */
function gambarKelompok(){
  const el = $('daftarKelompok');
  const peta = new Map();
  for(const p of data.perubahan){
    if(!p.kelompok) continue;
    peta.set(p.kelompok, (peta.get(p.kelompok) || 0) + 1);
  }
  if(peta.size === 0){ el.innerHTML = ''; return; }

  el.innerHTML = `<div class="op-kelompok">
    <h3>Hasil pembuatan massal</h3>
    <p class="op-catatan">Menghapus kelompok akan membuang seluruh perubahan yang dibuat bersamaan dengannya.</p>
    ${[...peta.entries()].map(([nama, n]) => `<div class="op-kelompok-baris">
      <span><strong>${esc(nama)}</strong> <span class="op-samar">· ${n} perubahan</span></span>
      <span class="op-tombol-baris">
        <button class="op-mini" data-ig-kelompok="${esc(nama)}">Story IG</button>
        <button class="op-mini op-hapus" data-hapus-kelompok="${esc(nama)}">Hapus kelompok</button>
      </span>
    </div>`).join('')}
  </div>`;

  el.querySelectorAll('[data-ig-kelompok]').forEach(b => b.addEventListener('click', () => {
    bukaIg(data.perubahan.filter(p => p.kelompok === b.dataset.igKelompok));
  }));

  el.querySelectorAll('[data-hapus-kelompok]').forEach(b => b.addEventListener('click', async () => {
    const nama = b.dataset.hapusKelompok;
    const anggota = data.perubahan.filter(p => p.kelompok === nama);
    if(!confirm(`Hapus ${anggota.length} perubahan dalam kelompok "${nama}"?`)) return;
    try{
      status(`Menghapus ${anggota.length} perubahan…`, 'sibuk');
      const BATAS = 450;
      for(let i = 0; i < anggota.length; i += BATAS){
        const batch = writeBatch(db);
        for(const p of anggota.slice(i, i + BATAS)) batch.delete(doc(db, 'perubahan', p.id));
        await batch.commit();
      }
      await catat('massal', 'perubahan', nama, `${anggota.length} perubahan dalam kelompok ini dihapus sekaligus`);
      await muatSemua();
      await terbitkan();
    }catch(err){
      console.error(err);
      status('Gagal menghapus kelompok: ' + err.message, 'salah');
    }
  }));
}

/* ============================================================
   7c. Pengajar
   ============================================================

   Datanya sengaja TIDAK ikut diterbitkan ke dokumen publik/terkini, sehingga
   tidak muncul di halaman mana pun yang dibuka mahasiswa. Hanya halaman ini
   yang memakainya.
*/

function isiPilihanPengajar(){
  const el = $('pgKode');
  const terpilih = el.value;
  el.innerHTML = '<option value="">— pilih —</option>' + data.matakuliah
    .map(m => `<option value="${esc(m.kode)}">${esc(m.kode)} · ${esc(m.nama)}</option>`).join('');
  if(terpilih) el.value = terpilih;
  perbaruiSaranKp();
}

// Saran KP diambil dari jadwal mata kuliah yang sedang dipilih, supaya
// pengurus tidak perlu mengingat-ingat sendiri KP apa saja yang ada.
function perbaruiSaranKp(){
  const kode = $('pgKode').value;
  const kp = [...new Set(data.jadwal.filter(j => j.kode === kode).map(j => j.kp))].sort();
  $('daftarKp').innerHTML = kp.map(k => `<option value="${esc(k)}"></option>`).join('');
}
$('pgKode').addEventListener('change', perbaruiSaranKp);

function kelasDari(kode, kp){
  return data.jadwal.find(j =>
    j.kode === kode && String(j.kp).toUpperCase() === String(kp).toUpperCase());
}

function periksaPengajar({ id, kode, kp, nama, nrp }){
  const salah = [];
  const hati = [];

  if(!kode) salah.push('Mata kuliah belum dipilih.');
  else if(!data.matakuliah.some(m => m.kode === kode))
    salah.push(`Kode ${kode} tidak ada di daftar Mata Kuliah.`);

  if(!kp) salah.push('KP belum diisi.');
  if(!nama) salah.push('Nama belum diisi.');
  if(!nrp) salah.push('NRP belum diisi.');

  if(kode && kp && nrp){
    const kembar = data.pengajar.find(p =>
      p.id !== id && p.kode === kode
      && String(p.kp).toUpperCase() === kp
      && String(p.nrp).trim() === nrp);
    if(kembar) salah.push(`NRP ${nrp} sudah terdaftar sebagai pengajar ${kode} KP ${kp}.`);

    const kelas = kelasDari(kode, kp);
    if(!kelas){
      hati.push(`${kode} KP ${kp} belum ada di Jadwal Permanen, jadi jadwal mengajarnya belum bisa diperiksa.`);
    }else{
      // Satu orang tidak mungkin berada di dua ruang pada waktu bersamaan,
      // jadi jadwal mengajarnya diperiksa terhadap kelas lain yang dipegangnya.
      const m1 = keMenit(kelas.mulai), m2 = keMenit(kelas.selesai);
      const lain = data.pengajar.filter(p => p.id !== id && String(p.nrp).trim() === nrp);
      for(const p of lain){
        const k = kelasDari(p.kode, p.kp);
        if(!k || k.hari !== kelas.hari) continue;
        if(k.id === kelas.id) continue;
        if(beririsan(m1, m2, keMenit(k.mulai), keMenit(k.selesai))){
          salah.push(
            `NRP ${nrp} sudah mengajar ${p.kode} KP ${p.kp} pada ${k.hari} `
            + `${rentangJam(k.mulai, k.selesai)}, jamnya beririsan dengan kelas ini.`);
        }
      }

      const namaLain = data.pengajar.find(p =>
        p.id !== id && String(p.nrp).trim() === nrp
        && String(p.nama).trim().toLowerCase() !== String(nama).trim().toLowerCase());
      if(namaLain){
        hati.push(`NRP ${nrp} sebelumnya tercatat atas nama "${namaLain.nama}". Pastikan tidak salah ketik.`);
      }
    }
  }

  return { salah, hati };
}

function gambarPengajar(){
  const t = $('tabelPengajar');
  const q = ($('cariPengajar').value || '').trim().toLowerCase();

  const baris = data.pengajar
    .filter(p => !q || [p.kode, namaMatkul(p.kode), p.kp, p.nama, p.nrp].join(' ').toLowerCase().includes(q))
    .sort((a, b) =>
      (namaMatkul(a.kode) || a.kode).localeCompare(namaMatkul(b.kode) || b.kode)
      || String(a.kp).localeCompare(String(b.kp))
      || String(a.nama).localeCompare(String(b.nama)));

  // Koleksi yang gagal dimuat terlihat sama dengan koleksi kosong, padahal
  // artinya jauh berbeda. Bedanya dijelaskan supaya tidak dikira datanya hilang.
  if(gagalMuat.has('pengajar')){
    t.innerHTML = `<tbody><tr><td class="op-kosong">
      Data pengajar belum bisa dimuat.<br><br>${esc(gagalMuat.get('pengajar'))}
    </td></tr></tbody>`;
    return;
  }

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      data.pengajar.length ? 'Tidak ada yang cocok dengan pencarian.' : 'Belum ada pengajar.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr><th>Mata Kuliah</th><th>KP</th><th>Nama</th><th>NRP</th><th>Jadwal</th><th></th></tr></thead>
    <tbody>${baris.map(p => {
      const k = kelasDari(p.kode, p.kp);
      return `<tr>
        <td>${esc(namaMatkul(p.kode) || '(kode tidak dikenal)')}<br><span class="op-samar">${esc(p.kode)}</span></td>
        <td>${esc(p.kp)}</td>
        <td>${esc(p.nama)}</td>
        <td>${esc(p.nrp)}</td>
        <td class="op-samar">${k ? esc(k.hari + ' ' + rentangJam(k.mulai, k.selesai)) : 'belum ada di jadwal'}</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-ubah-pg="${esc(p.id)}">Ubah</button>
          <button class="op-mini op-hapus" data-hapus-pg="${esc(p.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-pg]').forEach(b => b.addEventListener('click', () => {
    const p = data.pengajar.find(x => x.id === b.dataset.ubahPg);
    if(!p) return;
    $('pgId').value = p.id; $('pgKode').value = p.kode; $('pgKp').value = p.kp;
    $('pgNama').value = p.nama; $('pgNrp').value = p.nrp;
    perbaruiSaranKp(); modeUbah('formPengajar', true);
    $('pgKode').focus();
  }));

  t.querySelectorAll('[data-hapus-pg]').forEach(b => b.addEventListener('click', async () => {
    const p = data.pengajar.find(x => x.id === b.dataset.hapusPg);
    if(!p || !confirm(`Hapus ${p.nama} (${p.nrp}) sebagai pengajar ${p.kode} KP ${p.kp}?`)) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'pengajar', p.id));
      await catat('hapus', 'pengajar',
        `${p.nama} · ${namaMatkul(p.kode) || p.kode} KP ${p.kp}`, `NRP ${p.nrp || 'tidak ada'}`);
      await muatSemua();
      status('Pengajar dihapus.', 'benar');
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

$('cariPengajar').addEventListener('input', gambarPengajar);

$('formPengajar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanPengajar');
  const isi = {
    id: $('pgId').value,
    kode: $('pgKode').value,
    kp: $('pgKp').value.trim().toUpperCase(),
    nama: $('pgNama').value.trim(),
    nrp: $('pgNrp').value.trim(),
  };

  const { salah, hati } = periksaPengajar(isi);
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }
  if(hati.length && el.dataset.konfirmasi !== '1'){
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi jika memang benar:', hati), 'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  const muatan = { kode: isi.kode, kp: isi.kp, nama: isi.nama, nrp: isi.nrp };
  try{
    status('Menyimpan…', 'sibuk');
    const lamaPg = isi.id ? data.pengajar.find(x => x.id === isi.id) : null;
    if(isi.id) await updateDoc(doc(db, 'pengajar', isi.id), muatan);
    else await addDoc(collection(db, 'pengajar'), muatan);
    await catat(isi.id ? 'ubah' : 'tambah', 'pengajar',
      `${muatan.nama} · ${namaMatkul(muatan.kode) || muatan.kode} KP ${muatan.kp}`,
      lamaPg ? bedaKolom(lamaPg, muatan, KOLOM_LOG.pengajar) : `NRP ${muatan.nrp || 'tidak ada'}`);
    e.target.reset(); $('pgId').value = ''; modeUbah('formPengajar', false);
    bersihkanPesan(el);
    await muatSemua();
    // Sengaja TIDAK memanggil terbitkan(): data pengajar tidak boleh ikut
    // masuk ke dokumen yang dibaca pengunjung.
    status('Pengajar tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

/* ============================================================
   7d. Akun pengajar
   ============================================================

   Pengajuan akun yang dikirim sendiri melalui halaman /pengajar. Yang diputuskan
   di sini ada dua hal sekaligus: apakah orangnya benar-benar asisten, dan mata
   kuliah mana saja yang boleh dia ubah naskahnya.

   PENCOCOKAN DENGAN DATA PENGAJAR

   NRP dan nama pendaftar dicocokkan dengan tab Pengajar, lalu hasilnya
   ditampilkan sebagai peringatan di tabel. Pencocokan ini SENGAJA tidak
   memblokir apa pun.

   Data pengajar diisi manusia dan sering tertinggal di awal semester, jadi
   penolakan otomatis akan menghalangi asisten yang sah hanya karena barisnya
   belum sempat dimasukkan. Yang memutuskan tetap pengurus, dan tugas halaman
   ini adalah memastikan pengurus melihat ketidakcocokannya sebelum memutuskan.
*/

const STATUS_AKUN = {
  menunggu: { label: 'Menunggu', kelas: 'menyusul' },
  diterima: { label: 'Diterima', kelas: 'pindah'  },
  ditolak:  { label: 'Ditolak',  kelas: 'libur'   },
};

// Dokumen yang dibuat langsung melalui Firebase Console boleh tidak menyebut
// status. Bawaannya sama dengan yang digunakan firestore.rules dan halaman
// pengajar, supaya ketiganya tidak pernah berbeda pendapat.
function statusAkun(a){
  return a.status || 'diterima';
}

// Perbedaan huruf besar kecil dan spasi berlebih bukan ketidakcocokan yang
// perlu dilaporkan ke pengurus, jadi diratakan lebih dulu.
function samakanNama(n){
  return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function angkaEmailAkun(email){
  const m = String(email || '').match(/^s(\d+)@/i);
  return m ? m[1] : '';
}

// Email student UBAYA dibentuk dari NRP-nya, jadi email yang seharusnya selalu
// bisa dihitung. Menyebutkan bentuk yang benar jauh lebih berguna bagi pengurus
// daripada sekadar memberi tahu bahwa keduanya berbeda.
function emailSeharusnya(nrp){
  return 's' + String(nrp || '').trim() + '@student.ubaya.ac.id';
}

/*
  Hasil pencocokan satu pengajuan dengan data pengajar.

  Yang dikembalikan: daftar catatan untuk ditampilkan, dan baris pengajar yang
  NRP-nya cocok supaya pengurus bisa melihat orang ini mengajar apa saja.
*/
function periksaAkun(a){
  const catatan = [];
  const nrp = String(a.nrp || '').trim();
  const cocokNrp = data.pengajar.filter(p => String(p.nrp || '').trim() === nrp);

  if(gagalMuat.has('pengajar')){
    catatan.push({ jenis:'hati', teks:'Data pengajar gagal dimuat, jadi belum bisa dicocokkan.' });
  }else if(!cocokNrp.length){
    catatan.push({ jenis:'salah', teks:`NRP ${nrp || '(kosong)'} tidak ada di daftar pengajar.` });

    // Jika namanya justru ketemu, kemungkinan besar NRP-nya salah ketik, dan
    // itu jauh lebih berguna diketahui daripada sekadar "tidak ditemukan".
    const cocokNama = data.pengajar.filter(p => samakanNama(p.nama) === samakanNama(a.nama));
    if(cocokNama.length){
      const nrpLain = [...new Set(cocokNama.map(p => p.nrp))].join(', ');
      catatan.push({ jenis:'hati', teks:`Ada pengajar bernama sama dengan NRP ${nrpLain}.` });
    }
  }else{
    const namaSama = cocokNrp.some(p => samakanNama(p.nama) === samakanNama(a.nama));
    if(namaSama){
      catatan.push({ jenis:'benar', teks:'Nama dan NRP cocok dengan data pengajar.' });
    }else{
      const namaLain = [...new Set(cocokNrp.map(p => p.nama))].join(', ');
      catatan.push({ jenis:'salah', teks:`Nama berbeda. Di data pengajar NRP ini bernama ${namaLain}.` });
    }
  }

  /*
    Email student UBAYA menggunakan NRP-nya sendiri, jadi ketidakcocokan di sini
    bukan sekadar hal yang perlu dilirik.

    Salah satu dari keduanya pasti keliru, dan keduanya sama-sama menentukan:
    NRP digunakan mencocokkan dengan data pengajar, email digunakan masuk. Karena
    itu dihitung sebagai ketidakcocokan berat, sehingga menerimanya pun minta
    ditekan dua kali.
  */
  if(angkaEmailAkun(a.email) !== nrp){
    catatan.push({
      jenis: 'salah',
      teks: nrp
        ? `Email tidak sesuai NRP. Menurut NRP ${nrp}, emailnya ${emailSeharusnya(nrp)}.`
        : 'Email tidak bisa dicocokkan karena NRP-nya kosong.'
    });
  }

  return { catatan, cocokNrp };
}

// Mata kuliah materi yang boleh diberikan. Diambil dari daftar yang sama
// dengan yang digunakan halaman pengajar, supaya kodenya tidak pernah berbeda.
function daftarMateri(){
  return Array.isArray(window.KAFBE_MATERI_DAFTAR) ? window.KAFBE_MATERI_DAFTAR : [];
}

function namaMateri(kode){
  const m = daftarMateri().find(x => x.kode === kode);
  return m ? m.nama : kode;
}

function gambarAkunPengajar(){
  const t = $('tabelAkun');
  const q = ($('cariAkun').value || '').trim().toLowerCase();
  const saringStatus = $('saringStatusAkun').value;

  if(gagalMuat.has('pengajarakun')){
    t.innerHTML = `<tbody><tr><td class="op-kosong">
      Pengajuan akun belum bisa dimuat.<br><br>${esc(gagalMuat.get('pengajarakun'))}
    </td></tr></tbody>`;
    return;
  }

  const baris = data.pengajarakun
    .filter(a => !saringStatus || statusAkun(a) === saringStatus)
    .filter(a => !q || [a.nama, a.nrp, a.email].join(' ').toLowerCase().includes(q));

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      data.pengajarakun.length
        ? 'Tidak ada yang cocok dengan penyaringan.'
        : 'Belum ada yang mendaftar sebagai pengajar.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr>
      <th>Pendaftar</th><th>NRP</th><th>Status</th>
      <th>Hasil pencocokan</th><th>Wewenang</th><th></th>
    </tr></thead>
    <tbody>${baris.map(a => {
      const s = statusAkun(a);
      const l = STATUS_AKUN[s] || STATUS_AKUN.menunggu;
      const { catatan, cocokNrp } = periksaAkun(a);

      const mengajar = cocokNrp.length
        ? cocokNrp.map(p => `${namaMatkul(p.kode) || p.kode} KP ${p.kp}`).join(', ')
        : '';

      const wewenang = a.semua === true
        ? 'Semua mata kuliah'
        : (Array.isArray(a.mk) && a.mk.length
            ? a.mk.map(k => esc(namaMateri(k))).join('<br>')
            : '<span class="op-samar">belum diberi</span>');

      return `<tr>
        <td>${esc(a.nama || '(tanpa nama)')}<br><span class="op-samar">${esc(a.email || '')}</span></td>
        <td>${esc(a.nrp || '')}</td>
        <td><span class="op-lencana ${l.kelas}">${esc(l.label)}</span>${
          s === 'ditolak' && a.alasan ? `<br><span class="op-samar">${esc(a.alasan)}</span>` : ''
        }</td>
        <td>
          <ul class="op-periksa">${catatan.map(c =>
            `<li class="${c.jenis}">${esc(c.teks)}</li>`).join('')}</ul>
          ${mengajar ? `<span class="op-samar">Tercatat mengajar ${esc(mengajar)}</span>` : ''}
        </td>
        <td>${wewenang}</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-putus-ak="${esc(a.id)}">${
            s === 'menunggu' ? 'Putuskan' : 'Ubah'
          }</button>
          <button class="op-mini op-hapus" data-hapus-ak="${esc(a.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-putus-ak]').forEach(b => b.addEventListener('click', () => {
    bukaKeputusanAkun(b.dataset.putusAk);
  }));

  t.querySelectorAll('[data-hapus-ak]').forEach(b => b.addEventListener('click', async () => {
    const a = data.pengajarakun.find(x => x.id === b.dataset.hapusAk);
    if(!a) return;

    /*
      Akibat menghapus berbeda-beda menurut status barisnya, dan bedanya
      penting. Menghapus baris yang sudah diterima mencabut wewenang, sedangkan
      menghapus baris yang ditolak justru membuka kembali pintu yang tadi baru
      saja ditutup. Peringatan yang berbunyi sama untuk keduanya akan membuat
      yang kedua terasa seperti tindakan yang aman, padahal kebalikannya.
    */
    const s = statusAkun(a);
    const akibat = s === 'diterima'
      ? 'Wewenangnya langsung dicabut. Naskah materi tidak bisa lagi dia ubah, '
        + 'bahkan jika halamannya sedang terbuka.'
      : (s === 'ditolak'
          ? 'Penolakannya ikut terhapus, sehingga orang ini bisa mendaftar lagi. '
            + 'Jika maksud Anda menutup pintunya, biarkan barisnya dan gunakan Tolak.'
          : 'Pengajuannya hilang dari antrean tanpa pernah diputuskan.');

    if(!confirm(
      `Hapus baris ${a.nama} (${a.nrp})?\n\n${akibat}\n\n`
      + 'Akun Firebase-nya tidak ikut terhapus. Orang ini masih bisa masuk dan '
      + 'mengirim pengajuan baru. Untuk menutup akunnya sama sekali, '
      + 'nonaktifkan melalui Firebase Console pada menu Authentication.')) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'pengajarakun', a.id));
      await catat('hapus', 'akunpengajar', `${a.nama} · ${a.email}`, `NRP ${a.nrp || 'tidak ada'}`);
      tutupKeputusanAkun();
      await muatSemua();
      status('Pengajuan dihapus.', 'benar');
    }catch(err){
      console.error(err);
      status('Gagal menghapus: ' + err.message, 'salah');
    }
  }));
}

$('cariAkun').addEventListener('input', gambarAkunPengajar);
$('saringStatusAkun').addEventListener('change', gambarAkunPengajar);

/* ---------- Formulir keputusan ---------- */

function bukaKeputusanAkun(id){
  const a = data.pengajarakun.find(x => x.id === id);
  if(!a) return;

  const { cocokNrp } = periksaAkun(a);

  $('akUid').value = a.id;
  $('akSiapa').textContent = `${a.nama || '(tanpa nama)'} · NRP ${a.nrp || '-'}`;
  $('akRincian').textContent = a.email
    + (cocokNrp.length
        ? ' · tercatat mengajar ' + cocokNrp.map(p => `${namaMatkul(p.kode) || p.kode} KP ${p.kp}`).join(', ')
        : ' · belum ada di data pengajar');

  $('akStatus').value = statusAkun(a) === 'menunggu' ? 'diterima' : statusAkun(a);
  $('akAlasan').value = a.alasan || '';
  $('akSemua').checked = a.semua === true;

  const dipilih = Array.isArray(a.mk) ? a.mk.map(String) : [];
  const wadah = $('akDaftarMk');
  wadah.textContent = '';
  for(const mk of daftarMateri()){
    const label = document.createElement('label');
    label.className = 'op-centang-baris';
    const kotak = document.createElement('input');
    kotak.type = 'checkbox';
    kotak.value = mk.kode;
    kotak.checked = dipilih.includes(mk.kode);
    const teks = document.createElement('span');
    teks.textContent = (mk.ikon ? mk.ikon + ' ' : '') + mk.nama;
    label.appendChild(kotak);
    label.appendChild(teks);
    wadah.appendChild(label);
  }

  bersihkanPesan($('pesanAkun'));
  $('formAkun').hidden = false;
  aturTampilanKeputusan();
  $('akStatus').focus();
}

function tutupKeputusanAkun(){
  $('formAkun').hidden = true;
  $('akUid').value = '';
  bersihkanPesan($('pesanAkun'));
}

/*
  Bagian yang tidak relevan disembunyikan, bukan sekadar dibiarkan menganggur.
  Kotak alasan hanya berguna saat menolak, dan daftar mata kuliah hanya berguna
  saat menerima tanpa mencentang "semua mata kuliah".
*/
function aturTampilanKeputusan(){
  const s = $('akStatus').value;
  $('akAlasanBungkus').hidden = (s !== 'ditolak');
  $('akWewenang').hidden = (s !== 'diterima');
  $('akDaftarMk').hidden = $('akSemua').checked;
}

$('akStatus').addEventListener('change', aturTampilanKeputusan);
$('akSemua').addEventListener('change', aturTampilanKeputusan);
$('akBatal').addEventListener('click', tutupKeputusanAkun);

$('formAkun').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanAkun');
  const a = data.pengajarakun.find(x => x.id === $('akUid').value);
  if(!a) return;

  const status_ = $('akStatus').value;
  const semua = $('akSemua').checked;
  const mk = [...$('akDaftarMk').querySelectorAll('input:checked')].map(x => x.value);
  const alasan = $('akAlasan').value.trim();

  const salah = [];
  if(status_ === 'diterima' && !semua && !mk.length){
    salah.push('Pilih paling sedikit satu mata kuliah, atau centang "semua mata kuliah". '
      + 'Akun yang diterima tanpa mata kuliah tidak bisa mengubah apa pun.');
  }
  if(status_ === 'ditolak' && !alasan){
    salah.push('Isi alasan penolakan. Alasannya dibaca pendaftar di halaman pengajar.');
  }
  if(salah.length){
    pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah');
    return;
  }

  /*
    Peringatan hasil pencocokan tidak memblokir, tetapi menerima pengajuan yang
    datanya tidak cocok perlu dilakukan dengan sadar, bukan tersenggol. Karena
    itu penyimpanannya minta ditekan dua kali.
  */
  const { catatan } = periksaAkun(a);
  const berat = catatan.filter(c => c.jenis === 'salah');
  if(status_ === 'diterima' && berat.length && el.dataset.konfirmasi !== '1'){
    pesan(el, daftarKesalahan(
      'Data pendaftar ini tidak cocok dengan data pengajar. Periksa dulu, lalu tekan Simpan keputusan sekali lagi jika memang benar:',
      berat.map(c => c.teks)), 'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  /*
    Ditulis utuh, bukan digabung. Nama, NRP, dan email disalin apa adanya dari
    baris yang sudah tersimpan, dan aturan Firestore menolak jika ketiganya
    berubah. Jadi keputusan pengurus tidak bisa sekaligus menyunting identitas
    pendaftarnya, baik sengaja maupun karena salah pencet.
  */
  const muatan = {
    status: status_,
    nama: a.nama,
    nrp: a.nrp,
    email: a.email,
    mk: status_ === 'diterima' && !semua ? mk : [],
    semua: status_ === 'diterima' && semua,
    alasan: status_ === 'ditolak' ? alasan : '',
    diputusPada: serverTimestamp(),
    diputusOleh: pemakai.email,
  };
  if(a.dibuatPada) muatan.dibuatPada = a.dibuatPada;

  try{
    status('Menyimpan keputusan…', 'sibuk');
    await setDoc(doc(db, 'pengajarakun', a.id), muatan);
    await catat('ubah', 'akunpengajar',
      `${a.nama} · ${(STATUS_AKUN[status_] || {}).label || status_}`,
      status_ === 'diterima'
        ? (semua ? 'Semua mata kuliah' : mk.map(namaMateri).join(', '))
        : alasan || 'tanpa alasan');
    tutupKeputusanAkun();
    await muatSemua();
    // Sengaja TIDAK memanggil terbitkan(): data akun pengajar tidak boleh ikut
    // masuk ke dokumen yang dibaca pengunjung.
    status('Keputusan tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
    pesan(el, err.code === 'permission-denied'
      ? 'Server menolak perubahan ini. Biasanya berarti aturan Firestore belum diperbarui. Lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
      : esc(err.message || 'tidak diketahui'), 'salah');
  }
});

/* ============================================================
   7B. Akun operasional
   ============================================================ */

/*
  Antrean pendaftar pengurus operasional, dan keputusannya.

  Polanya sengaja disamakan dengan tab Akun Pengajar di atas: yang mendaftar
  hanya bisa membuat baris atas namanya sendiri, dan yang memutuskan adalah
  pengurus yang sudah ada. Bedanya, menerima di sini berarti mengangkat orang
  itu menjadi pengurus dengan wewenang yang persis sama dengan yang menerima,
  termasuk menerima pendaftar berikutnya.

  Karena itu penerimaannya dibuat sekali jalan. Mencabut pengurus tidak bisa
  dari halaman ini, hanya lewat Firebase Console. Itu pembatas terakhir yang
  dipertahankan: akun yang diambil alih bisa menambah orang, tetapi tidak bisa
  menyingkirkan pengurus lain dan menguasai halaman ini sendirian.
*/

function statusAkunOp(a){
  return a.status || 'menunggu';
}

// Status "dicabut" hanya ada di antrean pengurus, jadi labelnya ditambahkan
// di sini tanpa menyentuh daftar status milik akun pengajar.
const STATUS_AKUN_OP = {
  ...STATUS_AKUN,
  dicabut: { label: 'Dicabut', kelas: 'libur' },
};

function adminAbsolut(a){
  return a.absolut === true;
}

function sudahDiangkat(a){
  return data.admins.some(x => x.id === a.id);
}

function gambarAkunOperasional(){
  const t = $('tabelAkunOp');
  const q = ($('cariAkunOp').value || '').trim().toLowerCase();
  const saringStatus = $('saringStatusAkunOp').value;

  if(gagalMuat.has('adminakun')){
    t.innerHTML = `<tbody><tr><td class="op-kosong">
      Pengajuan akun belum bisa dimuat.<br><br>${esc(gagalMuat.get('adminakun'))}
    </td></tr></tbody>`;
    return;
  }

  const baris = data.adminakun
    .filter(a => !saringStatus || statusAkunOp(a) === saringStatus)
    .filter(a => !q || [a.nama, a.nrp, a.email].join(' ').toLowerCase().includes(q));

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      data.adminakun.length
        ? 'Tidak ada yang cocok dengan penyaringan.'
        : 'Belum ada yang mendaftar sebagai pengurus operasional.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr>
      <th>Pendaftar</th><th>NRP</th><th>Status</th><th>Diputuskan oleh</th><th></th>
    </tr></thead>
    <tbody>${baris.map(a => {
      const diangkat = sudahDiangkat(a);
      // Baris yang statusnya diterima tetapi dokumen admins-nya sudah tidak
      // ada berarti dicabut lewat Firebase Console. Ditampilkan apa adanya
      // sebagai dicabut, bukan diterima, supaya tabelnya tidak berbohong.
      const s = (statusAkunOp(a) === 'diterima' && !diangkat) ? 'dicabut' : statusAkunOp(a);
      const l = STATUS_AKUN_OP[s] || STATUS_AKUN_OP.menunggu;
      // Baris yang sudah diangkat tidak punya keputusan lain: dokumennya di
      // "admins" hanya bisa dicabut lewat Console, jadi tombolnya tidak
      // ditawarkan sama sekali daripada menawarkan yang pasti ditolak server.
      const tindakan = diangkat
        ? '<span class="op-samar">Sudah menjadi pengurus</span>'
        : `<div class="op-tombol-baris">
            <button class="op-mini" data-putus-ao="${esc(a.id)}">${s === 'menunggu' ? 'Putuskan' : 'Ubah'}</button>
            <button class="op-mini op-hapus" data-hapus-ao="${esc(a.id)}">Hapus</button>
          </div>`;
      return `<tr>
        <td>${esc(a.nama || '(tanpa nama)')}<br><span class="op-samar">${esc(a.email || '')}</span></td>
        <td>${esc(a.nrp || '')}</td>
        <td><span class="op-lencana ${l.kelas}">${esc(l.label)}</span>${
          s === 'ditolak' && a.alasan ? `<br><span class="op-samar">${esc(a.alasan)}</span>` : ''
        }</td>
        <td class="op-samar">${esc(a.diputusOleh || '')}</td>
        <td>${tindakan}</td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-putus-ao]').forEach(b => b.addEventListener('click', () => {
    bukaKeputusanAkunOp(b.dataset.putusAo);
  }));

  t.querySelectorAll('[data-hapus-ao]').forEach(b => b.addEventListener('click', async () => {
    const a = data.adminakun.find(x => x.id === b.dataset.hapusAo);
    if(!a) return;
    const s = statusAkunOp(a);
    const akibat = s === 'ditolak'
      ? 'Penolakannya ikut terhapus, sehingga orang ini bisa mendaftar lagi. '
        + 'Jika maksud Anda menutup pintunya, biarkan barisnya dan gunakan Tolak.'
      : 'Pengajuannya hilang dari antrean tanpa pernah diputuskan, dan orang ini bisa mengajukan lagi.';
    if(!confirm(
      `Hapus pengajuan ${a.nama} (${a.nrp})?\n\n${akibat}\n\n`
      + 'Akun Firebase-nya tidak ikut terhapus. Untuk menutup akunnya sama sekali, '
      + 'nonaktifkan melalui Firebase Console pada menu Authentication.')) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'adminakun', a.id));
      await catat('hapus', 'akunoperasional', `${a.nama} · ${a.email}`,
        `Pengajuan berstatus ${(STATUS_AKUN_OP[s] || {}).label || s} dihapus, NRP ${a.nrp || 'tidak ada'}`);
      tutupKeputusanAkunOp();
      await muatSemua();
      status('Pengajuan dihapus.', 'benar');
    }catch(err){
      console.error(err);
      status('Gagal menghapus: ' + err.message, 'salah');
    }
  }));
}

$('cariAkunOp').addEventListener('input', gambarAkunOperasional);
$('saringStatusAkunOp').addEventListener('change', gambarAkunOperasional);

function gambarPengurus(){
  const t = $('tabelPengurus');
  if(gagalMuat.has('admins')){
    t.innerHTML = `<tbody><tr><td class="op-kosong">
      Daftar pengurus belum bisa dimuat.<br><br>${esc(gagalMuat.get('admins'))}
    </td></tr></tbody>`;
    return;
  }
  if(data.admins.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada pengurus yang terdaftar.</td></tr></tbody>';
    return;
  }
  // Admin absolut diletakkan paling atas: dialah yang perlu dicari orang
  // saat ada masalah yang tidak bisa dibereskan admin operasional.
  const urut = [...data.admins].sort((a, b) =>
    (adminAbsolut(b) ? 1 : 0) - (adminAbsolut(a) ? 1 : 0)
    || String(a.nama || '').localeCompare(String(b.nama || '')));
  const uidSaya = auth.currentUser ? auth.currentUser.uid : null;

  t.innerHTML = `
    <thead><tr><th>Nama</th><th>Email</th><th>Tingkat</th><th>Diangkat oleh</th><th>Sejak</th><th></th></tr></thead>
    <tbody>${urut.map(a => {
      const sejak = a.diputusPada && typeof a.diputusPada.toDate === 'function'
        ? waktuPanjang(a.diputusPada.toDate()) : '';
      const absolut = adminAbsolut(a);
      const saya = a.id === uidSaya;
      /*
        Tombol cabut tidak ditawarkan untuk diri sendiri dan untuk admin
        absolut. Keduanya memang ditolak server, jadi menampilkannya hanya akan
        menawarkan tombol yang pasti gagal.
      */
      const tindakan = absolut
        ? '<span class="op-samar">Tidak bisa dicabut</span>'
        : (saya
            ? '<span class="op-samar">Diri sendiri</span>'
            : `<button class="op-mini op-hapus" data-cabut-admin="${esc(a.id)}">Cabut</button>`);
      return `<tr>
        <td>${esc(a.nama || '(tanpa nama)')}${saya ? ' <span class="op-samar">(Anda)</span>' : ''}</td>
        <td>${esc(a.email || '')}</td>
        <td>${absolut
          ? '<span class="op-lencana pindah">Admin absolut</span>'
          : '<span class="op-lencana menyusul">Admin operasional</span>'}</td>
        <td class="op-samar">${esc(a.diputusOleh || 'Firebase Console')}</td>
        <td class="op-samar">${esc(sejak)}</td>
        <td>${tindakan}</td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-cabut-admin]').forEach(b => b.addEventListener('click', () => {
    cabutPengurus(b.dataset.cabutAdmin);
  }));
}

/*
  Mencabut admin operasional dari web.

  Diminta dikonfirmasi DUA KALI, dan yang kedua bukan sekadar tombol OK lagi,
  melainkan mengetik ulang nama orangnya. Tombol OK kedua terlalu mudah
  ditekan sambil lalu, sedangkan mengetik nama memaksa membaca siapa yang
  akan dicabut. Akibatnya juga langsung: begitu tersimpan, orang itu tidak
  bisa lagi membuka halaman ini meski sedang terbuka di perambannya.

  Baris pengajuannya ikut diberi status "dicabut" dalam satu kelompok tulis,
  supaya antrean dan daftar pengurus tidak pernah saling bertentangan, dan
  supaya orang itu membaca keterangan yang benar saat mencoba masuk. Baris
  itu tetap bisa diangkat kembali lewat tombol Putuskan kalau pencabutannya
  ternyata keliru.
*/
async function cabutPengurus(uid){
  const a = data.admins.find(x => x.id === uid);
  if(!a) return;
  if(adminAbsolut(a)){
    status('Admin absolut tidak bisa dicabut lewat web.', 'salah');
    return;
  }
  if(auth.currentUser && a.id === auth.currentUser.uid){
    status('Anda tidak bisa mencabut diri sendiri. Minta pengurus lain yang melakukannya.', 'salah');
    return;
  }

  const nama = a.nama || a.email || '(tanpa nama)';
  if(!confirm(
    `Cabut wewenang pengurus dari ${nama}?\n\n`
    + 'Begitu tersimpan, orang ini tidak bisa lagi membuka halaman operasional, '
    + 'bahkan jika halamannya sedang terbuka. Akun Firebase-nya tetap ada, dan '
    + 'wewenangnya bisa diberikan lagi lewat tombol Putuskan di antrean.')) return;

  const ketikan = prompt(
    `Konfirmasi kedua. Ketik nama orang itu persis seperti ini untuk melanjutkan:\n\n${nama}`);
  if(ketikan === null) return;
  if(ketikan.trim().toLowerCase() !== String(nama).trim().toLowerCase()){
    status('Nama yang diketik tidak sama. Pencabutan dibatalkan.', 'salah');
    return;
  }

  const ajuan = data.adminakun.find(x => x.id === uid);
  try{
    status('Mencabut wewenang…', 'sibuk');
    const batch = writeBatch(db);
    batch.delete(doc(db, 'admins', uid));
    if(ajuan){
      const muatan = {
        status: 'dicabut',
        nama: ajuan.nama, nrp: ajuan.nrp, email: ajuan.email,
        alasan: '',
        diputusPada: serverTimestamp(),
        diputusOleh: pemakai.email,
      };
      if(ajuan.dibuatPada) muatan.dibuatPada = ajuan.dibuatPada;
      batch.set(doc(db, 'adminakun', uid), muatan);
    }
    await batch.commit();

    await catat('hapus', 'akunoperasional', `${nama} · ${a.email || ''}`,
      'Wewenang pengurus operasional dicabut'
      + (a.diputusOleh ? `, sebelumnya diangkat oleh ${a.diputusOleh}` : ''));
    await muatSemua();
    status(`Wewenang ${nama} sudah dicabut.`, 'benar');
  }catch(err){
    console.error(err);
    status(err.code === 'permission-denied'
      ? 'Server menolak pencabutan ini. Kalau orangnya admin absolut, memang tidak bisa dicabut dari web. Kalau bukan, aturan Firestore mungkin belum diperbarui.'
      : 'Gagal mencabut: ' + err.message, 'salah');
  }
}

/* ---------- formulir keputusan ---------- */

function bukaKeputusanAkunOp(id){
  const a = data.adminakun.find(x => x.id === id);
  if(!a) return;
  $('aoUid').value = a.id;
  $('aoSiapa').textContent = `${a.nama || '(tanpa nama)'} · NRP ${a.nrp || '-'}`;
  $('aoRincian').textContent = a.email || '';
  $('aoStatus').value = statusAkunOp(a) === 'ditolak' ? 'ditolak' : 'diterima';
  // Baris yang pernah dicabut bisa diangkat kembali dari sini. Aturan
  // Firestore tetap menuntut nama dan emailnya sama dengan pengajuan aslinya.
  $('aoAlasan').value = a.alasan || '';
  bersihkanPesan($('pesanAkunOp'));
  $('formAkunOp').hidden = false;
  aturTampilanKeputusanOp();
  $('aoStatus').focus();
}

function tutupKeputusanAkunOp(){
  $('formAkunOp').hidden = true;
  $('aoUid').value = '';
  bersihkanPesan($('pesanAkunOp'));
}

function aturTampilanKeputusanOp(){
  const s = $('aoStatus').value;
  $('aoAlasanBungkus').hidden = (s !== 'ditolak');
  $('aoPeringatan').hidden = (s !== 'diterima');
}

$('aoStatus').addEventListener('change', aturTampilanKeputusanOp);
$('aoBatal').addEventListener('click', tutupKeputusanAkunOp);

$('formAkunOp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanAkunOp');
  const a = data.adminakun.find(x => x.id === $('aoUid').value);
  if(!a) return;

  const status_ = $('aoStatus').value;
  const alasan = $('aoAlasan').value.trim();

  if(status_ === 'ditolak' && !alasan){
    pesan(el, 'Isi alasan penolakan. Alasannya dibaca pendaftar saat mencoba masuk.', 'salah');
    return;
  }

  // Mengangkat pengurus tidak bisa dibatalkan dari sini, jadi tombolnya
  // minta ditekan dua kali, bukan sekali tersenggol.
  if(status_ === 'diterima' && el.dataset.konfirmasi !== '1'){
    pesan(el,
      `${esc(a.nama)} akan menjadi admin operasional: bisa mengubah semua jadwal, menerima pendaftar lain, `
      + 'dan mencabut admin operasional lain termasuk Anda. Tekan Simpan keputusan sekali lagi kalau memang benar.',
      'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  /*
    Identitas disalin apa adanya dari baris yang sudah tersimpan. Aturan
    Firestore menolak kalau nama, NRP, atau email berubah, dan menolak dokumen
    "admins" yang nama atau emailnya berbeda dari pengajuannya. Jadi keputusan
    tidak pernah bisa sekaligus menyunting siapa yang diangkat.
  */
  const muatan = {
    status: status_,
    nama: a.nama, nrp: a.nrp, email: a.email,
    alasan: status_ === 'ditolak' ? alasan : '',
    diputusPada: serverTimestamp(),
    diputusOleh: pemakai.email,
  };
  if(a.dibuatPada) muatan.dibuatPada = a.dibuatPada;

  try{
    status('Menyimpan keputusan…', 'sibuk');
    // Keputusan dan pengangkatannya ditulis dalam satu kelompok, supaya tidak
    // pernah ada keadaan setengah jadi: status diterima tanpa dokumen admins,
    // atau sebaliknya.
    const batch = writeBatch(db);
    batch.set(doc(db, 'adminakun', a.id), muatan);
    if(status_ === 'diterima'){
      batch.set(doc(db, 'admins', a.id), {
        nama: a.nama, email: a.email,
        diputusOleh: pemakai.email,
        diputusPada: serverTimestamp(),
      });
    }
    await batch.commit();

    await catat('ubah', 'akunoperasional',
      `${a.nama} · ${(STATUS_AKUN_OP[status_] || {}).label || status_}`,
      status_ === 'diterima'
        ? `Diangkat menjadi pengurus operasional, email ${a.email}, NRP ${a.nrp || 'tidak ada'}`
        : `Alasan: ${alasan}`);
    tutupKeputusanAkunOp();
    await muatSemua();
    status('Keputusan tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
    pesan(el, err.code === 'permission-denied'
      ? 'Server menolak keputusan ini. Biasanya berarti aturan Firestore belum diperbarui. Lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
      : esc(err.message || 'tidak diketahui'), 'salah');
  }
});

/* ============================================================
   8. Pengumuman
   ============================================================ */

function gambarPengumuman(){
  const t = $('tabelPengumuman');
  if(data.pengumuman.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada pengumuman.</td></tr></tbody>';
    return;
  }
  const hariIni = hariIniJakarta();
  const urut = [...data.pengumuman].sort((a,b) =>
    (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.mulai||'').localeCompare(String(a.mulai||'')));

  t.innerHTML = `
    <thead><tr><th>Judul</th><th>Tayang</th><th>Status</th><th></th></tr></thead>
    <tbody>${urut.map(p => {
      const belum = p.mulai && hariIni < p.mulai;
      const habis = p.selesai && hariIni > p.selesai;
      const stat = habis ? 'Sudah lewat' : (belum ? 'Belum tayang' : 'Sedang tayang');
      return `<tr${(belum||habis) ? ' style="opacity:.55"' : ''}>
        <td>${p.pin ? '<span class="op-lencana pin">Disematkan</span><br>' : ''}<strong>${esc(p.judul)}</strong>
            ${p.isi ? `<br><span class="op-samar">${esc(String(p.isi).slice(0,90))}${String(p.isi).length>90?'…':''}</span>` : ''}</td>
        <td class="op-samar">${esc(p.mulai || 'kapan saja')} s/d ${esc(p.selesai || 'seterusnya')}</td>
        <td class="op-samar">${esc(stat)}</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-ubah-pm="${esc(p.id)}">Ubah</button>
          <button class="op-mini op-hapus" data-hapus-pm="${esc(p.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-pm]').forEach(b => b.addEventListener('click', () => {
    const p = data.pengumuman.find(x => x.id === b.dataset.ubahPm);
    if(!p) return;
    $('pmId').value = p.id; $('pmJudul').value = p.judul; $('pmIsi').value = p.isi || '';
    $('pmMulai').value = p.mulai || ''; $('pmSelesai').value = p.selesai || '';
    $('pmPin').checked = !!p.pin;
    modeUbah('formPengumuman', true);
    $('pmJudul').focus();
  }));

  t.querySelectorAll('[data-hapus-pm]').forEach(b => b.addEventListener('click', async () => {
    const p = data.pengumuman.find(x => x.id === b.dataset.hapusPm);
    if(!p || !confirm(`Hapus pengumuman "${p.judul}"?`)) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'pengumuman', p.id));
      await catat('hapus', 'pengumuman', p.judul || '(tanpa judul)');
      await muatSemua();
      await terbitkan();
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

$('formPengumuman').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanPengumuman');
  const isi = {
    id: $('pmId').value,
    judul: $('pmJudul').value.trim(),
    isi: $('pmIsi').value.trim(),
    mulai: $('pmMulai').value,
    selesai: $('pmSelesai').value,
    pin: $('pmPin').checked,
  };

  const salah = [];
  if(!isi.judul) salah.push('Judul belum diisi.');
  if(isi.mulai && isi.selesai && isi.selesai < isi.mulai)
    salah.push('Tanggal berhenti tampil lebih awal daripada tanggal mulai.');
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  const muatan = { judul: isi.judul, isi: isi.isi, mulai: isi.mulai, selesai: isi.selesai, pin: isi.pin };
  try{
    status('Menyimpan…', 'sibuk');
    const lamaPm = isi.id ? data.pengumuman.find(x => x.id === isi.id) : null;
    if(isi.id) await updateDoc(doc(db, 'pengumuman', isi.id), muatan);
    else await addDoc(collection(db, 'pengumuman'), muatan);
    await catat(isi.id ? 'ubah' : 'tambah', 'pengumuman', muatan.judul || '(tanpa judul)',
      lamaPm ? bedaKolom(lamaPm, muatan, KOLOM_LOG.pengumuman) : '');
    e.target.reset(); $('pmId').value = ''; modeUbah('formPengumuman', false);
    bersihkanPesan(el);
    await muatSemua();
    await terbitkan();
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

/* ============================================================
   10. Menerbitkan ke halaman publik
   ============================================================ */

/*
  Halaman publik sengaja TIDAK membaca koleksi satu per satu, karena itu berarti
  puluhan pembacaan Firestore untuk setiap pengunjung. Sebagai gantinya seluruh
  isinya dirangkum jadi SATU dokumen di sini, sehingga pengunjung cukup membaca
  satu dokumen saja. Penulisan jarang, pembacaan sering, jadi kerja beratnya
  diletakkan di sisi penulisan.
*/
async function terbitkan(){
  status('Menerbitkan ke halaman publik…', 'sibuk');
  try{
    const days = [];
    for(const hari of ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']){
      const kelas = data.jadwal
        .filter(j => j.hari === hari)
        .sort((a,b) => (keMenit(a.mulai)||0) - (keMenit(b.mulai)||0))
        .map(j => ({
          kode: j.kode,
          nama: namaMatkul(j.kode) || j.kode,
          kp: j.kp,
          jam: rentangJam(j.mulai, j.selesai),
          ruang: j.ruang || '',
        }));
      if(kelas.length) days.push({ day: hari, classes: kelas });
    }

    const changes = [];
    for(const p of data.perubahan){
      const j = data.jadwal.find(x => x.id === p.jadwalId);
      if(!j) continue;   // kelasnya sudah dihapus, lewati
      const nama = namaMatkul(j.kode) || j.kode;

      if(p.tipe === 'libur'){
        changes.push({
          tanggal: p.tanggal, tipe: 'libur', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: j.ruang || '',
          catatan: p.catatan || 'Kelas ditiadakan',
        });
      }else if(p.tipe === 'pindah'){
        /*
          Pada tanggal aslinya kelas ini tidak berlangsung, TETAPI ada
          penggantinya. Itu keadaan yang berbeda dari benar-benar ditiadakan,
          jadi jenisnya "diganti", bukan "libur".

          Keterangan penggantinya dikirim sebagai kolom terpisah, bukan
          dirangkai jadi satu kalimat di sini. Halaman jadwal yang menyusun
          kalimatnya sendiri, sehingga bisa menampilkannya sebagai kepingan
          yang rapi dan bukan seuntai teks panjang.
        */
        changes.push({
          tanggal: p.tanggal, tipe: 'diganti', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: j.ruang || '',
          gantiTanggal: p.tanggalBaru,
          gantiJam: rentangJam(p.mulaiBaru, p.selesaiBaru),
          gantiRuang: p.ruangBaru || j.ruang || '',
          catatan: p.catatan || '',
        });
        changes.push({
          tanggal: p.tanggalBaru, tipe: 'pengganti', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(p.mulaiBaru, p.selesaiBaru), ruang: p.ruangBaru || j.ruang || '',
          catatan: p.catatan || `Kelas pengganti dari ${tanggalPanjang(p.tanggal)}`,
        });
      }else if(p.tipe === 'menyusul'){
        /*
          Perpindahan yang sudah pasti terjadi, tetapi belum tentu kapan dan di
          mana. Pada tanggal aslinya kelas ini TIDAK berlangsung, jadi tetap
          perlu ditandai supaya mahasiswa tidak datang percuma.

          Bedanya dengan "pindah": di sini tidak dijanjikan tanggal pengganti
          yang belum tentu benar. Yang sudah pasti disebut, sisanya disebut
          menyusul apa adanya.
        */
        changes.push({
          tanggal: p.tanggal, tipe: 'menyusul', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: j.ruang || '',
          // Kolom yang kosong berarti bagian itu memang belum ditentukan.
          // Halaman jadwal yang menuliskannya sebagai "menyusul".
          gantiTanggal: p.tanggalBaru || '',
          gantiJam: (p.mulaiBaru && p.selesaiBaru) ? rentangJam(p.mulaiBaru, p.selesaiBaru) : '',
          gantiRuang: p.ruangBaru || '',
          catatan: p.catatan || '',
        });

        // Jika tanggal dan jamnya ternyata sudah ditentukan, kelas
        // penggantinya ikut ditayangkan pada tanggal itu. Ruang yang belum
        // ditentukan ditulis "Menyusul", bukan dikosongkan, supaya kolom
        // ruangnya tidak terbaca seolah lupa diisi.
        if(p.tanggalBaru && p.mulaiBaru && p.selesaiBaru){
          changes.push({
            tanggal: p.tanggalBaru, tipe: 'pengganti', kode: j.kode, kp: j.kp, nama,
            jam: rentangJam(p.mulaiBaru, p.selesaiBaru),
            ruang: p.ruangBaru || 'Menyusul',
            catatan: p.catatan || `Kelas pengganti dari ${tanggalPanjang(p.tanggal)}`,
          });
        }
      }else if(p.tipe === 'ruang'){
        changes.push({
          tanggal: p.tanggal, tipe: 'ruang', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: p.ruangBaru || '',
          ruangLama: j.ruang || '',
          catatan: p.catatan || `Pindah ruang dari ${j.ruang || '(belum ada)'} ke ${p.ruangBaru}`,
        });
      }else if(p.tipe === 'daring'){
        // Jamnya tetap, yang berubah hanya tempatnya. Kolom ruang sengaja
        // diisi "Online" supaya tabel jadwal tetap terbaca wajar.
        changes.push({
          tanggal: p.tanggal, tipe: 'daring', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: 'Online',
          ruangLama: j.ruang || '',
          catatan: p.catatan || 'Kelas berlangsung daring',
        });
      }
    }
    changes.sort((a,b) => String(a.tanggal).localeCompare(String(b.tanggal)) || a.jam.localeCompare(b.jam));

    const hariIni = hariIniJakarta();
    const pengumuman = data.pengumuman
      .filter(p => (!p.mulai || p.mulai <= hariIni) && (!p.selesai || p.selesai >= hariIni))
      .sort((a,b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.mulai||'').localeCompare(String(a.mulai||'')))
      .map(p => ({ judul: p.judul, isi: p.isi || '', pin: !!p.pin, mulai: p.mulai || '', selesai: p.selesai || '' }));

    await setDoc(doc(db, 'publik', 'terkini'), {
      updatedAt: new Date().toISOString(),
      days, changes, pengumuman,
    });

    status('Tersimpan dan sudah tayang di halaman publik.', 'benar');
  }catch(err){
    console.error(err);
    status(
      'Data tersimpan, TETAPI gagal menerbitkan ke halaman publik: ' + err.message
      + '. Coba simpan ulang salah satu data supaya penerbitan diulang.', 'salah');
  }
}

/* ============================================================
   11. Excel: unduh, unggah, dan data pendampingnya
   ============================================================ */

/*
  Sumber kebenaran data adalah basis data, bukan berkas Excel.

  Pengurus tetap menerima berkas Informasi Kelas Asistensi tiap awal semester,
  jadi unggahan digunakan untuk mengisi sekali di depan. Sesudah itu perubahan
  cukup dilakukan di halaman ini, dan berkas Excel yang baru diambil lewat
  tombol unduh. Dengan begitu tidak ada dua salinan yang harus dijaga sama.

  Dua lembar Excel tidak punya tempat di koleksi yang sudah ada, yaitu kode
  Google Classroom dan daftar koordinator. Keduanya diberi koleksi sendiri,
  bukan ditempelkan sebagai kolom jadwal dan mata kuliah, karena kodenya
  sering tidak sama: lembar Contact Koor menggunakan kode kurikulum lain, dan
  lembar google classroom memuat mata kuliah yang tidak diampu KAFBE.
  Menempelkannya berarti membuang baris yang kodenya tidak cocok, dan berkas
  hasil unduhan jadi tidak lagi selengkap berkas aslinya.
*/

function kunciKelas(kode, kp){
  return `${String(kode || '').toUpperCase()}|${String(kp || '').toUpperCase()}`;
}

function isiDaftarKodeMk(){
  const el = $('daftarKodeMk');
  if(!el) return;
  el.innerHTML = data.matakuliah
    .map(m => `<option value="${esc(m.kode)}">${esc(m.nama)}</option>`).join('');
}

/* ---------- kode Google Classroom ---------- */

function gambarClassroom(){
  const t = $('tabelClassroom');
  const q = ($('cariClassroom').value || '').trim().toLowerCase();
  const baris = data.classroom
    .filter(c => !q || [c.kode, c.nama, namaMatkul(c.kode), c.kp, c.classroom].join(' ').toLowerCase().includes(q))
    .sort((a,b) =>
      String(namaMatkul(a.kode) || a.nama || a.kode).localeCompare(String(namaMatkul(b.kode) || b.nama || b.kode))
      || String(a.kp).localeCompare(String(b.kp)));

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      data.classroom.length
        ? 'Tidak ada yang cocok dengan pencarian.'
        : 'Belum ada kode kelas daring. Isi melalui formulir di atas atau unggah berkas Excel.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr><th>Kode</th><th>Mata kuliah</th><th>KP</th><th>Kode kelas</th><th></th></tr></thead>
    <tbody>${baris.map(c => `<tr>
      <td><strong>${esc(c.kode)}</strong></td>
      <td>${esc(namaMatkul(c.kode) || c.nama || '')}</td>
      <td>${esc(c.kp)}</td>
      <td>${esc(c.classroom || '')}</td>
      <td><div class="op-tombol-baris">
        <button class="op-mini" data-ubah-gc="${esc(c.id)}">Ubah</button>
        <button class="op-mini op-hapus" data-hapus-gc="${esc(c.id)}">Hapus</button>
      </div></td>
    </tr>`).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-gc]').forEach(b => b.addEventListener('click', () => {
    const c = data.classroom.find(x => x.id === b.dataset.ubahGc);
    if(!c) return;
    $('gcId').value = c.id; $('gcKode').value = c.kode; $('gcNama').value = c.nama || '';
    $('gcKp').value = c.kp; $('gcKelas').value = c.classroom || '';
    modeUbah('formClassroom', true);
    $('gcKode').focus();
  }));

  t.querySelectorAll('[data-hapus-gc]').forEach(b => b.addEventListener('click', async () => {
    const c = data.classroom.find(x => x.id === b.dataset.hapusGc);
    if(!c) return;
    if(!confirm(`Hapus kode kelas daring ${c.kode} KP ${c.kp}?`)) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'classroom', c.id));
      await catat('hapus', 'classroom', `${c.kode} KP ${c.kp} · ${c.classroom || 'tanpa kode'}`);
      await muatSemua();
      status('Terhapus.', 'benar');
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

$('cariClassroom').addEventListener('input', gambarClassroom);

$('formClassroom').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanClassroom');
  const id = $('gcId').value;
  const muatan = {
    kode: $('gcKode').value.trim().toUpperCase(),
    nama: $('gcNama').value.trim(),
    kp: $('gcKp').value.trim().toUpperCase(),
    classroom: $('gcKelas').value.trim(),
  };

  const salah = [];
  if(!muatan.kode) salah.push('Kode mata kuliah belum diisi.');
  if(!muatan.kp) salah.push('KP belum diisi.');
  const kembar = data.classroom.find(c =>
    c.id !== id && kunciKelas(c.kode, c.kp) === kunciKelas(muatan.kode, muatan.kp));
  if(kembar) salah.push(`${muatan.kode} KP ${muatan.kp} sudah punya kode kelas daring.`);
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  try{
    status('Menyimpan…', 'sibuk');
    const lamaGc = id ? data.classroom.find(x => x.id === id) : null;
    if(id) await updateDoc(doc(db, 'classroom', id), muatan);
    else await addDoc(collection(db, 'classroom'), muatan);
    await catat(id ? 'ubah' : 'tambah', 'classroom',
      `${muatan.kode} KP ${muatan.kp} · ${muatan.classroom || 'tanpa kode'}`,
      lamaGc ? bedaKolom(lamaGc, muatan, KOLOM_LOG.classroom) : '');
    e.target.reset(); $('gcId').value = ''; modeUbah('formClassroom', false);
    bersihkanPesan(el);
    await muatSemua();
    status('Tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

/* ---------- koordinator mata kuliah ---------- */

function gambarKoordinator(){
  const t = $('tabelKoordinator');
  if(data.koordinator.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada koordinator. Isi melalui formulir di atas atau unggah berkas Excel.</td></tr></tbody>';
    return;
  }
  const baris = [...data.koordinator].sort((a,b) =>
    String(a.nama || a.kode).localeCompare(String(b.nama || b.kode)));

  t.innerHTML = `
    <thead><tr><th>Kode</th><th>Mata kuliah</th><th>Koordinator</th><th>NRP</th><th>WA atau Line</th><th></th></tr></thead>
    <tbody>${baris.map(k => `<tr>
      <td><strong>${esc(k.kode)}</strong></td>
      <td>${esc(k.nama || namaMatkul(k.kode) || '')}</td>
      <td>${esc(k.koordinator || '')}</td>
      <td>${esc(k.nrp || '')}</td>
      <td>${esc(k.kontak || '')}</td>
      <td><div class="op-tombol-baris">
        <button class="op-mini" data-ubah-ko="${esc(k.id)}">Ubah</button>
        <button class="op-mini op-hapus" data-hapus-ko="${esc(k.id)}">Hapus</button>
      </div></td>
    </tr>`).join('')}</tbody>`;

  t.querySelectorAll('[data-ubah-ko]').forEach(b => b.addEventListener('click', () => {
    const k = data.koordinator.find(x => x.id === b.dataset.ubahKo);
    if(!k) return;
    $('koId').value = k.id; $('koKode').value = k.kode; $('koNama').value = k.nama || '';
    $('koNama2').value = k.koordinator || ''; $('koNrp').value = k.nrp || '';
    $('koKontak').value = k.kontak || '';
    modeUbah('formKoordinator', true);
    $('koKode').focus();
  }));

  t.querySelectorAll('[data-hapus-ko]').forEach(b => b.addEventListener('click', async () => {
    const k = data.koordinator.find(x => x.id === b.dataset.hapusKo);
    if(!k) return;
    if(!confirm(`Hapus koordinator untuk ${k.nama || k.kode}?`)) return;
    try{
      status('Menghapus…', 'sibuk');
      await deleteDoc(doc(db, 'koordinator', k.id));
      await catat('hapus', 'koordinator', `${k.kode} · ${k.koordinator || 'tanpa nama'}`);
      await muatSemua();
      status('Terhapus.', 'benar');
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

$('formKoordinator').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanKoordinator');
  const id = $('koId').value;
  const muatan = {
    kode: $('koKode').value.trim().toUpperCase(),
    nama: $('koNama').value.trim(),
    koordinator: $('koNama2').value.trim(),
    nrp: $('koNrp').value.trim(),
    kontak: $('koKontak').value.trim(),
  };

  const salah = [];
  if(!muatan.kode) salah.push('Kode mata kuliah belum diisi.');
  const kembar = data.koordinator.find(k => k.id !== id && k.kode === muatan.kode);
  if(kembar) salah.push(`Kode ${muatan.kode} sudah terdaftar atas nama "${kembar.koordinator || 'tanpa koordinator'}".`);
  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  try{
    status('Menyimpan…', 'sibuk');
    const lamaKo = id ? data.koordinator.find(x => x.id === id) : null;
    if(id) await updateDoc(doc(db, 'koordinator', id), muatan);
    else await addDoc(collection(db, 'koordinator'), muatan);
    await catat(id ? 'ubah' : 'tambah', 'koordinator',
      `${muatan.kode} · ${muatan.koordinator || 'tanpa nama'}`,
      lamaKo ? bedaKolom(lamaKo, muatan, KOLOM_LOG.koordinator) : '');
    e.target.reset(); $('koId').value = ''; modeUbah('formKoordinator', false);
    bersihkanPesan(el);
    await muatSemua();
    status('Tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    status('Gagal menyimpan: ' + err.message, 'salah');
  }
});

/* ---------- unduh ---------- */

$('xlUnduh').addEventListener('click', async () => {
  const el = $('pesanUnduh');
  bersihkanPesan(el);
  try{
    status('Menyusun berkas Excel…', 'sibuk');
    const blob = await susunBerkas({
      matakuliah: data.matakuliah,
      jadwal: data.jadwal,
      pengajar: data.pengajar.map(p => ({ kode: p.kode, kp: p.kp, pengajar: p.nama, nrp: p.nrp })),
      classroom: data.classroom,
      koordinator: data.koordinator,
    });
    const hariIni = hariIniJakarta();
    unduhBlob(blob, `INFORMASI KELAS ASISTENSI ${hariIni}.xlsx`);
    pesan(el, `Berkas terunduh dengan nama "INFORMASI KELAS ASISTENSI ${hariIni}.xlsx".`, 'benar');
    status('Berkas Excel selesai disusun.', 'benar');
  }catch(err){
    console.error(err);
    pesan(el, 'Gagal menyusun berkas: ' + esc(err.message), 'salah');
    status('Gagal menyusun berkas Excel.', 'salah');
  }
});

/* ---------- unggah ---------- */

/*
  Hasil pembacaan berkas disandingkan dengan isi basis data, lalu ditahan di
  sini sampai pengurus menekan tombol simpan.

  Pemisahan ini disengaja. Berkas yang salah lembar atau salah kolom akan
  terlihat sebagai daftar yang aneh, misalnya "menghapus 73 kelas", dan masih
  bisa dibatalkan tanpa apa pun tersimpan.

  usulanExcel   daftar rata semua perubahan yang menunggu keputusan
  usulanDiubah  id baris yang sedang disunting, atau null
  ringkasBerkas keterangan tentang berkasnya: lembar yang terbaca, baris yang
                dilewati, catatan pembacaan, dan jumlah yang sudah sama
*/
let usulanExcel = null;
let usulanDiubah = null;
let ringkasBerkas = null;

function ringkasKelas(j){
  return `${j.kode} KP ${j.kp}`;
}

// Daftar contoh dibatasi supaya ringkasannya tetap bisa dibaca sekali lihat.
function contohnya(daftar, batas = 12){
  const isi = daftar.slice(0, batas).map(t => `<li>${esc(t)}</li>`).join('');
  const sisa = daftar.length - batas;
  return `<ul>${isi}${sisa > 0 ? `<li>dan ${sisa} lainnya</li>` : ''}</ul>`;
}

function susunRencana(hasil){
  const r = {
    mkBaru: [], mkUbah: [],
    jdBaru: [], jdUbah: [], jdHapus: [],
    pgBaru: [], pgHapus: [],
    gcBaru: [], gcUbah: [], gcHapus: [],
    koBaru: [], koUbah: [], koHapus: [],
    dilewati: [], masalah: [...hasil.masalah],
    // Yang isinya sama persis tidak ditulis ulang ke basis data, tetapi tetap
    // dihitung. Tanpa angka ini, pengurus tidak punya cara tahu bedanya
    // "berkasnya memang hanya mengubah tiga kelas" dengan "berkasnya salah
    // lembar sehingga sisanya tidak terbaca".
    tetap: { matakuliah: 0, jadwal: 0, pengajar: 0, classroom: 0, koordinator: 0 },
  };

  // ---------- mata kuliah ----------
  const mkLama = new Map(data.matakuliah.map(m => [m.kode, m]));
  for(const m of hasil.matakuliah){
    const lama = mkLama.get(m.kode);
    if(!lama) r.mkBaru.push({ kode: m.kode, nama: m.nama });
    else if(lama.nama !== m.nama) r.mkUbah.push({ id: lama.id, kode: m.kode, nama: m.nama, namaLama: lama.nama });
    else r.tetap.matakuliah++;
  }

  /*
    Baris kembar di dalam satu berkas diselesaikan dengan aturan yang sama di
    mana-mana: yang paling bawah digunakan, dan kejadiannya diberitahukan.

    Alasannya, baris yang lebih bawah biasanya hasil pembetulan yang ditambah
    belakangan. Yang penting bukan tebakan itu benar atau tidak, melainkan
    pengurus tahu bahwa berkasnya memuat dua baris berbeda untuk hal yang sama.
  */
  const satukan = (daftar, ambilKunci, sebutan) => {
    const peta = new Map();
    for(const isi of daftar){
      const k = ambilKunci(isi);
      if(peta.has(k)){
        r.dilewati.push(`Baris ${isi.baris}: ${sebutan(isi)} muncul lebih dari sekali di berkas, yang terakhir digunakan.`);
      }
      peta.set(k, isi);
    }
    return peta;
  };

  // ---------- jadwal ----------
  const jdLama = new Map(data.jadwal.map(j => [kunciKelas(j.kode, j.kp), j]));
  const layak = hasil.jadwal.filter(j => {
    if(j.hari && j.mulai && j.selesai) return true;
    r.dilewati.push(`Baris ${j.baris}: ${ringkasKelas(j)} belum punya hari atau jam yang terbaca.`);
    return false;
  });
  const jdBerkas = satukan(layak, j => kunciKelas(j.kode, j.kp), j => ringkasKelas(j));

  for(const [k, j] of jdBerkas){
    const muatan = { kode: j.kode, kp: j.kp, hari: j.hari, mulai: j.mulai, selesai: j.selesai, ruang: j.ruang || '' };
    const lama = jdLama.get(k);
    if(!lama){ r.jdBaru.push(muatan); continue; }
    const berubah = ['hari','mulai','selesai','ruang'].some(f => (lama[f] || '') !== muatan[f]);
    if(berubah) r.jdUbah.push({ id: lama.id, ...muatan, lama });
    else r.tetap.jadwal++;
  }
  r.jdHapus = data.jadwal.filter(j => !jdBerkas.has(kunciKelas(j.kode, j.kp)));

  // ---------- pengajar ----------
  const kunciPengajar = p => `${kunciKelas(p.kode, p.kp)}|${String(p.nrp || '').trim() || String(p.nama || p.pengajar || '').toLowerCase()}`;
  const pgLama = new Map(data.pengajar.map(p => [kunciPengajar(p), p]));
  const pgDipakai = new Set();
  for(const p of hasil.pengajar){
    const baru = { kode: p.kode, kp: p.kp, nama: p.pengajar, nrp: p.nrp };
    const k = kunciPengajar(baru);
    if(pgDipakai.has(k)) continue;
    pgDipakai.add(k);
    if(!pgLama.has(k)) r.pgBaru.push(baru);
    else r.tetap.pengajar++;
  }
  r.pgHapus = data.pengajar.filter(p => !pgDipakai.has(kunciPengajar(p)));

  // ---------- kode Google Classroom ----------
  const gcLama = new Map(data.classroom.map(c => [kunciKelas(c.kode, c.kp), c]));
  const gcBerkas = satukan(hasil.classroom, c => kunciKelas(c.kode, c.kp),
    c => `kode kelas daring ${c.kode} KP ${c.kp}`);
  for(const [k, c] of gcBerkas){
    const muatan = { kode: c.kode, nama: c.nama || '', kp: c.kp, classroom: c.classroom || '' };
    const lama = gcLama.get(k);
    if(!lama) r.gcBaru.push(muatan);
    else if((lama.classroom || '') !== muatan.classroom || (lama.nama || '') !== muatan.nama)
      r.gcUbah.push({ id: lama.id, ...muatan, lama });
    else r.tetap.classroom++;
  }
  r.gcHapus = data.classroom.filter(c => !gcBerkas.has(kunciKelas(c.kode, c.kp)));

  // ---------- koordinator ----------
  const koLama = new Map(data.koordinator.map(k => [k.kode, k]));
  const koBerkas = satukan(hasil.koordinator, k => k.kode, k => `koordinator kode ${k.kode}`);
  for(const [kode, k] of koBerkas){
    const muatan = {
      kode, nama: k.nama || '', koordinator: k.koordinator || '',
      nrp: k.nrp || '', kontak: k.kontak || '',
    };
    const lama = koLama.get(kode);
    if(!lama) r.koBaru.push(muatan);
    else if(['nama','koordinator','nrp','kontak'].some(f => (lama[f] || '') !== muatan[f]))
      r.koUbah.push({ id: lama.id, ...muatan, lama });
    else r.tetap.koordinator++;
  }
  r.koHapus = data.koordinator.filter(k => !koBerkas.has(k.kode));

  /*
    Kelas yang kodenya tidak ada di daftar Mata Kuliah tetap ikut tersimpan,
    tetapi harus disebutkan.

    Halaman publik menampilkan kode mentah jika namanya tidak ketemu, dan itu
    tidak terbaca siapa pun. Formulir Jadwal Permanen sudah menolak keadaan
    seperti ini sejak awal, jadi unggahan tidak boleh diam-diam membuatnya.
  */
  const kodeDikenal = new Set([...data.matakuliah.map(m => m.kode), ...r.mkBaru.map(m => m.kode)]);
  const yatim = [...new Set([...r.jdBaru, ...r.jdUbah].map(j => j.kode).filter(k => !kodeDikenal.has(k)))];
  for(const kode of yatim){
    r.masalah.push(`Kode ${kode} digunakan di lembar jadwal tetapi tidak punya nama mata kuliah di berkas mana pun. Kelasnya tetap masuk, tetapi isi namanya melalui tab Mata Kuliah supaya tidak tampil sebagai kode di halaman jadwal.`);
  }

  return r;
}

/*
  Perbandingan berkas dengan isi basis data, baris per baris.

  Yang ditampilkan bukan sekadar hitungan, melainkan tiap barisnya beserta nilai
  lamanya. Pengurus perlu bisa menjawab satu pertanyaan sebelum menekan simpan:
  apa persisnya yang akan berubah pada data yang sudah tayang. Angka "5 kelas
  diperbarui" tidak menjawab itu.

  Tiap baris juga bisa diperlakukan sendiri-sendiri. Berkas Excel disusun banyak
  tangan dan tidak selalu benar seluruhnya, jadi memaksa pengurus menerima
  semuanya atau menolak semuanya akan membuat mereka menolak semuanya, lalu
  mengetik ulang secara manual. Karena itu tiap baris punya tiga tindakan:

    centang  menentukan baris itu ikut disimpan atau tidak
    Ubah     menyunting nilai yang akan disimpan, sebelum tersimpan
    silang   membuang baris itu dari daftar sama sekali

  Keadaan tiap baris dibedakan dengan warna sekaligus kata, tidak hanya warna,
  supaya tetap terbaca oleh yang kesulitan membedakan warna dan tetap masuk akal
  jika halamannya dicetak hitam putih.
*/
const TANDA = {
  tambah: { kelas: 'pra-tambah', label: 'Baru' },
  ubah:   { kelas: 'pra-ubah',   label: 'Berubah' },
  hapus:  { kelas: 'pra-hapus',  label: 'Dihapus' },
  diam:   { kelas: 'pra-diam',   label: 'Dibiarkan' },
  tolak:  { kelas: 'pra-tolak',  label: 'Tidak disimpan' },
};

const JUDUL_BAGIAN = {
  matakuliah: 'Mata kuliah',
  jadwal: 'Jadwal dan ruang kelas',
  pengajar: 'Pengajar',
  classroom: 'Kode Google Classroom',
  koordinator: 'Koordinator',
};

/*
  Kolom tiap bagian, sekaligus penentu apa yang boleh disunting.

  Kolom penanda identitas dikunci pada baris yang sudah ada di web. Kode dan KP
  adalah tali yang menghubungkan baris berkas dengan dokumen yang tersimpan.
  Jika keduanya boleh diubah di sini, baris ini akan menimpa dokumen yang salah
  tanpa ada yang menyadari.
*/
const KOLOM_BAGIAN = {
  matakuliah: [
    { k:'kode', label:'Kode', ubah:'tambah' },
    { k:'nama', label:'Nama', ubah:true, wajib:true },
  ],
  jadwal: [
    { k:'kode', label:'Kode' },
    { k:'namaMk', label:'Mata kuliah', turunan: u => namaMatkul(u.muatan.kode) || '' },
    { k:'kp', label:'KP', ubah:'tambah', wajib:true },
    { k:'hari', label:'Hari', jenis:'hari', ubah:true, wajib:true },
    { k:'jam', label:'Jam', jenis:'jam', ubah:true },
    { k:'ruang', label:'Ruang', ubah:true },
  ],
  pengajar: [
    { k:'kode', label:'Kode' },
    { k:'namaMk', label:'Mata kuliah', turunan: u => namaMatkul(u.muatan.kode) || '' },
    { k:'kp', label:'KP', ubah:'tambah', wajib:true },
    { k:'nama', label:'Nama', ubah:true, wajib:true },
    { k:'nrp', label:'NRP', ubah:true },
  ],
  classroom: [
    { k:'kode', label:'Kode' },
    { k:'nama', label:'Mata kuliah', ubah:true },
    { k:'kp', label:'KP', ubah:'tambah', wajib:true },
    { k:'classroom', label:'Kode kelas', ubah:true },
  ],
  koordinator: [
    { k:'kode', label:'Kode', ubah:'tambah', wajib:true },
    { k:'nama', label:'Mata kuliah', ubah:true },
    { k:'koordinator', label:'Koordinator', ubah:true },
    { k:'nrp', label:'NRP', ubah:true },
    { k:'kontak', label:'WA atau Line', ubah:true },
  ],
};

const HARI_PILIHAN = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

/*
  Rencana perbandingan diratakan menjadi satu daftar usulan.

  Bentuk ini yang membuat tiap baris bisa dicentang, disunting, dan dibuang
  tanpa perlu tahu ia berasal dari kelompok mana. Yang disimpan nanti dibangun
  dari daftar ini juga, jadi apa yang terlihat di layar persis itu yang ditulis.
*/
function buatUsulan(r, bersihkan){
  const out = [];
  let n = 0;
  const tambah = (koleksi, jenis, muatan, lama, docId) => out.push({
    id: 'u' + (++n), koleksi, jenis, muatan, lama: lama || null, docId: docId || null,
    // Penghapusan tidak dicentang sejak awal kecuali pengurus memang memintanya
    // lewat centang di formulir. Membuang data harus selalu tindakan yang
    // disengaja, bukan bawaan.
    terima: jenis !== 'hapus' || bersihkan,
    dibuang: false,
  });

  r.mkBaru.forEach(m => tambah('matakuliah', 'tambah', { kode:m.kode, nama:m.nama }));
  r.mkUbah.forEach(m => tambah('matakuliah', 'ubah', { kode:m.kode, nama:m.nama },
    { kode:m.kode, nama:m.namaLama }, m.id));

  const isiJadwal = j => ({ kode:j.kode, kp:j.kp, hari:j.hari, mulai:j.mulai, selesai:j.selesai, ruang:j.ruang || '' });
  r.jdBaru.forEach(j => tambah('jadwal', 'tambah', isiJadwal(j)));
  r.jdUbah.forEach(j => tambah('jadwal', 'ubah', isiJadwal(j), j.lama, j.id));
  r.jdHapus.forEach(j => tambah('jadwal', 'hapus', isiJadwal(j), null, j.id));

  r.pgBaru.forEach(p => tambah('pengajar', 'tambah', { kode:p.kode, kp:p.kp, nama:p.nama, nrp:p.nrp || '' }));
  r.pgHapus.forEach(p => tambah('pengajar', 'hapus', { kode:p.kode, kp:p.kp, nama:p.nama, nrp:p.nrp || '' }, null, p.id));

  const isiGc = c => ({ kode:c.kode, nama:c.nama || '', kp:c.kp, classroom:c.classroom || '' });
  r.gcBaru.forEach(c => tambah('classroom', 'tambah', isiGc(c)));
  r.gcUbah.forEach(c => tambah('classroom', 'ubah', isiGc(c), c.lama, c.id));
  r.gcHapus.forEach(c => tambah('classroom', 'hapus', isiGc(c), null, c.id));

  const isiKo = k => ({ kode:k.kode, nama:k.nama || '', koordinator:k.koordinator || '', nrp:k.nrp || '', kontak:k.kontak || '' });
  r.koBaru.forEach(k => tambah('koordinator', 'tambah', isiKo(k)));
  r.koUbah.forEach(k => tambah('koordinator', 'ubah', isiKo(k), k.lama, k.id));
  r.koHapus.forEach(k => tambah('koordinator', 'hapus', isiKo(k), null, k.id));

  return out;
}

// Nilai lama ditampilkan berdampingan dengan nilai barunya, bukan digantikan
// begitu saja, supaya yang berubah bisa dilihat tanpa membuka tab lain.
function selNilai(lama, baru){
  const a = String(lama == null ? '' : lama);
  const b = String(baru == null ? '' : baru);
  if(a === b) return esc(b);
  return `<span class="pra-lama">${esc(a || '(kosong)')}</span> `
    + `<span class="pra-panah" aria-hidden="true">→</span> `
    + `<span class="pra-baru-nilai">${esc(b || '(kosong)')}</span>`;
}

function nilaiKolom(u, kol){
  if(kol.turunan) return esc(kol.turunan(u));
  if(kol.jenis === 'jam'){
    const baru = rentangJam(u.muatan.mulai, u.muatan.selesai);
    return (u.jenis === 'ubah' && u.lama)
      ? selNilai(rentangJam(u.lama.mulai, u.lama.selesai), baru) : esc(baru);
  }
  const baru = u.muatan[kol.k] == null ? '' : u.muatan[kol.k];
  return (u.jenis === 'ubah' && u.lama) ? selNilai(u.lama[kol.k], baru) : esc(baru);
}

function isianKolom(u, kol){
  if(kol.turunan) return esc(kol.turunan(u));
  const bolehUbah = kol.ubah === true || (kol.ubah === 'tambah' && u.jenis === 'tambah');
  if(!bolehUbah) return `<span class="pra-terkunci">${nilaiKolom(u, kol)}</span>`;

  const dasar = `data-isian="${esc(u.id)}"`;
  if(kol.jenis === 'hari'){
    return `<select ${dasar} data-kunci="hari" aria-label="Hari">
      ${HARI_PILIHAN.map(h => `<option value="${h}"${h === u.muatan.hari ? ' selected' : ''}>${h}</option>`).join('')}
    </select>`;
  }
  if(kol.jenis === 'jam'){
    return `<div class="pra-jam">
      <input type="time" ${dasar} data-kunci="mulai" value="${esc(u.muatan.mulai || '')}" aria-label="Jam mulai" />
      <input type="time" ${dasar} data-kunci="selesai" value="${esc(u.muatan.selesai || '')}" aria-label="Jam selesai" />
    </div>`;
  }
  return `<input type="text" ${dasar} data-kunci="${esc(kol.k)}" value="${esc(u.muatan[kol.k] || '')}" aria-label="${esc(kol.label)}" />`;
}

function tandaUsulan(u){
  if(!u.terima) return u.jenis === 'hapus' ? TANDA.diam : TANDA.tolak;
  return TANDA[u.jenis];
}

function barisUsulan(u, kolom){
  const sedangDiubah = u.id === usulanDiubah;
  const tanda = tandaUsulan(u);
  const bolehDiubah = u.jenis !== 'hapus';

  const sel = kolom.map(kol =>
    `<td>${sedangDiubah ? isianKolom(u, kol) : nilaiKolom(u, kol)}</td>`).join('');

  const tindakan = sedangDiubah
    ? `<button type="button" class="op-mini" data-simpan-baris="${esc(u.id)}">Simpan baris</button>
       <button type="button" class="op-mini" data-batal-baris="${esc(u.id)}">Batal</button>`
    : `${bolehDiubah ? `<button type="button" class="op-mini" data-ubah-baris="${esc(u.id)}">Ubah</button>` : ''}
       <button type="button" class="op-mini op-hapus pra-silang" data-buang-baris="${esc(u.id)}"
               title="Buang baris ini dari daftar" aria-label="Buang baris ini dari daftar">✕</button>`;

  return `
    <tr class="${tanda.kelas}${u.terima ? '' : ' pra-mati'}">
      <td class="pra-sel-pilih">
        <input type="checkbox" data-terima="${esc(u.id)}"${u.terima ? ' checked' : ''}
               aria-label="Simpan baris ini" />
      </td>
      <td><span class="pra-tanda">${esc(tanda.label)}</span></td>
      ${sel}
      <td><div class="op-tombol-baris">${tindakan}</div></td>
    </tr>`;
}

function tabelUsulan(koleksi, daftar){
  if(daftar.length === 0) return '';
  const kolom = KOLOM_BAGIAN[koleksi];
  const digunakan = daftar.filter(u => u.terima).length;
  return `
    <h4>${esc(JUDUL_BAGIAN[koleksi])}
      <span class="pra-jumlah">${digunakan} dari ${daftar.length} disimpan</span></h4>
    <div class="op-tabel-bungkus">
      <table class="op-tabel pra-tabel">
        <thead><tr>
          <th>Simpan</th>
          <th>Status</th>
          ${kolom.map(k => `<th>${esc(k.label)}</th>`).join('')}
          <th>Tindakan</th>
        </tr></thead>
        <tbody>${daftar.map(u => barisUsulan(u, kolom)).join('')}</tbody>
      </table>
    </div>`;
}

function gambarPratinjau(){
  const sisa = usulanExcel.filter(u => !u.dibuang);
  const diterima = sisa.filter(u => u.terima);
  const hitung = jenis => diterima.filter(u => u.jenis === jenis).length;
  const dibuang = usulanExcel.length - sisa.length;
  const jumlahTetap = Object.values(ringkasBerkas.tetap).reduce((a,b) => a + b, 0);

  const chip = (kelas, angka, kata) =>
    `<span class="pra-chip ${kelas}"><strong>${angka}</strong> ${esc(kata)}</span>`;

  const isi = Object.keys(JUDUL_BAGIAN)
    .map(koleksi => tabelUsulan(koleksi, sisa.filter(u => u.koleksi === koleksi)))
    .join('');

  const r = ringkasBerkas;
  const catatan = [
    r.dilewati.length ? `<h4>Baris yang dilewati <span class="pra-jumlah">${r.dilewati.length}</span></h4>${contohnya(r.dilewati)}` : '',
    r.masalah.length ? `<h4>Catatan pembacaan <span class="pra-jumlah">${r.masalah.length}</span></h4>${contohnya(r.masalah)}` : '',
  ].join('');

  $('pratinjauExcel').innerHTML = `
    <div class="op-pratinjau">
      <div class="pra-kepala">
        <h3>Perbandingan berkas dengan data di web</h3>
        <p class="pra-tenang">
          Belum ada satu pun yang tersimpan. Yang dicentang di bawah ini baru berlaku
          setelah tombol <strong>Simpan perubahan</strong> ditekan.
        </p>
        <div class="pra-chip-baris">
          ${chip('pra-tambah', hitung('tambah'), 'ditambahkan')}
          ${chip('pra-ubah', hitung('ubah'), 'diubah')}
          ${chip('pra-hapus', hitung('hapus'), 'dihapus')}
          ${chip('pra-tetap', jumlahTetap, 'sudah sama')}
        </div>
        <p class="op-catatan">
          Tiap baris bisa diatur sendiri. Hilangkan centangnya supaya baris itu tidak
          ikut tersimpan, tekan <strong>Ubah</strong> untuk membetulkan isinya lebih
          dulu, atau tekan tanda silang untuk membuang baris itu dari daftar.
          ${dibuang ? `<strong>${dibuang} baris sudah dibuang dari daftar ini.</strong>` : ''}
        </p>
        <p class="op-catatan">
          Lembar yang terbaca: ${esc(r.lembarTerbaca.join(', ') || 'tidak ada')}.
          ${r.lembarLain.length ? `Lembar yang tidak dibaca: ${esc(r.lembarLain.join(', '))}.` : ''}
        </p>
      </div>
      ${sisa.length === 0
        ? '<p class="pra-sama">Tidak ada lagi baris yang menunggu keputusan.</p>' : ''}
      ${isi}
      ${catatan}
    </div>`;

  // Tombol simpan ikut mati jika tidak ada satu pun baris yang dicentang,
  // supaya tidak ada penyimpanan yang tidak menghasilkan apa-apa.
  $('xlTerapkan').hidden = usulanExcel.length === 0;
  $('xlTerapkan').disabled = diterima.length === 0;
  $('xlTerapkan').textContent = diterima.length
    ? `Simpan ${diterima.length} perubahan` : 'Simpan perubahan';
}

/* ---------- tindakan per baris ---------- */

function cariUsulan(id){
  return usulanExcel ? usulanExcel.find(u => u.id === id) : null;
}

/*
  Baris yang disunting diperiksa sebelum diterima kembali ke daftar.

  Pemeriksaannya sengaja sederhana dan hanya menyangkut isi baris itu sendiri.
  Bentrok ruang dan bentrok jam mengajar tetap diperiksa oleh formulir Jadwal
  Permanen dan Pengajar seperti biasa, dan tidak diulang di sini supaya
  penyuntingan cepat tidak berubah menjadi wawancara panjang.
*/
function periksaBarisUsulan(u, isian){
  const salah = [];
  for(const kol of KOLOM_BAGIAN[u.koleksi]){
    if(!kol.wajib) continue;
    const bolehUbah = kol.ubah === true || (kol.ubah === 'tambah' && u.jenis === 'tambah');
    if(!bolehUbah) continue;
    if(kol.jenis === 'jam') continue;
    if(!String(isian[kol.k] || '').trim()) salah.push(`${kol.label} tidak boleh kosong.`);
  }

  if(u.koleksi === 'jadwal'){
    const m1 = keMenit(isian.mulai), m2 = keMenit(isian.selesai);
    if(m1 === null) salah.push('Jam mulai tidak valid.');
    if(m2 === null) salah.push('Jam selesai tidak valid.');
    if(m1 !== null && m2 !== null && m2 <= m1) salah.push('Jam selesai harus lebih akhir daripada jam mulai.');
  }

  // Dua baris yang menunjuk kelas yang sama akan saling menimpa saat disimpan,
  // dan yang menang tidak bisa ditebak. Lebih baik ditolak sekarang.
  const kunci = u.koleksi === 'koordinator' || u.koleksi === 'matakuliah'
    ? x => String(x.kode || '').toUpperCase()
    : x => kunciKelas(x.kode, x.kp) + (u.koleksi === 'pengajar' ? '|' + String(x.nrp || x.nama || '') : '');
  const kunciBaru = kunci({ ...u.muatan, ...isian });
  const kembar = usulanExcel.find(x =>
    x !== u && !x.dibuang && x.terima && x.koleksi === u.koleksi && kunci(x.muatan) === kunciBaru);
  if(kembar) salah.push('Sudah ada baris lain di daftar ini yang menunjuk data yang sama.');

  return salah;
}

$('pratinjauExcel').addEventListener('change', (e) => {
  const centang = e.target.closest('[data-terima]');
  if(!centang) return;
  const u = cariUsulan(centang.dataset.terima);
  if(!u) return;
  u.terima = centang.checked;
  gambarPratinjau();
});

$('pratinjauExcel').addEventListener('click', (e) => {
  const tombol = e.target.closest('button');
  if(!tombol) return;
  const el = $('pesanExcel');

  if(tombol.dataset.ubahBaris){
    usulanDiubah = tombol.dataset.ubahBaris;
    bersihkanPesan(el);
    gambarPratinjau();
    const isian = $('pratinjauExcel').querySelector(`[data-isian="${usulanDiubah}"]`);
    if(isian) isian.focus();
    return;
  }

  if(tombol.dataset.batalBaris){
    usulanDiubah = null;
    bersihkanPesan(el);
    gambarPratinjau();
    return;
  }

  if(tombol.dataset.buangBaris){
    const u = cariUsulan(tombol.dataset.buangBaris);
    if(!u) return;
    u.dibuang = true;
    if(usulanDiubah === u.id) usulanDiubah = null;
    gambarPratinjau();
    return;
  }

  if(tombol.dataset.simpanBaris){
    const u = cariUsulan(tombol.dataset.simpanBaris);
    if(!u) return;
    const isian = {};
    document.querySelectorAll(`[data-isian="${u.id}"]`).forEach(inp => {
      isian[inp.dataset.kunci] = inp.value.trim();
    });
    if(isian.kode) isian.kode = isian.kode.toUpperCase();
    if(isian.kp) isian.kp = isian.kp.toUpperCase();

    const salah = periksaBarisUsulan(u, isian);
    if(salah.length){ pesan(el, daftarKesalahan('Baris ini belum bisa diterima:', salah), 'salah'); return; }

    Object.assign(u.muatan, isian);
    // Baris yang baru saja dibetulkan hampir pasti dimaksudkan untuk ikut
    // tersimpan, jadi centangnya dinyalakan sekalian.
    u.terima = true;
    usulanDiubah = null;
    bersihkanPesan(el);
    gambarPratinjau();
  }
});

$('formExcel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanExcel');
  bersihkanPesan(el);
  $('xlTerapkan').hidden = true;
  usulanExcel = null;
  usulanDiubah = null;

  const file = $('xlBerkas').files[0];
  if(!file){ pesan(el, 'Pilih berkas Excel-nya dulu.', 'salah'); return; }

  try{
    status('Membaca berkas…', 'sibuk');
    const hasil = await bacaBerkas(file);
    const r = susunRencana(hasil);
    usulanExcel = buatUsulan(r, $('xlBersihkan').checked);
    ringkasBerkas = {
      lembarTerbaca: hasil.lembarTerbaca, lembarLain: hasil.lembarLain,
      dilewati: r.dilewati, masalah: r.masalah, tetap: r.tetap,
    };

    if(usulanExcel.length === 0){
      $('pratinjauExcel').innerHTML =
        '<div class="op-pratinjau"><p class="pra-sama">Tidak ada yang berbeda. '
        + 'Isi berkas sama dengan data yang sedang tersimpan di web.</p></div>';
      usulanExcel = null;
      status('Berkas terbaca dan isinya sudah sama dengan data yang tersimpan.', 'benar');
      return;
    }

    gambarPratinjau();
    status('Berkas terbaca. Belum ada yang tersimpan. Periksa perbandingannya, atur tiap baris jika perlu, lalu tekan Simpan perubahan.', 'benar');
  }catch(err){
    console.error(err);
    $('pratinjauExcel').innerHTML = '';
    usulanExcel = null;
    pesan(el, 'Berkas tidak bisa dibaca: ' + esc(err.message), 'salah');
    status('Berkas Excel tidak bisa dibaca.', 'salah');
  }
});

// Mengubah centang penghapusan sesudah daftar tersusun akan mengubah arti baris
// merahnya, sedangkan keputusan per baris yang sudah diambil pengurus tidak
// pantas ditimpa diam-diam. Daftarnya dibatalkan dan berkasnya dibandingkan lagi.
$('xlBersihkan').addEventListener('change', () => {
  if(!usulanExcel) return;
  usulanExcel = null;
  usulanDiubah = null;
  $('xlTerapkan').hidden = true;
  $('pratinjauExcel').innerHTML = '';
  pesan($('pesanExcel'), 'Pilihan penghapusan berubah. Tekan "Bandingkan dengan data di web" sekali lagi.', 'hati');
});

$('xlBerkas').addEventListener('change', () => {
  usulanExcel = null;
  usulanDiubah = null;
  $('xlTerapkan').hidden = true;
  $('pratinjauExcel').innerHTML = '';
  bersihkanPesan($('pesanExcel'));
});

/*
  Penulisan dilakukan berkelompok, bukan satu per satu.

  Satu berkas bisa berisi ratusan baris. Jika ditulis satu per satu, prosesnya
  lama dan bisa berhenti di tengah jalan sehingga sebagian data masuk dan
  sebagian tidak. Firestore membatasi satu kelompok maksimal 500 tulisan, jadi
  isinya dipotong di bawah angka itu.
*/
async function tulisBerkelompok(tugas){
  const BATAS = 400;
  for(let i = 0; i < tugas.length; i += BATAS){
    const batch = writeBatch(db);
    for(const t of tugas.slice(i, i + BATAS)){
      if(t.jenis === 'tambah') batch.set(doc(collection(db, t.koleksi)), t.muatan);
      else if(t.jenis === 'ubah') batch.update(doc(db, t.koleksi, t.id), t.muatan);
      else if(t.jenis === 'hapus') batch.delete(doc(db, t.koleksi, t.id));
    }
    await batch.commit();
  }
}

$('xlTerapkan').addEventListener('click', async () => {
  const el = $('pesanExcel');
  if(!usulanExcel){ pesan(el, 'Bandingkan berkasnya dulu.', 'salah'); return; }
  if(usulanDiubah){
    pesan(el, 'Masih ada baris yang sedang disunting. Simpan atau batalkan baris itu dulu.', 'salah');
    return;
  }

  const diterima = usulanExcel.filter(u => u.terima && !u.dibuang);
  if(diterima.length === 0){ pesan(el, 'Belum ada baris yang dicentang.', 'salah'); return; }

  const hitung = j => diterima.filter(u => u.jenis === j).length;
  const ringkas = `${hitung('tambah')} ditambahkan, ${hitung('ubah')} diubah, dan ${hitung('hapus')} dihapus`;
  if(!confirm(`Simpan perubahan dari berkas Excel ke data web?\n\n${ringkas}.`)) return;

  const tugas = [];
  for(const u of diterima){
    if(u.jenis === 'tambah'){
      tugas.push({ jenis:'tambah', koleksi:u.koleksi, muatan:{ ...u.muatan } });
    }else if(u.jenis === 'ubah'){
      tugas.push({ jenis:'ubah', koleksi:u.koleksi, id:u.docId, muatan:{ ...u.muatan } });
    }else{
      /*
        Kelas yang dihapus menyeret perubahan sementara yang menunjuknya.
        Jika dibiarkan, perubahan itu menjadi yatim: halaman publik tidak bisa
        lagi menemukan kelas aslinya, jadi barisnya hilang begitu saja tanpa
        pernah bisa dihapus dari tab Perubahan Sementara.
      */
      if(u.koleksi === 'jadwal'){
        for(const p of data.perubahan.filter(x => x.jadwalId === u.docId)){
          tugas.push({ jenis:'hapus', koleksi:'perubahan', id:p.id });
        }
      }
      tugas.push({ jenis:'hapus', koleksi:u.koleksi, id:u.docId });
    }
  }

  try{
    status(`Menyimpan ${tugas.length} perubahan…`, 'sibuk');
    await tulisBerkelompok(tugas);
    const ditolak = usulanExcel.length - diterima.length;

    /*
      Unggahan dicatat sebagai SATU baris, bukan satu baris per data.

      Satu berkas bisa berisi ratusan baris, dan mencatatnya satu per satu akan
      menenggelamkan catatan lain yang justru dicari orang. Hitungannya per
      jenis sudah cukup untuk menjawab "kapan jadwalnya diisi dari Excel, oleh
      siapa, dan sebanyak apa".
    */
    const hitungJenis = koleksi => diterima.filter(u => u.koleksi === koleksi).length;
    const rincianJenis = Object.keys(JENIS_LOG)
      .filter(k => hitungJenis(k) > 0)
      .map(k => `${hitungJenis(k)} ${JENIS_LOG[k].toLowerCase()}`)
      .join(', ');
    await catat('impor', 'excel',
      `${tugas.length} perubahan disimpan dari berkas Excel`
      + ` (${hitung('tambah')} ditambahkan, ${hitung('ubah')} diubah, ${hitung('hapus')} dihapus)`,
      [rincianJenis, ditolak ? `${ditolak} baris tidak disimpan sesuai pilihan pengurus` : '']
        .filter(Boolean).join(' · '));
    usulanExcel = null;
    usulanDiubah = null;
    $('xlTerapkan').hidden = true;
    $('pratinjauExcel').innerHTML = '';
    $('formExcel').reset();
    await muatSemua();
    await terbitkan();
    pesan(el,
      `Selesai. ${tugas.length} perubahan tersimpan dan jadwal publik sudah diterbitkan ulang.`
      + (ditolak ? ` ${ditolak} baris tidak ikut disimpan sesuai pilihan tadi.` : ''), 'benar');
  }catch(err){
    console.error(err);
    pesan(el, 'Gagal menyimpan: ' + esc(err.message)
      + '. Sebagian data mungkin sudah masuk, jadi bandingkan berkasnya sekali lagi sebelum mengulang.', 'salah');
    status('Gagal menerapkan berkas Excel.', 'salah');
  }
});

/* ============================================================
   12. Log aksi
   ============================================================ */

/*
  Catatan setiap penambahan, perubahan, dan penghapusan yang terjadi di halaman
  ini.

  KENAPA PERLU. Pengurus berganti tiap kepengurusan dan jumlahnya banyak. Jika
  ada jadwal yang tiba-tiba berbeda dari yang disepakati, satu-satunya cara
  menelusurinya dulu adalah bertanya satu per satu. Catatan ini menjawabnya
  sendiri: apa yang berubah, kapan, dan oleh siapa.

  TIDAK BISA DIHAPUS. Aturan Firestore hanya mengizinkan menambah. Mengubah dan
  menghapus ditutup untuk semua orang, termasuk pengurus yang menulisnya.
  Catatan yang bisa dirapikan sendiri oleh pelakunya bukan catatan.

  GAGALNYA TIDAK MENJATUHKAN AKSI UTAMA. Jika penulisan catatan gagal,
  jadwalnya tetap tersimpan dan pengurus diberi tahu bahwa catatannya yang
  bermasalah. Kebalikannya akan lebih buruk: pekerjaan hilang karena buku
  catatan.
*/

const JENIS_LOG = {
  matakuliah:  'Mata kuliah',
  jadwal:      'Jadwal permanen',
  perubahan:   'Perubahan sementara',
  pengajar:    'Pengajar',
  pengumuman:  'Pengumuman',
  classroom:   'Kode Google Classroom',
  koordinator: 'Koordinator',
  excel:       'Berkas Excel',
  akunpengajar:'Akun pengajar',
  akunoperasional: 'Akun operasional',
  // Ditulis dari halaman /pengajar, bukan dari halaman ini. Catatannya tetap
  // masuk ke daftar yang sama supaya seluruh perubahan bisa ditelusuri di satu
  // tempat, tanpa perlu ingat halaman mana yang digunakan saat itu.
  materi:      'Naskah materi',
};

const AKSI_LOG = {
  tambah: 'Tambah',
  ubah:   'Ubah',
  hapus:  'Hapus',
  massal: 'Massal',
  impor:  'Impor',
};

const LOG_SEKALI = 200;   // banyaknya catatan yang diambil per pemuatan

let logData = [];
let logTerakhirDoc = null;    // dokumen terakhir, untuk memuat yang lebih lama
let logSudahDimuat = false;
let logMasihAda = false;

/*
  Menulis satu catatan.

  Dipanggil SESUDAH aksinya berhasil tersimpan, tidak sebelumnya, supaya tidak
  pernah ada catatan untuk pekerjaan yang ternyata gagal.
*/
async function catat(aksi, jenis, ringkas, rincian){
  try{
    await addDoc(collection(db, 'log'), {
      // Waktu diambil dari server, bukan dari jam komputer pengurus. Jam
      // komputer bisa salah atau sengaja diubah, dan catatan yang waktunya
      // bisa diatur sendiri kehilangan gunanya.
      waktu: serverTimestamp(),
      // Jam komputer tetap disimpan terpisah sebagai cadangan tampilan selama
      // waktu server belum sempat terisi.
      waktuKlien: new Date().toISOString(),
      oleh: pemakai.nama || '',
      email: pemakai.email || '',
      aksi, jenis,
      ringkas: String(ringkas || ''),
      rincian: String(rincian || ''),
    });
    // Jika tab Log sedang dibuka, daftarnya ikut disegarkan supaya tidak
    // terlihat seolah aksinya tidak tercatat.
    if(logSudahDimuat && !$('panel-log').hidden) await muatLog(false);
  }catch(err){
    console.error('Gagal menulis catatan log', err);
    status('Perubahannya tersimpan, tetapi catatan log gagal ditulis: ' + err.message, 'salah');
  }
}

/* ---------- memuat ---------- */

async function muatLog(lanjut){
  const el = $('pesanLog');
  bersihkanPesan(el);
  try{
    $('logSegarkan').disabled = true;
    const acuan = [collection(db, 'log'), orderBy('waktu', 'desc')];
    const q = (lanjut && logTerakhirDoc)
      ? query(...acuan, startAfter(logTerakhirDoc), limit(LOG_SEKALI))
      : query(...acuan, limit(LOG_SEKALI));

    const snap = await getDocs(q);
    const baru = [];
    snap.forEach(d => baru.push({ id: d.id, ...d.data() }));

    logTerakhirDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : logTerakhirDoc;
    logMasihAda = snap.docs.length === LOG_SEKALI;
    logData = lanjut ? [...logData, ...baru] : baru;
    logSudahDimuat = true;

    isiPilihanPelaku();
    gambarLog();
  }catch(err){
    console.error('Gagal memuat log', err);
    pesan(el, err.code === 'permission-denied'
      ? 'Koleksi "log" belum diizinkan oleh aturan keamanan Firestore. Tempel ulang isi firestore.rules melalui Firebase Console, lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
      : 'Gagal memuat catatan: ' + esc(err.message), 'salah');
  }finally{
    $('logSegarkan').disabled = false;
  }
}

/* ---------- waktu ---------- */

/*
  Waktu ditampilkan dalam waktu Jakarta, bukan waktu perangkat pembaca.

  Pengurus bisa saja membuka halaman ini dari luar negeri, dan catatan yang
  jamnya berpindah-pindah mengikuti tempat pembacanya akan sulit dicocokkan
  dengan kejadian sebenarnya.
*/
const JAM_JAKARTA = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});
const TANGGAL_JAKARTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
});

function waktuDari(entri){
  if(entri.waktu && typeof entri.waktu.toDate === 'function') return entri.waktu.toDate();
  if(entri.waktuKlien){
    const d = new Date(entri.waktuKlien);
    if(!isNaN(d)) return d;
  }
  return null;
}

function waktuPanjang(d){
  if(!d) return 'waktu tidak tercatat';
  // Bentuk bawaannya "6 September 2026 pukul 14.05", dan kata "pukul" diganti
  // koma supaya kolomnya tetap pendek.
  return JAM_JAKARTA.format(d).replace(' pukul ', ', ').replace(/\./g, '.');
}

function tanggalJakarta(d){
  return d ? TANGGAL_JAKARTA.format(d) : '';
}

/* ---------- saringan, pencarian, urutan ---------- */

function isiPilihanPelaku(){
  const el = $('logPelaku');
  const terpilih = el.value;
  const orang = [...new Set(logData.map(l => l.email).filter(Boolean))].sort();
  el.innerHTML = '<option value="">Semua pengurus</option>' + orang.map(e => {
    const nama = (logData.find(l => l.email === e) || {}).oleh;
    return `<option value="${esc(e)}">${esc(nama ? `${nama} · ${e}` : e)}</option>`;
  }).join('');
  if(terpilih) el.value = terpilih;
}

function saringLog(){
  const cari = ($('logCari').value || '').trim().toLowerCase();
  const aksi = $('logAksi').value;
  const jenis = $('logJenis').value;
  const pelaku = $('logPelaku').value;
  const dari = $('logDari').value;
  const sampai = $('logSampai').value;

  const hasil = logData.filter(l => {
    if(aksi && l.aksi !== aksi) return false;
    if(jenis && l.jenis !== jenis) return false;
    if(pelaku && l.email !== pelaku) return false;

    if(dari || sampai){
      const tgl = tanggalJakarta(waktuDari(l));
      if(!tgl) return false;
      if(dari && tgl < dari) return false;
      if(sampai && tgl > sampai) return false;
    }

    if(cari){
      const isi = [l.ringkas, l.rincian, l.oleh, l.email,
        AKSI_LOG[l.aksi] || l.aksi, JENIS_LOG[l.jenis] || l.jenis].join(' ').toLowerCase();
      if(!isi.includes(cari)) return false;
    }
    return true;
  });

  const urut = $('logUrut').value;
  const waktuAngka = l => { const d = waktuDari(l); return d ? d.getTime() : 0; };
  hasil.sort((a, b) => {
    if(urut === 'lama') return waktuAngka(a) - waktuAngka(b);
    if(urut === 'jenis'){
      return String(JENIS_LOG[a.jenis] || a.jenis).localeCompare(String(JENIS_LOG[b.jenis] || b.jenis))
        || waktuAngka(b) - waktuAngka(a);
    }
    if(urut === 'pelaku'){
      return String(a.oleh || a.email).localeCompare(String(b.oleh || b.email))
        || waktuAngka(b) - waktuAngka(a);
    }
    if(urut === 'aksi'){
      return String(AKSI_LOG[a.aksi] || a.aksi).localeCompare(String(AKSI_LOG[b.aksi] || b.aksi))
        || waktuAngka(b) - waktuAngka(a);
    }
    return waktuAngka(b) - waktuAngka(a);
  });
  return hasil;
}

function gambarLog(){
  const t = $('tabelLog');
  const baris = saringLog();

  $('logJumlah').textContent = logData.length === 0
    ? ''
    : `Menampilkan ${baris.length} dari ${logData.length} catatan yang termuat`
      + (logMasihAda ? ', masih ada yang lebih lama.' : '.');
  $('logMuatLagi').hidden = !logMasihAda;

  if(baris.length === 0){
    t.innerHTML = `<tbody><tr><td class="op-kosong">${
      logData.length === 0
        ? 'Belum ada catatan. Setiap penambahan, perubahan, dan penghapusan mulai sekarang akan tercatat di sini.'
        : 'Tidak ada catatan yang cocok dengan saringan ini.'
    }</td></tr></tbody>`;
    return;
  }

  t.innerHTML = `
    <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Jenis</th><th>Keterangan</th></tr></thead>
    <tbody>${baris.map(l => {
      const d = waktuDari(l);
      return `<tr>
        <td class="log-waktu">${esc(waktuPanjang(d))}</td>
        <td>${esc(l.oleh || '')}${l.email ? `<br><span class="op-samar">${esc(l.email)}</span>` : ''}</td>
        <td><span class="log-aksi log-${esc(l.aksi)}">${esc(AKSI_LOG[l.aksi] || l.aksi)}</span></td>
        <td>${esc(JENIS_LOG[l.jenis] || l.jenis || '')}</td>
        <td>${esc(l.ringkas || '')}${l.rincian ? `<br><span class="op-samar">${esc(l.rincian)}</span>` : ''}</td>
      </tr>`;
    }).join('')}</tbody>`;
}

['logCari','logAksi','logJenis','logPelaku','logDari','logSampai','logUrut'].forEach(id => {
  $(id).addEventListener('input', gambarLog);
  $(id).addEventListener('change', gambarLog);
});

$('logBersihkan').addEventListener('click', () => {
  for(const id of ['logCari','logAksi','logJenis','logPelaku','logDari','logSampai']) $(id).value = '';
  $('logUrut').value = 'baru';
  gambarLog();
});

$('logSegarkan').addEventListener('click', () => muatLog(false));
$('logMuatLagi').addEventListener('click', () => muatLog(true));
