/*
  Halaman pendaftaran akun pengajar.

  PENTING UNTUK YANG MERAWAT BERKAS INI:

  Berkas ini berjalan di peramban pendaftar, jadi isinya bisa dibaca siapa pun.
  Seluruh pemeriksaan di sini hanya untuk KENYAMANAN pemakai, yaitu supaya dia
  tahu letak kesalahannya sebelum akun Firebase-nya terlanjur dibuat.

  Yang benar-benar menolak adalah firestore.rules. Di sanalah ditegakkan bahwa
  pengajuan harus atas nama akun sendiri, berstatus menunggu, memakai email
  student UBAYA, dan tanpa satu pun kolom wewenang. Melewati halaman ini lewat
  Console peramban tidak menghasilkan apa pun selain penolakan server.
*/

import {
  POLA_EMAIL, POLA_NRP, angkaEmail, emailSeharusnya, periksaPengajuan,
  pesanAuth, esc, daftarKesalahan, pesan, bersihkanPesan, antarKeIsian,
  enterPindahIsian,
} from './pengajar-akun.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} = await import(`${SDK}/firebase-firestore.js`);

const app  = initializeApp(window.KAFBE_FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = id => document.getElementById(id);

/*
  Catatan langkah saat mendaftar.

  Pendaftaran berjalan dalam dua langkah asinkron, dan kalau salah satunya
  gagal diam-diam pemakai cuma melihat halaman yang tidak bereaksi. Setiap
  langkah dicatat ke panel yang bisa dibuka di bawah formulir, sehingga tidak
  perlu membuka developer tools untuk tahu langkah mana yang berhenti.
*/
function diag(teks){
  const el = $('diagnosa');
  if(!el) return;
  $('diagnosaBungkus').hidden = false;
  const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
  el.textContent += `[${jam}] ${teks}\n`;
  console.log('[pengajar-daftar] ' + teks);
}

/*
  DUA KEADAAN, SATU FORMULIR.

  Keadaan biasa adalah pendaftaran dari nol: belum ada akun, dan keempat isian
  diisi sekaligus.

  Keadaan kedua muncul kalau akun Firebase-nya sudah jadi tapi baris
  pengajuannya belum tersimpan, misalnya karena jaringan putus tepat di antara
  kedua langkah itu. Yang dipakai tetap formulir yang sama, hanya kotak kata
  sandinya dilepas karena akunnya sudah ada, dan emailnya dikunci pada email
  akun itu.

  Sebelumnya keadaan kedua punya layarnya sendiri di halaman pengajar, dan
  layar itu menanyakan ulang nama serta NRP saja. Akibatnya pendaftaran terasa
  terpecah menjadi dua formulir berbeda, padahal maksudnya satu hal yang sama.
*/
let akunAda = null;   // diisi kalau sedang melengkapi pengajuan

function pasangModeLanjutan(user){
  akunAda = user;

  $('bagianSandi').hidden = true;
  $('sandiTersimpan').hidden = false;
  $('catatanKembali').hidden = true;
  $('catatanLanjutan').hidden = false;

  const email = $('dfEmail');
  email.value = user.email || '';
  email.readOnly = true;

  $('dfNama').focus();
}

onAuthStateChanged(auth, async (user) => {
  if(!user) return;

  /*
    Yang pengajuannya sudah ada tidak perlu berada di halaman ini. Halaman
    pengajar sudah tahu sendiri harus menampilkan apa untuk tiap status, jadi
    urusannya diserahkan ke sana.

    Kalau status pengajuannya gagal diperiksa, halaman pengajar juga yang
    menjelaskannya, sebab di sanalah pesan galat untuk keadaan itu ditulis.
  */
  try{
    const snap = await getDoc(doc(db, 'pengajarakun', user.uid));
    if(snap.exists()){ location.replace('pengajar.html'); return; }
  }catch(err){
    diag('Gagal memeriksa pengajuan: ' + (err.code || err.message));
    location.replace('pengajar.html');
    return;
  }

  diag('Akun sudah ada tapi pengajuannya belum. Melanjutkan pengisian.');
  pasangModeLanjutan(user);
});

$('keluarLanjutan').addEventListener('click', () => signOut(auth).then(() => {
  location.replace('pengajar.html');
}));

enterPindahIsian($('formDaftar'), 'dfSandi2');

function isianBermasalah(nama, nrp, email){
  if(nama.length < 3 || nama.length > 80) return $('dfNama');
  if(!POLA_NRP.test(nrp)) return $('dfNrp');
  if(!POLA_EMAIL.test(email)) return $('dfEmail');
  return null;
}

$('formDaftar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tombol = $('tombolDaftar');
  const el = $('pesanDaftar');
  bersihkanPesan(el);

  const nama  = $('dfNama').value.trim();
  const nrp   = $('dfNrp').value.trim();
  const email = $('dfEmail').value.trim().toLowerCase();
  const sandi = $('dfSandi').value;

  const salah = periksaPengajuan(nama, nrp, email);

  // Kata sandi hanya diperiksa saat akunnya memang belum ada.
  if(!akunAda){
    if(sandi.length < 8) salah.push('Kata sandi minimal delapan karakter.');
    if(sandi !== $('dfSandi2').value) salah.push('Kedua kata sandi belum sama.');
  }

  if(salah.length){
    pesan(el, daftarKesalahan('Belum bisa dikirim:', salah), 'salah');
    antarKeIsian(isianBermasalah(nama, nrp, email)
      || (akunAda ? $('dfNama') : (sandi.length < 8 ? $('dfSandi') : $('dfSandi2'))));
    return;
  }

  /*
    Email student UBAYA dibentuk dari NRP-nya, jadi email yang seharusnya bisa
    dihitung sendiri dan disebutkan apa adanya. Memberi tahu "keduanya berbeda"
    saja akan membuat pendaftar menebak-nebak yang mana yang salah.

    Pengajuannya tetap boleh dikirim setelah ditekan sekali lagi. Yang berhak
    memutuskan adalah pengurus, bukan halaman ini, dan pengurus melihat
    peringatan yang sama di tab Akun Pengajar. Menutup jalannya sama sekali
    akan menghalangi orang yang emailnya memang menyimpang dari kebiasaan.
  */
  if(angkaEmail(email) !== nrp && el.dataset.konfirmasi !== '1'){
    pesan(el,
      'Email tidak sesuai NRP. Email student UBAYA memakai NRP Anda, jadi '
      + `menurut NRP <strong>${esc(nrp)}</strong> emailnya adalah `
      + `<code>${esc(emailSeharusnya(nrp))}</code>.<br><br>`
      + 'Perbaiki salah satunya, atau tekan Kirim pengajuan sekali lagi kalau '
      + 'email Anda memang berbeda dari itu.',
      'hati');
    el.dataset.konfirmasi = '1';
    antarKeIsian($('dfEmail'));
    return;
  }
  el.dataset.konfirmasi = '';

  tombol.disabled = true;
  tombol.textContent = 'Mengirim…';

  /*
    Dua langkah yang harus dikerjakan berurutan: membuat akun Firebase, lalu
    menulis baris pengajuannya.

    Baris pengajuan hanya boleh ditulis oleh pemilik akunnya sendiri menurut
    aturan Firestore, jadi urutannya memang tidak bisa dibalik. Kalau langkah
    kedua gagal, akunnya sudah terlanjur jadi. Halaman ini lalu berpindah
    sendiri ke keadaan melengkapi, dengan isian yang sudah diketik tetap di
    tempatnya, sehingga percobaan berikutnya tinggal menekan tombolnya lagi.
  */
  try{
    let user = akunAda;

    if(!user){
      diag('Membuat akun Firebase untuk ' + email + ' …');
      const hasil = await createUserWithEmailAndPassword(auth, email, sandi);
      user = hasil.user;
      diag('Akun dibuat. UID: ' + user.uid);

      $('dfSandi').value = '';
      $('dfSandi2').value = '';
      pasangModeLanjutan(user);
    }

    diag('Menulis pengajuan ke pengajarakun/' + user.uid + ' …');
    await setDoc(doc(db, 'pengajarakun', user.uid), {
      status: 'menunggu',
      nama: nama,
      nrp: nrp,
      email: user.email,
      dibuatPada: serverTimestamp()
    });
    diag('Pengajuan tersimpan, menunggu keputusan pengurus.');

    location.replace('pengajar.html');
  }catch(err){
    diag('GAGAL: ' + (err.code || err.message));

    pesan(el, err.code === 'permission-denied'
      ? 'Server menolak pengajuan ini. Biasanya berarti aturan keamanan '
        + 'Firestore belum diperbarui. Hubungi pengurus operasional.'
      : esc(pesanAuth(err.code || '')), 'salah');

    if(err.code === 'auth/email-already-in-use') antarKeIsian($('dfEmail'));
    tombol.disabled = false;
    tombol.textContent = 'Kirim pengajuan';
  }
});
