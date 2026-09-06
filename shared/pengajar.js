/*
  Halaman pengajar KAFBE Hub.

  PENTING UNTUK YANG MERAWAT BERKAS INI:

  Berkas ini berjalan di peramban pengajar, jadi isinya bisa dibaca siapa pun.
  Jangan pernah menaruh kata sandi, kunci rahasia, atau pemeriksaan keamanan di
  sini. Menyembunyikan tombol atau menyaring daftar mata kuliah di halaman ini
  hanya untuk KENYAMANAN pemakai, bukan pengamanan.

  Yang benar-benar menjaga data adalah firestore.rules, karena aturan itu
  dijalankan di server Google dan tidak bisa dilewati melalui Console peramban.
  Di sana pula wewenang per mata kuliah ditegakkan, sehingga pengajar yang
  mencoba menulis topik di luar wewenangnya akan ditolak server meskipun
  halaman ini berhasil dibujuk menampilkan tombolnya.

  DARI MANA NASKAH BAWAAN DIBACA

  Bukan dari daftar yang ditulis ulang di sini, melainkan dari halaman materi
  itu sendiri. Halaman materinya dibuka di bingkai tersembunyi, lalu
  KafbeMateri.bawaan() di dalamnya menyerahkan naskah asli beserta labelnya.

  Cara ini dipilih supaya naskah yang tampil di panel pengajar tidak akan
  pernah berbeda dengan naskah yang sedang dibaca mahasiswa. Daftar salinan
  selalu berakhir tertinggal, dan pengajar akan menyunting kalimat yang di
  halaman aslinya sudah tidak ada.
*/

import { pesanAuth, esc, pesan, bersihkanPesan } from './pengajar-akun.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, serverTimestamp,
} = await import(`${SDK}/firebase-firestore.js`);

/*
  NAMA "pengajar" PADA APLIKASI FIREBASE INI PENTING, JANGAN DIHAPUS.

  Firebase menyimpan sesi yang sedang masuk di penyimpanan peramban, dan
  kuncinya disusun dari nama aplikasi ini. Selama /pengajar, /operasional, dan
  /adminkafbe sama-sama menggunakan nama bawaan, ketiganya berbagi satu sesi yang
  sama untuk seluruh situs.

  Akibatnya nyata dan sempat terjadi: pengurus yang membuka /operasional di tab
  lain akan menemukan dirinya masuk sebagai akun pengajar, lalu halaman itu
  mengeluarkannya karena bukan admin. Keluar itu berlaku untuk seluruh situs,
  sehingga tab pengajar yang sedang digunakan mengetik ikut terlempar ke layar
  masuk, dan naskah yang belum disimpan hilang bersamanya.

  Dengan nama tersendiri, tiap halaman punya sesinya sendiri. Satu orang bisa
  masuk sebagai pengurus di satu tab dan sebagai pengajar di tab lain tanpa
  keduanya saling menjatuhkan. Halaman pendaftaran menggunakan nama yang sama
  dengan halaman ini, dan itu memang disengaja, supaya akun yang baru dibuat
  langsung terbawa ke sini.
*/
const app  = initializeApp(window.KAFBE_FIREBASE_CONFIG, 'pengajar');
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   1. Alat bantu umum
   ============================================================ */

const $ = id => document.getElementById(id);

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
  console.log('[pengajar] ' + teks);
}

/* ============================================================
   2. Masuk dan keluar
   ============================================================ */

/* ---------- Masuk ---------- */

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

/* ---------- Keluar ---------- */

function keluar(){
  if(adaPerubahan() && !confirm('Ada perubahan yang belum disimpan. Tetap keluar?')) return;
  signOut(auth);
}

$('tombolKeluar').addEventListener('click', keluar);
document.querySelectorAll('[data-keluar]').forEach(b => b.addEventListener('click', keluar));

/* ---------- Menentukan layar yang tampil ---------- */

// Siapa yang sedang menggunakan halaman, diisi setelah masuk dan digunakan sebagai
// pelaku pada catatan log.
let pemakai = { nama: '', email: '', uid: '' };
let wewenang = { semua: false, mk: [] };

const LAYAR = ['layarMasuk', 'layarTunggu', 'layarTolak', 'aplikasi'];

function tampilkanLayar(id){
  for(const l of LAYAR) $(l).hidden = (l !== id);
}

/*
  Siapa yang sudah lolos pemeriksaan dan halamannya sedang terbuka.

  Firebase memancarkan peristiwa perubahan sesi lebih dari sekali, misalnya
  saat token diperbarui diam-diam tiap sekitar satu jam. Tanpa penanda ini,
  tiap pancaran itu menjalankan ulang seluruh pemeriksaan, menggambar ulang
  daftar topik, dan menghapus tanda topik yang sedang dibuka, padahal tidak ada
  apa pun yang berubah.
*/
let uidTerbuka = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){
    /*
      Sesi berakhir. Jika itu terjadi selagi halamannya terbuka, pemakainya
      berhak tahu sebabnya, bukan hanya mendapati dirinya kembali di layar
      masuk tanpa penjelasan apa pun.

      Naskah yang belum disimpan tidak ikut hilang, sebab dititipkan ke
      penyimpanan peramban pada tiap ketukan. Itu disebutkan di sini supaya
      yang bersangkutan tidak mengira pekerjaannya lenyap lalu mengetik ulang.
    */
    if(uidTerbuka){
      diag('Sesi berakhir. Kembali ke layar masuk.');
      pesan($('pesanMasuk'),
        'Sesi Anda berakhir, jadi halamannya kembali ke sini.<br><br>'
        + 'Naskah yang belum sempat disimpan <strong>tidak hilang</strong>. '
        + 'Masuk lagi, buka topik yang tadi, dan naskahnya akan dipasang kembali.',
        'hati');
    }

    uidTerbuka = null;
    tampilkanLayar('layarMasuk');
    return;
  }

  // Orang yang sama, halaman sudah terbuka. Tidak ada yang perlu dikerjakan.
  if(user.uid === uidTerbuka) return;

  await tentukanLayar(user);
});

async function tentukanLayar(user){
  diag('Sesi aktif sebagai ' + user.email);
  diag('Membaca dokumen pengajarakun/' + user.uid + ' …');

  /*
    Punya akun saja tidak cukup, dan punya baris pengajuan pun belum tentu
    cukup. Yang menentukan adalah statusnya, dan aturan Firestore memeriksa
    hal yang sama di sisi server.

    Koleksinya sengaja terpisah dari "admins" milik halaman operasional.
    Pengajar mengubah naskah materi dan tidak menyentuh jadwal, sedangkan
    pengurus operasional mengurus jadwal dan tidak menyentuh naskah materi.
  */
  let profil = null;
  try{
    const snap = await getDoc(doc(db, 'pengajarakun', user.uid));
    diag('Dokumen pengajarakun terbaca. Ada isinya? ' + (snap.exists() ? 'YA' : 'TIDAK'));
    if(snap.exists()) profil = snap.data();
  }catch(err){
    console.error('Gagal memeriksa status pengajar', err);
    diag('GAGAL membaca pengajarakun: ' + (err.code || err.message));

    /*
      SENGAJA TIDAK MENGELUARKAN PEMAKAI YANG HALAMANNYA SUDAH TERBUKA.

      Pemeriksaan ini pernah selalu berakhir dengan signOut, dan itu keliru.
      Kegagalan membaca satu dokumen bisa terjadi karena jaringan tersendat
      sesaat, dan jika kejadiannya saat pengajar sedang mengetik, naskah yang
      belum disimpan ikut hilang bersama halamannya. Kehilangan pekerjaan itu
      jauh lebih merugikan daripada risiko yang dicegahnya.

      Lagipula mengeluarkan pemakai tidak menambah keamanan sedikit pun.
      Wewenang ditegakkan aturan Firestore pada tiap penyimpanan, jadi akun
      yang wewenangnya sudah dicabut akan ditolak server saat menyimpan,
      terlepas dari apa yang sedang tampil di layarnya.

      Karena itu: sebelum halamannya terbuka, tetap gagal tertutup dan keluar.
      Sesudah terbuka, cukup diberi tahu dan pekerjaannya dibiarkan utuh.
    */
    if(uidTerbuka === user.uid){
      status('Status akun tidak bisa diperiksa ulang. Naskah yang sedang Anda '
        + 'kerjakan tetap aman, tetapi simpanlah lebih awal.', 'salah');
      return;
    }

    // Pesan dipasang LEBIH DULU, baru keluar. Jika urutannya dibalik dan
    // signOut gagal, pemakai hanya melihat halaman masuk kosong tanpa
    // penjelasan apa pun, dan itu justru yang paling membingungkan.
    tampilkanLayar('layarMasuk');
    pesan($('pesanMasuk'),
      'Masuk berhasil, tetapi status pengajuan tidak bisa diperiksa.<br>'
      + `Pesan aslinya: <code>${esc(err.message || err.code || 'tidak diketahui')}</code><br><br>`
      + 'Biasanya ini berarti aturan keamanan Firestore belum diperbarui. '
      + 'Lihat bagian akun pengajar di PANDUAN-PENGURUS.md.',
      'salah');
    try{ await signOut(auth); }
    catch(e2){ console.warn('Gagal keluar setelah kegagalan pemeriksaan', e2); }
    return;
  }

  /*
    Akunnya ada, pengajuannya belum. Diantar melengkapi, bukan dikeluarkan.

    Yang mengerjakannya halaman pendaftaran, menggunakan formulir yang sama persis,
    hanya tanpa kotak kata sandi karena akunnya sudah ada. Dulu keadaan ini
    punya layarnya sendiri di halaman ini, dan layar itu menanyakan ulang nama
    serta NRP saja, sehingga pendaftaran terasa terpecah menjadi dua formulir
    berbeda padahal maksudnya satu.
  */
  if(!profil){
    diag('Belum ada pengajuan. Mengantar ke halaman pendaftaran…');
    location.replace('pengajar-daftar.html');
    return;
  }

  /*
    Dokumen yang dibuat langsung melalui Firebase Console boleh tidak menyebut
    status, dan itu dianggap sudah diterima. Bawaan yang sama juga ditulis di
    firestore.rules, supaya halaman ini dan server tidak pernah berbeda
    pendapat soal siapa yang boleh menyimpan.
  */
  const statusAkun = profil.status || 'diterima';

  if(statusAkun === 'menunggu'){
    isiRingkasTunggu(profil);
    tampilkanLayar('layarTunggu');
    return;
  }

  if(statusAkun !== 'diterima'){
    $('alasanTolak').textContent = profil.alasan
      ? 'Alasan dari pengurus: ' + profil.alasan
      : 'Pengurus operasional belum menyetujui pengajuan ini.';
    tampilkanLayar('layarTolak');
    return;
  }

  diag('Pengajuan sudah diterima. Membuka halaman…');
  uidTerbuka = user.uid;
  pemakai = { nama: profil.nama || '', email: user.email || '', uid: user.uid };
  wewenang = {
    semua: profil.semua === true,
    mk: Array.isArray(profil.mk) ? profil.mk.map(String) : []
  };

  $('siapa').textContent = (profil.nama ? profil.nama + ' · ' : '') + user.email;
  tampilkanLayar('aplikasi');
  susunDaftar();
}

function isiRingkasTunggu(profil){
  const isi = [
    ['Nama lengkap', profil.nama || ''],
    ['NRP', profil.nrp || ''],
    ['Email', profil.email || '']
  ];
  const dl = $('ringkasTunggu');
  dl.textContent = '';
  for(const [label, nilai] of isi){
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = nilai;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
}

/* ============================================================
   3. Daftar mata kuliah dan topik
   ============================================================ */

const DAFTAR = Array.isArray(window.KAFBE_MATERI_DAFTAR) ? window.KAFBE_MATERI_DAFTAR : [];

function bolehMatkul(kode){
  return wewenang.semua || wewenang.mk.indexOf(kode) >= 0;
}

function susunDaftar(){
  const wadah = $('daftarTopik');
  wadah.textContent = '';

  const boleh = DAFTAR.filter(mk => bolehMatkul(mk.kode));

  if(!boleh.length){
    const p = document.createElement('p');
    p.className = 'pg-samping-catatan';
    p.textContent = 'Akun Anda belum diberi mata kuliah mana pun. Hubungi pengurus '
      + 'yang memegang akses Firebase Console supaya kolom mata kuliahnya diisi.';
    wadah.appendChild(p);
    $('catatanWewenang').textContent = '';
    return;
  }

  for(const mk of boleh){
    const kotak = document.createElement('div');
    kotak.className = 'pg-daftar-matkul';

    const judul = document.createElement('div');
    judul.className = 'pg-matkul-nama';
    judul.textContent = (mk.ikon ? mk.ikon + ' ' : '') + mk.nama;
    kotak.appendChild(judul);

    for(const t of mk.topik){
      const tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.className = 'pg-topik';
      tombol.dataset.kunci = t.kunci;
      tombol.textContent = t.nama;
      tombol.addEventListener('click', () => bukaTopik(mk, t));
      kotak.appendChild(tombol);
    }

    wadah.appendChild(kotak);
  }

  $('catatanWewenang').textContent = wewenang.semua
    ? 'Akun Anda boleh mengubah naskah seluruh mata kuliah.'
    : 'Akun Anda dibatasi pada mata kuliah di atas. Topik lain tetap bisa dibaca melalui situs, tetapi tidak bisa Anda ubah.';
}

function tandaiTopikAktif(kunci){
  document.querySelectorAll('.pg-topik').forEach(b => {
    b.classList.toggle('aktif', b.dataset.kunci === kunci);
  });
}

function tandaiJumlahUbah(kunci, jumlah){
  const tombol = document.querySelector(`.pg-topik[data-kunci="${CSS.escape(kunci)}"]`);
  if(!tombol) return;

  let tanda = tombol.querySelector('.pg-tanda');
  if(!jumlah){
    if(tanda) tanda.remove();
    return;
  }
  if(!tanda){
    tanda = document.createElement('span');
    tanda.className = 'pg-tanda';
    tombol.appendChild(tanda);
  }
  tanda.textContent = jumlah + ' naskah diubah';
}

/* ============================================================
   4. Membuka satu topik
   ============================================================ */

/*
  Tiga isi yang dipegang sekaligus untuk topik yang sedang dibuka:

    bawaan   naskah asli halaman, dibaca dari halaman materinya sendiri
    tersimpan naskah pengganti yang sudah ada di Firestore
    draf     naskah yang sedang diketik, belum tentu tersimpan

  Sebuah medan disebut berubah jika isi drafnya berbeda dari bawaannya. Yang
  disimpan ke Firestore hanya yang berubah, sehingga halaman materi yang
  naskahnya dikembalikan ke asal tidak meninggalkan sisa apa pun di basis data.
*/
let topikKini = null;
let bawaan    = null;
let tersimpan = { naskah:{}, langkah:{}, peta:{} };
let draf      = { naskah:{}, langkah:{}, peta:{} };

const GRUP = ['naskah', 'langkah', 'peta'];

function kosongkanIsi(){
  bawaan = null;
  tersimpan = { naskah:{}, langkah:{}, peta:{} };
  draf      = { naskah:{}, langkah:{}, peta:{} };
}

/*
  Ada perubahan yang belum disimpan.

  Dibandingkan dengan isi yang tersimpan, bukan dengan naskah bawaan halaman.
  Bedanya terasa saat pengajar mengembalikan naskah yang tadinya sudah diubah:
  hasilnya kembali sama dengan bawaan, tetapi Firestore masih memuat naskah
  penggantinya, jadi pembatalan itu tetap perlu disimpan.
*/
function adaPerubahan(){
  if(!bawaan) return false;
  return !samaDenganTersimpan();
}

// Berapa medan yang isinya berbeda dari naskah bawaan halaman. Dipakai untuk
// lencana jumlah, bukan untuk menentukan perlu tidaknya menyimpan.
function hitungPerubahan(){
  let n = 0;
  for(const g of GRUP){
    for(const k in bawaan[g]){
      if(draf[g][k] !== bawaan[g][k]) n++;
    }
  }
  return n;
}

// Dibandingkan kunci per kunci, bukan lewat JSON. Urutan kunci pada jawaban
// Firestore tidak dijamin sama dengan urutan yang disusun di sini, dan
// perbandingan teks akan menganggap dua isi yang sama sebagai berbeda.
function samaIsi(a, b){
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if(ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

function samaDenganTersimpan(){
  const kini = susunSimpanan();
  return GRUP.every(g => samaIsi(kini[g], tersimpan[g] || {}));
}

// Yang dikirim ke Firestore: hanya medan yang isinya berbeda dari bawaan.
function susunSimpanan(){
  const out = { naskah:{}, langkah:{}, peta:{} };
  for(const g of GRUP){
    for(const k in bawaan[g]){
      if(draf[g][k] !== bawaan[g][k]) out[g][k] = draf[g][k];
    }
  }
  return out;
}

/* ---------- Draf yang belum disimpan ---------- */

/*
  Naskah yang sedang diketik dititipkan ke penyimpanan peramban pada tiap
  ketukan, dan dihapus begitu benar-benar tersimpan ke Firestore.

  KENAPA PERLU

  Sesi bisa berakhir tanpa diminta. Token Firebase diperbarui diam-diam tiap
  sekitar satu jam, dan jika pembaruan itu gagal karena jaringan mati, sesinya
  berakhir dan halaman kembali ke layar masuk. Tanpa titipan ini, naskah yang
  sudah diketik setengah jam ikut lenyap begitu saja, dan pekerjaannya harus
  diulang dari nol.

  Titipannya per orang dan per topik, jadi dua pengajar yang menggunakan komputer
  yang sama tidak saling menimpa. Isinya naskah materi yang memang terbuka
  untuk umum, bukan kata sandi maupun tanda pengenal, jadi tidak ada yang
  perlu dirahasiakan di sini.
*/
function kunciDraf(kunci){
  return 'kafbe_draf_' + (pemakai.uid || 'tanpa') + '_' + kunci;
}

function simpanDraf(){
  if(!topikKini || !bawaan) return;
  try{
    if(samaDenganTersimpan()){
      localStorage.removeItem(kunciDraf(topikKini.kunci));
    }else{
      localStorage.setItem(kunciDraf(topikKini.kunci), JSON.stringify(susunSimpanan()));
    }
  }catch(e){
    // Peramban menolak menyimpan, misalnya karena mode penyamaran atau kuota
    // penuh. Penyuntingannya tetap jalan, hanya tanpa jaring pengaman.
  }
}

function bacaDraf(kunci){
  try{ return JSON.parse(localStorage.getItem(kunciDraf(kunci))) || null; }
  catch(e){ return null; }
}

function buangDraf(kunci){
  try{ localStorage.removeItem(kunciDraf(kunci)); }catch(e){}
}

async function bukaTopik(mk, topik){
  if(topikKini && topikKini.kunci !== topik.kunci && adaPerubahan()
     && !confirm('Ada perubahan yang belum disimpan pada topik sebelumnya. Tetap pindah?')){
    return;
  }

  topikKini = { kode: mk.kode, nama: topik.nama, kunci: topik.kunci, matkul: mk.nama };
  tandaiTopikAktif(topik.kunci);
  kosongkanIsi();

  $('layarKosong').hidden = true;
  $('penyunting').hidden = false;
  $('pgMatkul').textContent = mk.nama;
  $('pgJudul').textContent = topik.nama;
  $('pgTautan').href = 'materi/' + topik.kunci + '.html';
  $('pgIsi').textContent = '';
  bersihkanPesan($('pgPesan'));
  $('pgSimpan').disabled = true;

  status('Membuka halaman materinya…', 'sibuk');

  try{
    bawaan = await bacaBawaan(topik.kunci);
  }catch(err){
    console.error('Gagal membaca naskah bawaan', err);
    status('Naskah bawaan tidak bisa dibaca.', 'salah');
    pesan($('pgPesan'),
      'Halaman materinya tidak bisa dibuka untuk dibaca naskah aslinya.<br>'
      + `Pesan aslinya: <code>${esc(err.message || 'tidak diketahui')}</code><br><br>`
      + 'Coba muat ulang halaman ini. Jika tetap gagal, kemungkinan halaman '
      + 'materinya belum memuat <code>shared/materi.js</code>.',
      'salah');
    return;
  }

  status('Membaca naskah yang tersimpan…', 'sibuk');

  try{
    const snap = await getDoc(doc(db, 'materi', topik.kunci));
    const isi = snap.exists() ? snap.data() : {};
    tersimpan = {
      naskah:  isi.naskah  || {},
      langkah: isi.langkah || {},
      peta:    isi.peta    || {}
    };
  }catch(err){
    console.error('Gagal membaca naskah tersimpan', err);
    status('Naskah tersimpan tidak bisa dibaca.', 'salah');
    pesan($('pgPesan'),
      'Naskah bawaan berhasil dibaca, tetapi naskah pengganti di Firestore tidak.<br>'
      + `Pesan aslinya: <code>${esc(err.message || err.code || 'tidak diketahui')}</code>`,
      'salah');
    return;
  }

  // Draf dimulai dari naskah tersimpan, dan medan yang belum pernah diubah
  // dimulai dari naskah bawaan halaman.
  for(const g of GRUP){
    for(const k in bawaan[g]){
      const ada = tersimpan[g][k];
      draf[g][k] = (typeof ada === 'string' && ada.trim() !== '') ? ada : bawaan[g][k];
    }
  }

  /*
    Jika ada titipan naskah yang belum sempat disimpan, isinya dipasang di
    atas draf ini dan pemakainya diberi tahu. Titipan hanya digunakan jika
    memang berbeda dari yang sudah tersimpan, supaya sisa titipan lama tidak
    memunculkan pemberitahuan yang membingungkan.
  */
  const titipan = bacaDraf(topik.kunci);
  let adaTitipan = false;

  if(titipan){
    for(const g of GRUP){
      for(const k in (titipan[g] || {})){
        if(bawaan[g][k] === undefined) continue;   // naskahnya sudah tidak ada
        if(typeof titipan[g][k] !== 'string') continue;
        if(draf[g][k] === titipan[g][k]) continue;
        draf[g][k] = titipan[g][k];
        adaTitipan = true;
      }
    }
    if(!adaTitipan) buangDraf(topik.kunci);
  }

  gambarPenyunting();
  perbaruiRingkasan();

  if(adaTitipan){
    pesan($('pgPesan'),
      'Ada naskah yang Anda ketik sebelumnya tetapi belum sempat disimpan, dan '
      + 'naskah itu sudah dipasang kembali di bawah. Periksa dulu, lalu simpan '
      + 'jika memang benar. '
      + '<button type="button" class="pg-mini" id="pgBuangDraf">Buang, gunakan yang tersimpan</button>',
      'hati');

    $('pgBuangDraf').addEventListener('click', () => {
      buangDraf(topik.kunci);
      for(const g of GRUP){
        for(const k in bawaan[g]){
          const ada = tersimpan[g][k];
          draf[g][k] = (typeof ada === 'string' && ada.trim() !== '') ? ada : bawaan[g][k];
        }
      }
      gambarPenyunting();
      perbaruiRingkasan();
      bersihkanPesan($('pgPesan'));
    });
    status('Naskah yang belum tersimpan dikembalikan.', 'benar');
    return;
  }

  status('Naskah siap diubah.', 'benar');
}

/*
  Membaca naskah bawaan lewat bingkai tersembunyi.

  Bingkainya digunakan ulang untuk tiap topik, dan alamatnya dikosongkan dulu
  supaya membuka topik yang sama dua kali tetap memicu peristiwa load.
*/
function bacaBawaan(kunci){
  return new Promise((terima, tolak) => {
    const bingkai = $('bingkaiMateri');
    let selesai = false;

    const jaga = setTimeout(() => {
      if(selesai) return;
      selesai = true;
      bingkai.onload = null;
      tolak(new Error('halaman materinya tidak selesai dimuat dalam 20 detik'));
    }, 20000);

    bingkai.onload = () => {
      if(selesai) return;
      selesai = true;
      clearTimeout(jaga);
      bingkai.onload = null;

      try{
        const km = bingkai.contentWindow && bingkai.contentWindow.KafbeMateri;
        if(!km || typeof km.bawaan !== 'function'){
          tolak(new Error('halaman materinya belum memuat shared/materi.js'));
          return;
        }
        terima(km.bawaan());
      }catch(err){
        tolak(err);
      }
    };

    bingkai.src = 'about:blank';
    setTimeout(() => { bingkai.src = 'materi/' + kunci + '.html'; }, 0);
  });
}

/*
  Pembersih markup untuk pratinjau.

  Yang digunakan adalah pembersih milik shared/materi.js di dalam bingkai, jadi
  hasil pratinjau di sini dan hasil di halaman materi selalu sama persis. Jika
  bingkainya sudah tidak terjangkau, naskahnya ditampilkan sebagai teks biasa,
  bukan sebagai markup yang belum diperiksa siapa pun.
*/
function bersihkanPratinjau(html){
  try{
    const km = $('bingkaiMateri').contentWindow.KafbeMateri;
    if(km && typeof km.bersihkan === 'function') return km.bersihkan(html);
  }catch(err){
    console.warn('Pembersih markup di bingkai tidak terjangkau.', err);
  }
  return esc(html);
}

/* ============================================================
   5. Menggambar penyunting
   ============================================================ */

const JUDUL_GRUP = {
  naskah: {
    judul: 'Naskah di halaman',
    ket: 'Judul dan paragraf yang tertulis langsung di halaman materi. Bagian ini yang paling sering perlu dirapikan.'
  },
  langkah: {
    judul: 'Naskah tiap langkah',
    ket: 'Kalimat yang muncul bergantian saat mahasiswa menekan tombol Lanjut. Nomornya mengikuti urutan langkah di halaman.'
  }
};

// Kunci langkah berbentuk "12.teks". Diurutkan sebagai angka supaya langkah 2
// tidak jatuh sesudah langkah 11.
function urutkanLangkah(kunci){
  return kunci.slice().sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if(na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

function gambarPenyunting(){
  const wadah = $('pgIsi');
  wadah.textContent = '';

  for(const g of ['naskah', 'langkah']){
    const kunci = Object.keys(bawaan[g]);
    if(!kunci.length) continue;
    wadah.appendChild(kelompok(
      JUDUL_GRUP[g].judul, JUDUL_GRUP[g].ket,
      g === 'langkah' ? urutkanLangkah(kunci) : kunci, g));
  }

  /*
    Peta naskah dipecah per awalan, misalnya "bab" dan "narasi", supaya nama
    bagian tidak bercampur dengan narasi proses dalam satu daftar panjang.
  */
  const petaKunci = Object.keys(bawaan.peta);
  const awalan = [];
  for(const k of petaKunci){
    const a = k.split('.')[0];
    if(awalan.indexOf(a) < 0) awalan.push(a);
  }
  for(const a of awalan){
    const milik = petaKunci.filter(k => k.split('.')[0] === a);
    const contoh = bawaan.label.peta[milik[0]] || a;
    wadah.appendChild(kelompok(
      contoh.split('·')[0].trim() || a,
      'Kalimat pendek yang digunakan berulang di halaman ini.',
      milik, 'peta'));
  }

  if(!wadah.children.length){
    const p = document.createElement('p');
    p.className = 'pg-kelompok';
    p.textContent = 'Halaman ini belum punya naskah yang ditandai untuk diubah. '
      + 'Hubungi pengurus yang merawat kode situs supaya bagiannya ditandai lebih dulu.';
    wadah.appendChild(p);
  }
}

function kelompok(judul, keterangan, kunci, grup){
  const sec = document.createElement('section');
  sec.className = 'pg-kelompok';

  const h = document.createElement('h3');
  h.textContent = judul;
  sec.appendChild(h);

  const p = document.createElement('p');
  p.className = 'pg-kelompok-ket';
  p.textContent = keterangan;
  sec.appendChild(p);

  for(const k of kunci) sec.appendChild(medan(grup, k));
  return sec;
}

function medan(grup, kunci){
  const kotak = document.createElement('div');
  kotak.className = 'pg-medan';
  kotak.dataset.grup = grup;
  kotak.dataset.kunci = kunci;

  const kepala = document.createElement('div');
  kepala.className = 'pg-medan-kepala';

  const label = document.createElement('span');
  label.className = 'pg-medan-label';
  label.textContent = bawaan.label[grup][kunci] || kunci;
  kepala.appendChild(label);

  const lencana = document.createElement('span');
  lencana.className = 'pg-lencana';
  lencana.textContent = 'Diubah';
  lencana.hidden = true;
  kepala.appendChild(lencana);

  kotak.appendChild(kepala);

  const ta = document.createElement('textarea');
  ta.value = draf[grup][kunci];
  ta.spellcheck = true;
  ta.setAttribute('aria-label', bawaan.label[grup][kunci] || kunci);
  kotak.appendChild(ta);

  const kaki = document.createElement('div');
  kaki.className = 'pg-medan-kaki';

  const hitung = document.createElement('span');
  hitung.className = 'pg-hitung';
  kaki.appendChild(hitung);

  const kembali = document.createElement('button');
  kembali.type = 'button';
  kembali.className = 'pg-mini';
  kembali.textContent = 'Kembalikan ke naskah asli';
  kaki.appendChild(kembali);

  kotak.appendChild(kaki);

  const labelPra = document.createElement('span');
  labelPra.className = 'pg-pratinjau-label';
  labelPra.textContent = 'Pratinjau';
  kotak.appendChild(labelPra);

  const pratinjau = document.createElement('div');
  pratinjau.className = 'pg-pratinjau';
  kotak.appendChild(pratinjau);

  function segarkan(){
    const berubah = ta.value !== bawaan[grup][kunci];
    kotak.classList.toggle('pg-berubah', berubah);
    lencana.hidden = !berubah;
    kembali.disabled = !berubah;
    hitung.textContent = ta.value.length + ' karakter';
    pratinjau.innerHTML = bersihkanPratinjau(ta.value);
  }

  ta.addEventListener('input', () => {
    draf[grup][kunci] = ta.value;
    segarkan();
    perbaruiRingkasan();
  });

  kembali.addEventListener('click', () => {
    ta.value = bawaan[grup][kunci];
    draf[grup][kunci] = ta.value;
    segarkan();
    perbaruiRingkasan();
    ta.focus();
  });

  segarkan();
  return kotak;
}

/* ---------- Penyaring dan ringkasan ---------- */

function perbaruiRingkasan(){
  const jumlah = hitungPerubahan();
  $('pgSimpan').disabled = !adaPerubahan();
  $('pgSimpan').textContent = jumlah
    ? `Simpan ${jumlah} perubahan`
    : 'Simpan perubahan';
  if(topikKini) tandaiJumlahUbah(topikKini.kunci, jumlah);
  simpanDraf();
  saring();
}

function saring(){
  const cari = $('pgCari').value.trim().toLowerCase();
  const hanyaUbah = $('pgHanyaUbah').checked;

  document.querySelectorAll('.pg-medan').forEach(kotak => {
    /*
      Isi kotak dibaca dari nilai textarea-nya, bukan dari textContent kotak.
      textContent sebuah textarea berisi naskah pembukanya di HTML, bukan
      naskah yang sedang diketik, sehingga kalimat yang baru saja ditulis
      pengajar tidak akan pernah ditemukan pencarian.
    */
    const isian = kotak.querySelector('textarea');
    const teks = (
      (kotak.querySelector('.pg-medan-label').textContent || '') + ' ' +
      (isian ? isian.value : '')
    ).toLowerCase();
    const cocokCari = !cari || teks.indexOf(cari) >= 0;
    const cocokUbah = !hanyaUbah || kotak.classList.contains('pg-berubah');
    kotak.hidden = !(cocokCari && cocokUbah);
  });

  // Kelompok yang seluruh isinya tersembunyi ikut disembunyikan, supaya tidak
  // menyisakan judul bagian yang menggantung tanpa satu pun kotak di bawahnya.
  document.querySelectorAll('.pg-kelompok').forEach(sec => {
    const isi = sec.querySelectorAll('.pg-medan');
    if(!isi.length) return;
    sec.hidden = ![...isi].some(k => !k.hidden);
  });
}

$('pgCari').addEventListener('input', saring);
$('pgHanyaUbah').addEventListener('change', saring);

/* ============================================================
   6. Menyimpan
   ============================================================ */

$('pgSimpan').addEventListener('click', async () => {
  if(!topikKini || !bawaan) return;

  const tombol = $('pgSimpan');
  const isi = susunSimpanan();
  const jumlah = hitungPerubahan();

  tombol.disabled = true;
  bersihkanPesan($('pgPesan'));
  status('Menyimpan naskah…', 'sibuk');

  try{
    /*
      Ditulis utuh, bukan digabung dengan isi lama.

      Naskah yang dikembalikan ke bawaan memang harus hilang dari dokumen, dan
      penggabungan biasa tidak pernah menghapus apa pun. Jika dokumennya
      digabung, naskah yang sudah dibatalkan pengajar akan tetap tayang.
    */
    await setDoc(doc(db, 'materi', topikKini.kunci), {
      kode: topikKini.kode,
      naskah: isi.naskah,
      langkah: isi.langkah,
      peta: isi.peta,
      diperbaruiPada: serverTimestamp(),
      diperbaruiOleh: pemakai.email
    });

    tersimpan = isi;
    // Titipannya dibuang di sini, bukan lewat perbaruiRingkasan, supaya
    // penghapusannya benar-benar terjadi sesudah Firestore menerima naskahnya.
    buangDraf(topikKini.kunci);
    await catatLog(jumlah);

    status('Naskah tersimpan. Halaman materinya sudah menggunakan naskah baru.', 'benar');
    bersihkanPesan($('pgPesan'));
    perbaruiRingkasan();
  }catch(err){
    console.error('Gagal menyimpan naskah materi', err);
    status('Gagal menyimpan.', 'salah');
    pesan($('pgPesan'),
      err.code === 'permission-denied'
        ? 'Server menolak penyimpanan ini. Biasanya berarti akun Anda belum '
          + 'diberi wewenang atas mata kuliah ini, atau aturan Firestore belum '
          + 'diperbarui. Hubungi pengurus yang memegang akses Firebase Console.'
        : `Naskahnya tidak tersimpan.<br>Pesan aslinya: <code>${esc(err.message || err.code || 'tidak diketahui')}</code>`,
      'salah');
    tombol.disabled = false;
  }
});

/*
  Catatan aksi. Dipisah dari penyimpanan naskah dan kegagalannya sengaja tidak
  membatalkan apa pun: naskahnya sudah benar-benar tersimpan, dan memberi tahu
  pemakai bahwa penyimpanan gagal hanya karena catatannya gagal akan membuat
  dia menyimpan ulang tanpa perlu.
*/
async function catatLog(jumlah){
  try{
    await addDoc(collection(db, 'log'), {
      waktu: serverTimestamp(),
      waktuKlien: new Date().toISOString(),
      oleh: pemakai.nama || pemakai.email,
      email: pemakai.email,
      // "aksi" adalah kata kerjanya dan "jenis" adalah macam datanya, mengikuti
      // bentuk yang sudah digunakan catatan dari halaman operasional.
      aksi: 'ubah',
      jenis: 'materi',
      ringkas: `${topikKini.matkul}: ${topikKini.nama}`.slice(0, 500),
      rincian: `${jumlah} naskah berbeda dari bawaan halaman.`.slice(0, 500)
    });
  }catch(err){
    console.warn('Naskah tersimpan, tetapi catatan log gagal ditulis.', err);
  }
}

/*
  Penjaga terakhir sebelum halaman ditutup.

  Naskah yang sedang diketik hanya ada di memori peramban, jadi menutup tab
  tanpa menyimpan akan menghilangkannya tanpa jejak.
*/
window.addEventListener('beforeunload', (e) => {
  if(!adaPerubahan()) return;
  e.preventDefault();
  e.returnValue = '';
});
