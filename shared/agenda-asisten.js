/*
  Panel asisten untuk ruang terkunci game Agenda Tersembunyi.

  Asisten di sini berarti akun pengajar yang sudah diterima, atau pengurus
  operasional. Yang benar-benar menegakkan wewenang itu adalah firestore.rules
  (fungsi asistenAgenda). Pemeriksaan di halaman ini hanya untuk menampilkan
  layar yang sesuai.

  KODE AKSES

  Disimpan di koleksi agendakunci yang hanya bisa dibaca asisten. Pemain tidak
  pernah membacanya. Saat bergabung, pemain mengirim kode yang diketiknya dan
  aturan Firestore mencocokkannya di server.

  SESI

  Aplikasi Firebase di sini sengaja memakai nama "pengajar", sama dengan
  halaman /pengajar, supaya pengajar yang sudah masuk di sana langsung dikenali
  dan keluar di satu halaman berarti keluar di keduanya.
*/

import { pesanAuth, esc, pesan, bersihkanPesan } from './pengajar-akun.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, setDoc, onSnapshot, writeBatch, serverTimestamp,
} = await import(`${SDK}/firebase-firestore.js`);

const app = initializeApp(window.KAFBE_FIREBASE_CONFIG, 'pengajar');
const auth = getAuth(app);
const db = getFirestore(app);

// Untuk pengujian lokal dengan Firebase Emulator. Tidak berlaku di situs asli.
if(['localhost', '127.0.0.1'].includes(location.hostname)
   && new URLSearchParams(location.search).has('emulator')){
  const { connectAuthEmulator } = await import(`${SDK}/firebase-auth.js`);
  const { connectFirestoreEmulator } = await import(`${SDK}/firebase-firestore.js`);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const $ = id => document.getElementById(id);
const RUANG = [
  { id: 'kunci-1', nama: 'Ruang Terkunci 1' },
  { id: 'kunci-2', nama: 'Ruang Terkunci 2' },
  { id: 'kunci-3', nama: 'Ruang Terkunci 3' },
];
const STATUS = {
  tertutup: 'Tertutup. Belum bisa dimasuki peserta.',
  lobi: 'Terbuka. Peserta sedang menunggu di lobi.',
  main: 'Permainan sedang berlangsung.',
  selesai: 'Permainan sudah selesai.',
};

const data = { ruang: {}, kunci: {} };
let lepas = [];
let email = '';

function tampilkanLayar(id){
  for(const l of ['layarMasuk', 'layarTolak', 'aplikasi']) $(l).hidden = l !== id;
}

$('formMasuk').addEventListener('submit', async (e) => {
  e.preventDefault();
  bersihkanPesan($('pesanMasuk'));
  const tombol = $('tombolMasuk');
  tombol.disabled = true;
  try{
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('sandi').value);
    $('sandi').value = '';
  }catch(err){
    pesan($('pesanMasuk'), esc(pesanAuth(err.code || '')), 'salah');
  }finally{
    tombol.disabled = false;
  }
});

document.querySelectorAll('[data-keluar]').forEach(b => b.addEventListener('click', () => signOut(auth)));

onAuthStateChanged(auth, async (user) => {
  lepas.forEach(f => f());
  lepas = [];
  if(!user){ tampilkanLayar('layarMasuk'); return; }

  let boleh = false;
  try{
    const [akun, admin] = await Promise.all([
      getDoc(doc(db, 'pengajarakun', user.uid)).catch(() => null),
      getDoc(doc(db, 'admins', user.uid)).catch(() => null),
    ]);
    const status = akun && akun.exists() ? (akun.data().status || 'diterima') : '';
    boleh = status === 'diterima' || !!(admin && admin.exists());
  }catch(err){ console.error(err); }

  if(!boleh){
    $('alasanTolak').textContent = 'Akun ini belum terdaftar sebagai pengajar yang diterima. Hubungi pengurus operasional jika menurut Anda ini keliru.';
    tampilkanLayar('layarTolak');
    return;
  }

  email = user.email || '';
  $('siapa').textContent = email;
  tampilkanLayar('aplikasi');
  dengarkan();
});

function dengarkan(){
  for(const r of RUANG){
    lepas.push(onSnapshot(doc(db, 'agendaruang', r.id), (s) => { data.ruang[r.id] = s.exists() ? s.data() : null; gambar(); },
      (err) => console.error(err)));
    lepas.push(onSnapshot(doc(db, 'agendakunci', r.id), (s) => { data.kunci[r.id] = s.exists() ? s.data().kode : ''; gambar(); },
      (err) => console.error(err)));
  }
  gambar();
}

function kodeBaru(){
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const isi = new Uint32Array(6);
  crypto.getRandomValues(isi);
  return Array.from(isi, x => huruf[x % huruf.length]).join('');
}

function idAcak(){
  const huruf = 'abcdefghijkmnpqrstuvwxyz23456789';
  const isi = new Uint32Array(12);
  crypto.getRandomValues(isi);
  return Array.from(isi, x => huruf[x % huruf.length]).join('');
}

function ruangTertutup(){
  return {
    jenis: 'terkunci', status: 'tertutup', sesi: '', host: '', hostNama: '',
    dibuka: null, aktif: null, jumlah: 0, permainan: null,
  };
}

function lobiBaru(){
  return {
    status: 'lobi', sesi: idAcak(), host: '', hostNama: '',
    dibuka: serverTimestamp(), aktif: serverTimestamp(), jumlah: 0, permainan: null,
  };
}

function gambar(){
  $('daftarRuang').innerHTML = RUANG.map(r => {
    const d = data.ruang[r.id];
    const kode = data.kunci[r.id];
    const status = d ? d.status : 'tertutup';
    const terbuka = status !== 'tertutup';
    return `<div class="as-ruang">
      <h3>${esc(r.nama)}</h3>
      <p class="as-status">${esc(STATUS[status] || status)}${d && terbuka ? ` ${d.jumlah} peserta. Host: ${esc(d.hostNama || 'belum ada')}.` : ''}</p>
      ${terbuka && kode ? `<div class="as-kode" aria-label="Kode akses">${esc(kode)}</div>` : ''}
      <div class="as-aksi">
        ${terbuka
          ? `<button class="btn btn-ghost op-kecil" data-salin="${r.id}">Salin kode</button>
             <button class="btn btn-ghost op-kecil" data-ganti="${r.id}">Ganti kode</button>
             <button class="btn btn-ghost op-kecil" data-ulang="${r.id}">Kosongkan lobi</button>
             <button class="btn btn-primary op-kecil" data-tutup="${r.id}">Tutup ruang</button>`
          : `<button class="btn btn-primary op-kecil" data-buka="${r.id}">Buka ruang</button>`}
      </div>
    </div>`;
  }).join('');
}

async function pastikanAda(id){
  const ref = doc(db, 'agendaruang', id);
  const s = await getDoc(ref);
  if(!s.exists()) await setDoc(ref, ruangTertutup());
}

async function buka(id){
  await pastikanAda(id);
  const b = writeBatch(db);
  b.set(doc(db, 'agendakunci', id), { kode: kodeBaru(), oleh: email, waktu: serverTimestamp() });
  b.update(doc(db, 'agendaruang', id), lobiBaru());
  await b.commit();
}

async function gantiKode(id){
  await setDoc(doc(db, 'agendakunci', id), { kode: kodeBaru(), oleh: email, waktu: serverTimestamp() });
}

async function kosongkan(id){
  await setDoc(doc(db, 'agendaruang', id), { jenis: 'terkunci', ...lobiBaru() });
}

async function tutup(id){
  const b = writeBatch(db);
  b.set(doc(db, 'agendaruang', id), ruangTertutup());
  b.delete(doc(db, 'agendakunci', id));
  await b.commit();
}

$('daftarRuang').addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if(!t) return;
  bersihkanPesan($('pesanPanel'));
  const { buka: idBuka, ganti, ulang, tutup: idTutup, salin } = t.dataset;
  try{
    t.disabled = true;
    if(idBuka) await buka(idBuka);
    else if(ganti){
      if(!confirm('Ganti kode akses? Peserta yang sudah di dalam tetap di ruang, tetapi kode lama tidak bisa dipakai lagi.')) return;
      await gantiKode(ganti);
    } else if(ulang){
      if(!confirm('Kosongkan lobi? Semua peserta di ruang ini akan dikeluarkan, tetapi kodenya tetap sama.')) return;
      await kosongkan(ulang);
    } else if(idTutup){
      if(!confirm('Tutup ruang ini? Semua peserta akan dikeluarkan dan kodenya tidak berlaku lagi.')) return;
      await tutup(idTutup);
    } else if(salin){
      await navigator.clipboard.writeText(data.kunci[salin] || '');
      pesan($('pesanPanel'), 'Kode sudah disalin.', 'benar');
    }
  }catch(err){
    console.error(err);
    pesan($('pesanPanel'), 'Perintah ditolak server. Pastikan akun Anda pengajar yang sudah diterima, lalu coba lagi.', 'salah');
  }finally{
    t.disabled = false;
  }
});
