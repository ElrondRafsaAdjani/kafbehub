/*
  Halaman game Agenda Tersembunyi.

  GAMBARAN SINGKAT

  Ada enam ruang tetap di Firestore (koleksi agendaruang): tiga publik dan
  tiga terkunci. Pemain masuk dengan Anonymous Auth, jadi cukup mengisi nama.

  Peramban host adalah pengatur permainan. Ia memajukan fase saat waktu habis,
  menghitung voting, menjalankan mesin.js, lalu menulis hasilnya ke dokumen
  ruang. Peramban pemain lain hanya membaca dokumen itu dan menulis suara serta
  obrolannya sendiri. Aturan siapa boleh menulis apa ada di firestore.rules.

  WAKTU

  Batas fase disimpan dalam milidetik menurut jam server. Tiap peramban
  menghitung selisih jamnya dengan server sekali saat masuk ruang (lihat
  ukurSelisihJam), sehingga hitung mundur di semua layar tetap sama meskipun
  jam laptop peserta tidak tepat.

  HEMAT BACAAN FIRESTORE

  Satu ruang bisa berisi 90 orang, dan setiap perubahan dokumen dibaca ulang
  oleh semua yang mendengarkannya. Karena itu:
    - Pembagian kubu disimpan di dokumen ruang, bukan di 90 dokumen pemain.
    - Pemain hanya mendengarkan suara dan obrolan kubunya sendiri.
    - Detak host disimpan di dokumen terpisah dan hanya diperiksa tiap 30 detik.
    - Saat berada di dalam ruang, daftar enam ruang tidak lagi didengarkan.
*/

import { SKENARIO, URUTAN_SKENARIO, TUJUAN, TITIK, kalimatTujuan } from './skenario.js';
import * as M from './mesin.js';
import { lambang, ikonAksi, ikonKT, ikonPG, deretKT, nilaiPG } from './lambang.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, connectFirestoreEmulator, doc, collection, query, where,
  getDoc, getDocs, getDocFromServer, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, writeBatch, serverTimestamp, deleteField,
} = await import(`${SDK}/firebase-firestore.js`);

/*
  Nama aplikasi "agenda" sengaja dibedakan dari halaman pengajar dan
  operasional. Sesi anonim game ini tidak boleh menimpa sesi akun pengajar yang
  mungkin sedang terbuka di tab lain pada peramban yang sama.
*/
const app = initializeApp(window.KAFBE_FIREBASE_CONFIG, 'agenda');
const auth = getAuth(app);
const db = getFirestore(app);

// Untuk pengujian lokal dengan Firebase Emulator. Tidak berlaku di situs asli.
if(['localhost', '127.0.0.1'].includes(location.hostname)
   && new URLSearchParams(location.search).has('emulator')){
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const RUANG = [
  { id: 'publik-1', jenis: 'publik',   nama: 'Ruang Publik 1' },
  { id: 'publik-2', jenis: 'publik',   nama: 'Ruang Publik 2' },
  { id: 'publik-3', jenis: 'publik',   nama: 'Ruang Publik 3' },
  { id: 'kunci-1',  jenis: 'terkunci', nama: 'Ruang Terkunci 1' },
  { id: 'kunci-2',  jenis: 'terkunci', nama: 'Ruang Terkunci 2' },
  { id: 'kunci-3',  jenis: 'terkunci', nama: 'Ruang Terkunci 3' },
];
const NAMA_RUANG = Object.fromEntries(RUANG.map(r => [r.id, r.nama]));
const BATAS_LOBI = 10 * 60 * 1000;
const BATAS_SELESAI = 5 * 60 * 1000;
const DETAK_BASI = 45 * 1000;
const DETAK_MATI = 180 * 1000;

/*
  Waktu server yang belum dikonfirmasi (baru saja ditulis dengan
  serverTimestamp) dibaca sebagai perkiraan, bukan null. Tanpa ini, lobi yang
  baru dibuka sempat terbaca "dibuka pada waktu nol" dan langsung dianggap
  kedaluwarsa oleh host-nya sendiri.
*/
const PERKIRAAN = { serverTimestamps: 'estimate' };

const NAMA_FASE = {
  kartu: 'Kartu kubu', briefing: 'Briefing kasus', bicara: 'Giliran bicara',
  bebas: 'Sesi bebas', voting: 'Voting aksi', laporan: 'Laporan ronde', akhir: 'Kasus ditutup',
};

/* ============================================================
   1. Alat bantu
   ============================================================ */

const $ = id => document.getElementById(id);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function idAcak(n = 12){
  const huruf = 'abcdefghijkmnpqrstuvwxyz23456789';
  const isi = new Uint32Array(n);
  crypto.getRandomValues(isi);
  return Array.from(isi, x => huruf[x % huruf.length]).join('');
}

function ms(ts){ return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0; }

function sekarang(){ return Date.now() + G.selisih; }

function formatSisa(n){
  const d = Math.max(0, Math.ceil(n / 1000));
  return String(Math.floor(d / 60)).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0');
}

class PesanPemain extends Error {}

function pesan(teks, jenis){
  const el = $('pesan');
  if(!teks){ el.hidden = true; return; }
  el.hidden = false;
  el.className = 'ag-pesan' + (jenis === 'info' ? ' info' : '');
  el.textContent = teks;
}

function tampilkan(layar){
  for(const id of ['layarDaftar', 'layarLobi', 'layarMain']) $(id).hidden = id !== layar;
  $('memuat').hidden = true;
}

/* ============================================================
   2. Keadaan halaman
   ============================================================ */

const G = {
  uid: null,
  selisih: 0,
  daftarRuang: {},
  sudahDibuat: new Set(),
  lepasDaftar: null,

  ruangId: null,
  sesi: '',
  ruang: null,
  pemain: [],
  adaSaya: false,
  lepas: [],

  saluran: '',
  suaraKubu: [],
  lepasSuara: null,
  obrolan: [],
  lepasObrolan: null,

  host: false,
  suaraSemua: [],
  lepasSuaraSemua: null,
  timerHost: null,
  timerDetak: null,
  timerCek: null,
  sedangMaju: false,
  kunciMaju: '',
  jumlahTertulis: -1,

  kunciTampil: '',
  tab: 'kartu',
  intelDilihat: 0,
  obrolanDilihat: 0,
  terakhirKirim: 0,
  hostBasi: false,
  skenarioPilihan: 'acak',

  // Bot hanya disimpan di peramban host selama lobi, lalu ikut ditulis ke
  // dokumen ruang saat permainan dimulai. Jika host berpindah sebelum
  // permainan dimulai, daftar bot ini ikut hilang dan perlu ditambah lagi.
  bot: [],

  // Pengaturan permainan dari panel host, juga hanya di peramban host sampai
  // permainan dimulai.
  atur: { ...M.ATURAN_AWAL },
};

const NAMA_BOT = ['Ana', 'Bayu', 'Candra', 'Dewi', 'Eko', 'Fitri', 'Galih', 'Hana', 'Indra', 'Joko',
  'Kirana', 'Lukas', 'Maya', 'Nanda', 'Oki', 'Putri', 'Rangga', 'Sari', 'Tono', 'Wulan'];
const MAKS_BOT = NAMA_BOT.length;

const refRuang = () => doc(db, 'agendaruang', G.ruangId);
const refSaya = () => doc(db, 'agendaruang', G.ruangId, 'pemain', G.uid);
const refDetak = (id = G.ruangId) => doc(db, 'agendaruang', id, 'detak', 'host');

function ruangKosong(jenis){
  return {
    jenis, status: jenis === 'publik' ? 'kosong' : 'tertutup',
    sesi: '', host: '', hostNama: '', dibuka: null, aktif: null, jumlah: 0, permainan: null,
  };
}

function namaSaya(){
  return ($('inputNama').value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

function namaPemain(uid){
  const p = G.pemain.find(x => x.uid === uid);
  return p ? p.nama : 'Pemain';
}

/*
  Ruang yang sudah habis waktunya menurut aturan yang bisa dinilai tanpa
  membaca detak host. Aturan Firestore memakai syarat yang sama.
*/
function kedaluwarsa(r){
  if(!r) return false;
  const t = sekarang();
  if(r.status === 'lobi' && r.jenis === 'publik' && r.dibuka && t > ms(r.dibuka) + BATAS_LOBI) return true;
  if(r.status === 'selesai'){
    const selesai = (r.permainan && r.permainan.selesaiPada) || ms(r.aktif);
    if(selesai && t > selesai + BATAS_SELESAI) return true;
  }
  return false;
}

async function hostMati(id){
  try{
    const s = await getDoc(refDetak(id));
    return !s.exists() || sekarang() - ms(s.data().waktu) > DETAK_MATI;
  }catch{ return false; }
}

/* ============================================================
   3. Masuk
   ============================================================ */

try{
  const nama = localStorage.getItem('agenda.nama');
  if(nama) $('inputNama').value = nama;
}catch{}

onAuthStateChanged(auth, (user) => {
  if(user && !G.uid){
    G.uid = user.uid;
    mulaiHalaman();
  }
});

signInAnonymously(auth).catch((err) => {
  const kode = err && err.code;
  $('memuat').hidden = true;
  if(kode === 'auth/operation-not-allowed' || kode === 'auth/admin-restricted-operation'){
    pesan('Login tamu belum diaktifkan oleh pengelola situs. Hubungi pengurus KAFBE agar Anonymous Auth dinyalakan di Firebase.');
  } else {
    pesan('Gagal terhubung ke server permainan. Periksa koneksi internet, lalu muat ulang halaman.');
  }
});

async function mulaiHalaman(){
  let simpanan = null;
  try{ simpanan = localStorage.getItem('agenda.ruang'); }catch{}
  if(simpanan && NAMA_RUANG[simpanan]){
    try{
      const [r, p] = await Promise.all([
        getDoc(doc(db, 'agendaruang', simpanan)),
        getDoc(doc(db, 'agendaruang', simpanan, 'pemain', G.uid)),
      ]);
      const dr = r.data();
      if(dr && p.exists() && p.data().sesi === dr.sesi && ['lobi', 'main', 'selesai'].includes(dr.status)){
        await masukKeRuang(simpanan);
        return;
      }
    }catch(err){ console.warn('Tidak bisa melanjutkan ruang sebelumnya', err); }
    try{ localStorage.removeItem('agenda.ruang'); }catch{}
  }
  bukaDaftar();
}

/* ============================================================
   4. Daftar ruang
   ============================================================ */

let timerDaftar = null;

function bukaDaftar(){
  tampilkan('layarDaftar');
  if(!G.lepasDaftar){
    G.lepasDaftar = onSnapshot(collection(db, 'agendaruang'), (snap) => {
      snap.forEach(d => { G.daftarRuang[d.id] = d.data(PERKIRAAN); });
      for(const r of RUANG){
        if(!G.daftarRuang[r.id] && !G.sudahDibuat.has(r.id)){
          G.sudahDibuat.add(r.id);
          setDoc(doc(db, 'agendaruang', r.id), ruangKosong(r.jenis)).catch(() => {});
        }
      }
      gambarDaftar();
    }, (err) => {
      console.error(err);
      pesan('Daftar ruang tidak bisa dibaca. Muat ulang halaman sebentar lagi.');
    });
  }
  clearInterval(timerDaftar);
  timerDaftar = setInterval(gambarDaftar, 1000);
  gambarDaftar();
}

function tutupDaftar(){
  if(G.lepasDaftar){ G.lepasDaftar(); G.lepasDaftar = null; }
  clearInterval(timerDaftar);
}

function keadaanRuang(def, r){
  if(!r) return { teks: 'Menyiapkan ruang…', tombol: 'Tunggu', bisa: false };
  const penuh = (r.jumlah || 0) >= M.MAKS_PEMAIN;
  if(def.jenis === 'publik'){
    if(r.status === 'kosong' || kedaluwarsa(r)){
      return { teks: 'Kosong. Kamu akan menjadi host jika masuk pertama.', tombol: 'Buka dan masuk', bisa: true };
    }
    if(r.status === 'lobi'){
      const sisa = ms(r.dibuka) + BATAS_LOBI - sekarang();
      return {
        teks: `Menunggu pemain. ${r.jumlah} dari ${M.MAKS_PEMAIN} orang. Host: ${r.hostNama || 'belum ada'}. Bubar dalam ${formatSisa(sisa)}.`,
        tombol: penuh ? 'Penuh' : 'Masuk', bisa: !penuh,
      };
    }
    if(r.status === 'main'){
      return { teks: 'Permainan sedang berlangsung. Kamu bisa masuk sebagai Saksi.', tombol: penuh ? 'Penuh' : 'Masuk sebagai Saksi', bisa: !penuh };
    }
    return { teks: 'Permainan baru saja selesai. Ruang akan kosong kembali setelah host membubarkannya.', tombol: 'Tunggu', bisa: false };
  }

  if(r.status === 'tertutup') return { teks: 'Belum dibuka oleh asisten.', tombol: 'Terkunci', bisa: false };
  if(r.status === 'lobi'){
    return { teks: `Sudah dibuka asisten. ${r.jumlah} orang di dalam.`, tombol: penuh ? 'Penuh' : 'Masuk', bisa: !penuh, kode: true };
  }
  if(r.status === 'main'){
    return { teks: 'Permainan sedang berlangsung. Kamu bisa masuk sebagai Saksi.', tombol: penuh ? 'Penuh' : 'Masuk sebagai Saksi', bisa: !penuh, kode: true };
  }
  if(kedaluwarsa(r)) return { teks: 'Sudah dibuka asisten dan siap dipakai lagi.', tombol: 'Masuk', bisa: true, kode: true };
  return { teks: 'Permainan baru saja selesai.', tombol: 'Tunggu', bisa: false };
}

function gambarDaftar(){
  if($('layarDaftar').hidden) return;
  for(const jenis of ['publik', 'terkunci']){
    const wadah = $(jenis === 'publik' ? 'daftarPublik' : 'daftarTerkunci');
    for(const def of RUANG.filter(r => r.jenis === jenis)){
      const k = keadaanRuang(def, G.daftarRuang[def.id]);
      let kartu = wadah.querySelector(`[data-ruang="${def.id}"]`);
      if(!kartu){
        kartu = document.createElement('div');
        kartu.className = 'ag-ruang';
        kartu.dataset.ruang = def.id;
        kartu.innerHTML = `
          ${jenis === 'terkunci' ? '<span class="ag-gembok" aria-hidden="true">🔒</span>' : ''}
          <h3>${esc(def.nama)}</h3>
          <p data-bagian="teks"></p>
          ${jenis === 'terkunci' ? '<input data-bagian="kode" maxlength="6" placeholder="KODE AKSES" aria-label="Kode akses" autocomplete="off" />' : ''}
          <button type="button" class="ag-tombol ag-tombol-kecil" data-bagian="tombol"></button>`;
        kartu.querySelector('[data-bagian="tombol"]').addEventListener('click', () => masukRuang(def.id));
        wadah.appendChild(kartu);
      }
      kartu.classList.toggle('tertutup', !k.bisa);
      kartu.querySelector('[data-bagian="teks"]').textContent = k.teks;
      const tombol = kartu.querySelector('[data-bagian="tombol"]');
      tombol.textContent = k.tombol;
      tombol.disabled = !k.bisa || G.sibukMasuk;
      const kode = kartu.querySelector('[data-bagian="kode"]');
      if(kode) kode.hidden = !k.kode;
    }
  }
}

async function masukRuang(id){
  const nama = namaSaya();
  if(!nama){ pesan('Isi nama terlebih dahulu.'); $('inputNama').focus(); return; }
  try{ localStorage.setItem('agenda.nama', nama); }catch{}
  pesan('');
  G.sibukMasuk = true;
  gambarDaftar();

  const ref = doc(db, 'agendaruang', id);
  const refP = doc(db, 'agendaruang', id, 'pemain', G.uid);
  try{
    const snap = await getDoc(ref);
    let r = snap.data();
    if(!r) throw new PesanPemain('Ruang belum siap. Coba lagi sebentar.');
    const waktu = { masuk: serverTimestamp(), hadir: serverTimestamp() };

    if(r.jenis === 'publik'){
      let buka = r.status === 'kosong' || kedaluwarsa(r);
      if(!buka && ['lobi', 'main', 'selesai'].includes(r.status)) buka = await hostMati(id);

      if(buka){
        const sesi = idAcak(12);
        const b = writeBatch(db);
        b.update(ref, {
          status: 'lobi', sesi, host: G.uid, hostNama: nama,
          dibuka: serverTimestamp(), aktif: serverTimestamp(), jumlah: 0, permainan: null,
        });
        b.set(refP, { nama, sesi, ...waktu });
        b.set(refDetak(id), { waktu: serverTimestamp(), uid: G.uid });
        await b.commit();
      } else if(r.status === 'lobi' || r.status === 'main'){
        if(r.jumlah >= M.MAKS_PEMAIN) throw new PesanPemain('Ruang sudah penuh.');
        await setDoc(refP, { nama, sesi: r.sesi, ...waktu });
      } else {
        throw new PesanPemain('Permainan di ruang ini baru saja selesai. Pilih ruang lain atau tunggu sebentar.');
      }
    } else {
      const kartu = document.querySelector(`[data-ruang="${id}"] [data-bagian="kode"]`);
      const kode = (kartu ? kartu.value : '').trim().toUpperCase();
      if(r.status === 'tertutup') throw new PesanPemain('Ruang ini belum dibuka oleh asisten.');
      if(!/^[A-Z0-9]{6}$/.test(kode)) throw new PesanPemain('Kode akses terdiri dari 6 huruf atau angka.');

      if((r.status === 'main' || r.status === 'selesai') && (kedaluwarsa(r) || await hostMati(id))){
        await updateDoc(ref, {
          status: 'lobi', sesi: idAcak(12), host: '', hostNama: '',
          dibuka: serverTimestamp(), aktif: serverTimestamp(), jumlah: 0, permainan: null,
        });
        r = (await getDoc(ref)).data();
      }
      if(r.status === 'selesai') throw new PesanPemain('Permainan di ruang ini baru saja selesai. Tunggu host membuka lobi lagi.');
      if(r.jumlah >= M.MAKS_PEMAIN) throw new PesanPemain('Ruang sudah penuh.');

      try{
        await setDoc(refP, { nama, sesi: r.sesi, ...waktu, kode });
      }catch(err){
        if(err.code === 'permission-denied') throw new PesanPemain('Kode akses salah, atau ruang baru saja ditutup asisten.');
        throw err;
      }
      await updateDoc(refP, { kode: deleteField() }).catch(() => {});

      if(!r.host){
        const b = writeBatch(db);
        b.update(ref, { host: G.uid, hostNama: nama });
        b.set(refDetak(id), { waktu: serverTimestamp(), uid: G.uid });
        await b.commit().catch(() => {});
      }
    }

    await masukKeRuang(id);
  }catch(err){
    console.error(err);
    if(err instanceof PesanPemain) pesan(err.message);
    else if(err.code === 'permission-denied') pesan('Ruang baru saja berubah keadaan. Coba masuk lagi.');
    else pesan('Gagal masuk ke ruang. Periksa koneksi, lalu coba lagi.');
  }finally{
    G.sibukMasuk = false;
    gambarDaftar();
  }
}

/* ============================================================
   5. Di dalam ruang
   ============================================================ */

async function ukurSelisihJam(){
  const t0 = Date.now();
  await updateDoc(refSaya(), { hadir: serverTimestamp() });
  const s = await getDocFromServer(refSaya());
  const t1 = Date.now();
  G.selisih = ms(s.data().hadir) - (t0 + t1) / 2;
  return s.data();
}

async function masukKeRuang(id){
  tutupDaftar();
  G.ruangId = id;
  try{ localStorage.setItem('agenda.ruang', id); }catch{}

  const saya = await ukurSelisihJam();
  G.sesi = saya.sesi;
  G.adaSaya = true;
  G.kunciTampil = '';
  G.intelDilihat = 0;
  G.obrolanDilihat = 0;
  pesan('');

  G.lepas.push(onSnapshot(refRuang(), (s) => saatRuangBerubah(s.data(PERKIRAAN)), (err) => console.error(err)));
  G.lepas.push(onSnapshot(collection(db, 'agendaruang', id, 'pemain'), (snap) => {
    const daftar = [];
    snap.forEach(d => daftar.push({ uid: d.id, ...d.data(PERKIRAAN) }));
    saatPemainBerubah(daftar);
  }, (err) => console.error(err)));

  G.timerTik = setInterval(tik, 250);
  G.timerCek = setInterval(cekHost, 30000);
}

function bersihkanRuang(){
  G.lepas.forEach(f => f());
  G.lepas = [];
  for(const k of ['lepasSuara', 'lepasObrolan', 'lepasSuaraSemua']){
    if(G[k]){ G[k](); G[k] = null; }
  }
  clearInterval(G.timerTik);
  clearInterval(G.timerCek);
  berhentiJadiHost();
  G.ruangId = null; G.ruang = null; G.pemain = []; G.sesi = '';
  G.saluran = ''; G.suaraKubu = []; G.obrolan = [];
  try{ localStorage.removeItem('agenda.ruang'); }catch{}
}

function keluarPaksa(teks){
  bersihkanRuang();
  bukaDaftar();
  if(teks) pesan(teks, 'info');
}

function saatRuangBerubah(r){
  if(!G.ruangId) return;
  if(!r || r.sesi !== G.sesi || r.status === 'kosong' || r.status === 'tertutup'){
    keluarPaksa('Ruang sudah dibubarkan.');
    return;
  }
  if(kedaluwarsa(r) && (r.status === 'lobi' || r.status === 'selesai')){
    if(r.host === G.uid) bubarkan().catch(() => {});
    keluarPaksa(r.status === 'lobi'
      ? 'Ruang dibubarkan karena permainan tidak dimulai dalam 10 menit.'
      : 'Ruang dibubarkan otomatis 5 menit setelah permainan selesai.');
    return;
  }
  G.ruang = r;
  aturPeranHost();
  aturSaluran();
  gambar();
}

function saatPemainBerubah(daftar){
  daftar.sort((a, b) => ms(a.masuk) - ms(b.masuk));
  G.pemain = daftar.filter(p => p.sesi === G.sesi);
  const ada = G.pemain.some(p => p.uid === G.uid);
  if(G.adaSaya && !ada){
    keluarPaksa('Kamu sudah tidak terdaftar di ruang ini. Ruang mungkin penuh atau kamu dikeluarkan host.');
    return;
  }
  G.adaSaya = ada;
  if(G.host) urusPemainSebagaiHost();
  gambar();
}

/* ---------- Kubu dan saluran saya ---------- */

function permainan(){ return G.ruang && G.ruang.permainan; }
function skenario(){ const p = permainan(); return p ? SKENARIO[p.skenario] : null; }

function kubuSaya(){
  const p = permainan();
  return p ? (p.anggota[G.uid] || 'saksi') : '';
}

function kubuSayaHidup(){
  const p = permainan();
  const k = kubuSaya();
  return !!(p && k !== 'saksi' && p.kubu[k] && p.kubu[k].hidup);
}

function aturSaluran(){
  const r = G.ruang;
  let saluran = '';
  if(r && (r.status === 'main' || r.status === 'selesai')){
    saluran = G.sesi + '_' + (kubuSayaHidup() ? kubuSaya() : 'saksi');
  }
  if(saluran === G.saluran) return;
  G.saluran = saluran;
  if(G.lepasSuara){ G.lepasSuara(); G.lepasSuara = null; }
  if(G.lepasObrolan){ G.lepasObrolan(); G.lepasObrolan = null; }
  G.suaraKubu = []; G.obrolan = [];
  if(!saluran) return;

  G.lepasSuara = onSnapshot(query(collection(db, 'agendaruang', G.ruangId, 'suara'), where('saluran', '==', saluran)), (snap) => {
    G.suaraKubu = [];
    snap.forEach(d => G.suaraKubu.push({ uid: d.id, ...d.data() }));
    perbaruiHitungan();
  }, (err) => console.error(err));

  G.lepasObrolan = onSnapshot(query(collection(db, 'agendaruang', G.ruangId, 'obrolan'), where('saluran', '==', saluran)), (snap) => {
    G.obrolan = [];
    snap.forEach(d => G.obrolan.push(d.data(PERKIRAAN)));
    G.obrolan.sort((a, b) => ms(a.waktu) - ms(b.waktu));
    gambarObrolan();
  }, (err) => console.error(err));
}

/* ============================================================
   6. Peran host
   ============================================================ */

function aturPeranHost(){
  const saya = G.ruang && G.ruang.host === G.uid;
  if(saya && !G.host){
    G.host = true;
    kirimDetak();
    G.timerDetak = setInterval(kirimDetak, 15000);
    G.timerHost = setInterval(langkahHost, 400);
    G.lepasSuaraSemua = onSnapshot(query(collection(db, 'agendaruang', G.ruangId, 'suara'), where('sesi', '==', G.sesi)), (snap) => {
      G.suaraSemua = [];
      snap.forEach(d => G.suaraSemua.push({ uid: d.id, ...d.data() }));
    }, (err) => console.error(err));
    urusPemainSebagaiHost();
  } else if(!saya && G.host){
    berhentiJadiHost();
  }
}

function berhentiJadiHost(){
  G.host = false;
  clearInterval(G.timerDetak);
  clearInterval(G.timerHost);
  if(G.lepasSuaraSemua){ G.lepasSuaraSemua(); G.lepasSuaraSemua = null; }
  G.suaraSemua = [];
  G.jumlahTertulis = -1;
}

function kirimDetak(){
  if(!G.ruangId) return;
  setDoc(refDetak(), { waktu: serverTimestamp(), uid: G.uid }).catch(() => {});
}

let timerJumlah = null;
function urusPemainSebagaiHost(){
  const r = G.ruang;
  if(!r || !G.host) return;

  // Ruang penuh: pemain yang masuk paling akhir dikeluarkan.
  if(G.pemain.length > M.MAKS_PEMAIN){
    for(const p of G.pemain.slice(M.MAKS_PEMAIN)){
      deleteDoc(doc(db, 'agendaruang', G.ruangId, 'pemain', p.uid)).catch(() => {});
    }
  }

  // Jumlah pemain ditulis paling sering tiap 2 detik supaya tidak membebani.
  const n = Math.min(G.pemain.length, M.MAKS_PEMAIN);
  if((r.status === 'lobi' || r.status === 'main') && n !== r.jumlah && n !== G.jumlahTertulis && !timerJumlah){
    timerJumlah = setTimeout(() => {
      timerJumlah = null;
      const jumlah = Math.min(G.pemain.length, M.MAKS_PEMAIN);
      if(!G.host || !G.ruang || jumlah === G.ruang.jumlah) return;
      G.jumlahTertulis = jumlah;
      updateDoc(refRuang(), { jumlah, aktif: serverTimestamp() }).catch(() => {});
    }, 2000);
  }
}

async function tulisPermainan(p, status){
  const ubah = { permainan: p, aktif: serverTimestamp() };
  if(status) ubah.status = status;
  await updateDoc(refRuang(), ubah);
}

function langkahHost(){
  const r = G.ruang;
  if(!G.host || !r || r.status !== 'main' || G.sedangMaju) return;
  const p = r.permainan;
  if(p.jeda != null) return;
  const kunci = p.ronde + ':' + p.fase + ':' + p.berakhir;
  if(kunci === G.kunciMaju) return;

  let lewat = sekarang() >= p.berakhir;
  if(!lewat && p.fase === 'voting' && semuaSudahMemilih(p)) lewat = true;
  if(lewat) maju(kunci);
}

function anggotaHadir(p, idKubu){
  return G.pemain.filter(x => p.anggota[x.uid] === idKubu);
}

function semuaSudahMemilih(p){
  const sk = SKENARIO[p.skenario];
  let wajib = 0;
  for(const id of Object.keys(sk.kubu)){
    if(!p.kubu[id].hidup) continue;
    for(const orang of anggotaHadir(p, id)){
      wajib += 1;
      const s = G.suaraSemua.find(x => x.uid === orang.uid);
      if(!s || s.ronde !== p.ronde || s.saluran !== G.sesi + '_' + id) return false;
    }
  }
  return wajib > 0;
}

function mulaiBicara(p, sk){
  const id = p.urutan[(p.ronde - 1) % p.urutan.length];
  const bebas = Math.min(M.DURASI.bebas, p.atur.bicara);
  if(!p.kubu[id].hidup){
    return { ...p, fase: 'bebas', alasanBebas: 'tereliminasi', juru: null, berakhir: sekarang() + bebas * 1000 };
  }
  const calon = anggotaHadir(p, id);
  // Kubu yang hanya berisi bot tidak bisa berbicara, jadi gilirannya
  // menjadi sesi bebas.
  if(!calon.length && kubuBot(p, id)){
    return { ...p, fase: 'bebas', alasanBebas: 'bot', juru: null, berakhir: sekarang() + bebas * 1000 };
  }
  const pilih = calon.length ? calon[Math.floor(Math.random() * calon.length)] : null;
  return {
    ...p, fase: 'bicara', alasanBebas: '',
    juru: pilih ? { uid: pilih.uid, nama: pilih.nama } : null,
    berakhir: sekarang() + p.atur.bicara * 1000,
  };
}

// Jumlah bot di satu kubu. Bot hanya memilih jika tidak ada satu pun
// anggota manusia kubu itu yang masih berada di ruang, sehingga keputusan
// kubu campuran tetap di tangan manusianya.
function kubuBot(p, idKubu){
  return Object.keys(p.bot || {}).filter(id => p.anggota[id] === idKubu).length;
}

function hitungVoting(p, sk){
  const suara = G.suaraSemua.filter(s => s.ronde === p.ronde && s.sesi === G.sesi);
  const keputusan = {};
  for(const id of Object.keys(sk.kubu)){
    if(!p.kubu[id].hidup) continue;
    const jumlahBot = kubuBot(p, id);
    if(jumlahBot && !anggotaHadir(p, id).length){
      const pilihan = M.suaraBot(sk, p, id);
      keputusan[id] = M.rekapSuara(sk, id, Array.from({ length: jumlahBot }, () => pilihan));
      continue;
    }
    const milik = suara.filter(s => s.saluran === G.sesi + '_' + id && p.anggota[s.uid] === id);
    keputusan[id] = M.rekapSuara(sk, id, milik);
  }
  const saksi = suara.filter(s => {
    if(s.saluran !== G.sesi + '_saksi') return false;
    const k = p.anggota[s.uid];
    return !k || k === 'saksi' || !p.kubu[k].hidup;
  });
  return { keputusan, saksiKubu: M.rekapSaksi(sk, p, saksi) };
}

async function maju(kunci){
  const r = G.ruang;
  const p = r.permainan;
  const sk = SKENARIO[p.skenario];
  G.sedangMaju = true;
  G.kunciMaju = kunci;
  try{
    let baru;
    let status = null;
    switch(p.fase){
      case 'kartu':
        baru = { ...p, fase: 'briefing', berakhir: sekarang() + p.atur.briefing * 1000 };
        break;
      case 'briefing':
        baru = mulaiBicara({ ...p, ronde: 1 }, sk);
        break;
      case 'bicara':
      case 'bebas':
        baru = { ...p, fase: 'voting', berakhir: sekarang() + M.DURASI.voting * 1000 };
        break;
      case 'voting': {
        const { keputusan, saksiKubu } = hitungVoting(p, sk);
        const hasil = M.selesaikanRonde(p, sk, keputusan, p.ronde, saksiKubu);
        baru = { ...p, ...hasil, saksiKubu, fase: 'laporan', berakhir: sekarang() + M.DURASI.laporan * 1000 };
        break;
      }
      case 'laporan':
        if(p.ronde >= p.atur.ronde || M.jumlahHidup(p) <= 1){
          baru = { ...p, fase: 'akhir', akhir: M.nilaiAkhir(p, sk), berakhir: sekarang(), selesaiPada: sekarang() };
          status = 'selesai';
        } else {
          baru = mulaiBicara({ ...p, ronde: p.ronde + 1 }, sk);
        }
        break;
      default:
        return;
    }
    await tulisPermainan(baru, status);
  }catch(err){
    console.error('Gagal memajukan fase', err);
    G.kunciMaju = '';
  }finally{
    G.sedangMaju = false;
  }
}

async function mulaiPermainan(){
  const r = G.ruang;
  if(!G.host || r.status !== 'lobi') return;
  const pemain = G.pemain.slice(0, M.MAKS_PEMAIN);
  const bot = G.bot.slice(0, Math.max(0, M.MAKS_PEMAIN - pemain.length));
  if(pemain.length + bot.length < M.MIN_PEMAIN){ pesan(`Butuh minimal ${M.MIN_PEMAIN} pemain untuk memulai. Tambahkan bot jika peserta belum cukup.`); return; }

  const idSk = G.skenarioPilihan === 'acak'
    ? URUTAN_SKENARIO[Math.floor(Math.random() * URUTAN_SKENARIO.length)]
    : G.skenarioPilihan;
  const sk = SKENARIO[idSk];
  const idKubu = Object.keys(sk.kubu);
  const p = {
    skenario: idSk,
    fase: 'kartu',
    ronde: 0,
    berakhir: sekarang() + M.DURASI.kartu * 1000,
    jeda: null,
    atur: { ...G.atur },
    urutan: M.acak(idKubu),
    juru: null,
    anggota: M.bagiKubu(pemain.map(x => x.uid), idKubu, Math.random, bot.map(b => b.id)),
    bot: Object.fromEntries(bot.map(b => [b.id, b.nama])),
    alasanBebas: '',
    saksiKubu: '',
    akhir: null,
    selesaiPada: 0,
    ...M.keadaanAwal(sk, G.atur.ronde),
  };
  $('tombolMulai').disabled = true;
  try{
    await updateDoc(refRuang(), { status: 'main', permainan: p, aktif: serverTimestamp(), jumlah: pemain.length });
    bersihkanSisaSesiLama();
  }catch(err){
    console.error(err);
    pesan(r.jenis === 'publik' && sekarang() > ms(r.dibuka) + BATAS_LOBI
      ? 'Batas 10 menit sudah lewat, jadi permainan tidak bisa dimulai.'
      : 'Permainan gagal dimulai. Coba lagi.');
  }finally{
    $('tombolMulai').disabled = false;
  }
}

// Dokumen dari sesi sebelumnya tidak lagi dipakai. Dibersihkan host
// sekadarnya supaya koleksi tidak terus membesar.
async function bersihkanSisaSesiLama(){
  for(const nama of ['pemain', 'suara', 'obrolan']){
    try{
      const s = await getDocs(query(collection(db, 'agendaruang', G.ruangId, nama), where('sesi', '!=', G.sesi)));
      s.forEach(d => deleteDoc(d.ref).catch(() => {}));
    }catch{}
  }
}

async function bubarkan(){
  const r = G.ruang;
  if(!G.host || !r) return;
  const isi = r.jenis === 'publik'
    ? ruangKosong('publik')
    : { status: 'lobi', sesi: idAcak(12), host: '', hostNama: '', dibuka: serverTimestamp(), aktif: serverTimestamp(), jumlah: 0, permainan: null };
  await updateDoc(refRuang(), isi);
}

async function kembaliKeLobi(){
  if(!G.host) return;
  await updateDoc(refRuang(), { status: 'lobi', permainan: null, dibuka: serverTimestamp(), aktif: serverTimestamp() });
}

async function pindahkanHost(uid){
  const tujuan = G.pemain.find(p => p.uid === uid);
  if(!G.host || !tujuan) return;
  await updateDoc(refRuang(), { host: uid, hostNama: tujuan.nama, aktif: serverTimestamp() });
}

async function ubahWaktu(jenis){
  const p = permainan();
  if(!G.host || !p) return;
  const baru = { ...p };
  const t = sekarang();
  if(jenis === 'jeda'){
    if(p.jeda == null) baru.jeda = Math.max(0, p.berakhir - t);
    else { baru.berakhir = t + p.jeda; baru.jeda = null; }
  } else if(jenis === 'tambah'){
    if(p.jeda != null) baru.jeda = p.jeda + 30000;
    else baru.berakhir = p.berakhir + 30000;
  }
  await tulisPermainan(baru);
}

/* ---------- Pemain biasa: memeriksa host ---------- */

async function cekHost(){
  const r = G.ruang;
  if(!r || r.host === G.uid || !['lobi', 'main', 'selesai'].includes(r.status)) return;
  let basi = r.host === '';
  if(!basi){
    try{
      const s = await getDoc(refDetak());
      basi = !s.exists() || sekarang() - ms(s.data().waktu) > DETAK_BASI;
    }catch{ return; }
  }
  G.hostBasi = basi;
  gambarBanner();
  // Pemain yang paling awal masuk mengambil alih secara otomatis.
  const calon = G.pemain.filter(p => p.uid !== r.host)[0];
  if(basi && calon && calon.uid === G.uid) ambilAlihHost();
}

async function ambilAlihHost(){
  const saya = G.pemain.find(p => p.uid === G.uid);
  if(!saya) return;
  const b = writeBatch(db);
  b.update(refRuang(), { host: G.uid, hostNama: saya.nama });
  b.set(refDetak(), { waktu: serverTimestamp(), uid: G.uid });
  try{ await b.commit(); G.hostBasi = false; gambarBanner(); }
  catch(err){ console.warn('Gagal mengambil alih host', err); }
}

async function keluarRuang(){
  if(!confirm('Keluar dari ruang ini?')) return;
  const r = G.ruang;
  try{
    if(r && r.host === G.uid){
      const lain = G.pemain.find(p => p.uid !== G.uid);
      if(lain) await pindahkanHost(lain.uid);
      else await bubarkan();
    }
    await deleteDoc(refSaya());
  }catch(err){ console.warn(err); }
  keluarPaksa('');
}

/* ============================================================
   7. Suara dan obrolan
   ============================================================ */

async function kirimSuara(aksi, target){
  const p = permainan();
  if(!p || p.fase !== 'voting') return;
  try{
    await setDoc(doc(db, 'agendaruang', G.ruangId, 'suara', G.uid), {
      sesi: G.sesi, saluran: G.saluran, ronde: p.ronde, aksi, target: target || '',
    });
  }catch(err){
    console.error(err);
    pesan('Suaramu belum tercatat. Waktu voting mungkin sudah habis.');
  }
}

$('formObrolan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('inputObrolan');
  const teks = input.value.trim().slice(0, 160);
  if(!teks || !G.saluran) return;
  if(Date.now() - G.terakhirKirim < 3000){ $('obrolanKet').textContent = 'Tunggu sebentar sebelum mengirim pesan lagi.'; return; }
  G.terakhirKirim = Date.now();
  input.value = '';
  try{
    await addDoc(collection(db, 'agendaruang', G.ruangId, 'obrolan'), {
      sesi: G.sesi, saluran: G.saluran, uid: G.uid, nama: namaPemain(G.uid), teks, waktu: serverTimestamp(),
    });
  }catch(err){
    console.error(err);
    input.value = teks;
  }
});

/* ============================================================
   8. Tampilan
   ============================================================ */

function gambar(){
  const r = G.ruang;
  if(!r) return;
  if(r.status === 'lobi'){ tampilkan('layarLobi'); gambarLobi(); return; }
  tampilkan('layarMain');
  gambarMain();
}

function tik(){
  const r = G.ruang;
  if(!r) return;
  if(r.status === 'lobi'){
    if(r.jenis === 'publik'){
      const sisa = ms(r.dibuka) + BATAS_LOBI - sekarang();
      $('lobiBubar').hidden = false;
      $('lobiBubar').textContent = `Ruang otomatis dibubarkan jika permainan belum dimulai dalam ${formatSisa(sisa)}.`;
      if(sisa <= 0) saatRuangBerubah(r);
    } else {
      $('lobiBubar').hidden = true;
    }
    return;
  }
  const p = r.permainan;
  if(!p) return;
  if(r.status === 'selesai'){
    const info = $('infoBubarAkhir');
    const selesai = p.selesaiPada || ms(r.aktif);
    if(info && selesai) info.textContent = `Ruang otomatis dibubarkan dalam ${formatSisa(selesai + BATAS_SELESAI - sekarang())} jika host tidak kembali ke lobi.`;
    if(kedaluwarsa(r)) saatRuangBerubah(r);
  }
  const el = $('timer');
  const sisa = p.jeda != null ? p.jeda : p.berakhir - sekarang();
  el.textContent = p.fase === 'akhir' ? 'SELESAI' : formatSisa(sisa);
  el.classList.toggle('jeda', p.jeda != null);
  el.classList.toggle('mendesak', p.jeda == null && p.fase !== 'akhir' && sisa < 10000);
}

/* ---------- Lobi ---------- */

function gambarLobi(){
  const r = G.ruang;
  $('lobiJenis').textContent = r.jenis === 'publik' ? 'Ruang publik' : 'Ruang terkunci';
  $('lobiJudul').textContent = NAMA_RUANG[G.ruangId];
  $('lobiInfo').textContent = `Host: ${r.hostNama || 'belum ada'}. ${G.pemain.length} dari ${M.MAKS_PEMAIN} pemain.`;
  $('lobiHost').hidden = !G.host;
  $('lobiTunggu').hidden = G.host;

  if(G.host){
    const pilih = $('pilihSkenario');
    if(!pilih.options.length){
      pilih.innerHTML = '<option value="acak">Acak</option>'
        + URUTAN_SKENARIO.map(id => `<option value="${id}">${esc(SKENARIO[id].judul)}</option>`).join('');
    }
    pilih.value = G.skenarioPilihan;
    const sk = SKENARIO[G.skenarioPilihan];
    $('ketSkenario').textContent = sk
      ? `${sk.latar}. ${sk.briefing[0]}`
      : 'Skenario dipilih secara acak saat permainan dimulai.';
    const total = G.pemain.length + G.bot.length;
    const cukup = total >= M.MIN_PEMAIN;
    $('tombolMulai').disabled = !cukup;
    $('syaratMulai').textContent = cukup
      ? 'Setelah dimulai, pemain dibagi rata ke lima kubu secara acak. Peserta manusia disebar lebih dulu, bot mengisi sisanya.'
      : `Butuh minimal ${M.MIN_PEMAIN} pemain. Saat ini baru ${total}. Tambahkan bot jika peserta belum cukup.`;
    $('infoBot').textContent = G.bot.length
      ? `${G.bot.length} bot ikut bermain. Bot hanya memilih aksi untuk kubu yang tidak punya anggota manusia.`
      : 'Belum ada bot. Bot berguna untuk mencoba permainan saat peserta kurang dari lima orang.';
    $('tombolTambahBot').disabled = G.bot.length >= MAKS_BOT || total >= M.MAKS_PEMAIN;
    gambarAturan();
    $('tombolKurangiBot').disabled = !G.bot.length;
  }

  $('daftarPemain').innerHTML = G.pemain.map(p => `
    <li class="${p.uid === G.uid ? 'saya' : ''}">
      <span>${esc(p.nama)}</span>
      ${p.uid === r.host ? '<span class="ag-lencana">HOST</span>' : ''}
      ${G.host && p.uid !== G.uid ? `<button type="button" data-jadikan-host="${esc(p.uid)}">Jadikan host</button>` : ''}
    </li>`).join('')
    + (G.host ? G.bot.map(b => `<li><span>${esc(b.nama)}</span><span class="ag-lencana">BOT</span></li>`).join('') : '');
  tik();
}

$('tombolTambahBot').addEventListener('click', () => {
  if(G.bot.length >= MAKS_BOT || G.pemain.length + G.bot.length >= M.MAKS_PEMAIN) return;
  const terpakai = new Set(G.bot.map(b => b.nama));
  const nama = NAMA_BOT.map(n => 'Bot ' + n).find(n => !terpakai.has(n));
  G.bot.push({ id: 'bot-' + idAcak(8), nama });
  gambarLobi();
});
$('tombolKurangiBot').addEventListener('click', () => { G.bot.pop(); gambarLobi(); });

function formatDetik(d){
  return Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0');
}

function gambarAturan(){
  const a = G.atur;
  $('aturRonde').textContent = `${a.ronde} ronde`;
  $('aturBriefing').textContent = formatDetik(a.briefing);
  $('aturBicara').textContent = formatDetik(a.bicara);
  document.querySelectorAll('[data-atur]').forEach(b => {
    const batas = M.BATAS_ATURAN[b.dataset.atur];
    const nilai = a[b.dataset.atur];
    b.disabled = Number(b.dataset.arah) < 0 ? nilai <= batas.min : nilai >= batas.maks;
  });
  const detik = M.DURASI.kartu + a.briefing + a.ronde * (a.bicara + M.DURASI.voting + M.DURASI.laporan);
  $('perkiraanDurasi').textContent = `Perkiraan durasi permainan sekitar ${Math.round(detik / 60)} menit, belum termasuk pembahasan di akhir.`;
}

document.querySelectorAll('[data-atur]').forEach(b => b.addEventListener('click', () => {
  const kunci = b.dataset.atur;
  const batas = M.BATAS_ATURAN[kunci];
  const nilai = G.atur[kunci] + Number(b.dataset.arah) * batas.langkah;
  G.atur[kunci] = Math.min(batas.maks, Math.max(batas.min, nilai));
  gambarAturan();
}));

$('pilihSkenario').addEventListener('change', (e) => { G.skenarioPilihan = e.target.value; gambarLobi(); });
$('tombolMulai').addEventListener('click', mulaiPermainan);
$('daftarPemain').addEventListener('click', (e) => {
  const uid = e.target.dataset && e.target.dataset.jadikanHost;
  if(uid && confirm(`Jadikan ${namaPemain(uid)} sebagai host?`)) pindahkanHost(uid).catch(console.error);
});

/* ---------- Permainan ---------- */

function infoKubu(sk, id){ return sk.kubu[id]; }

function segel(sk, id, ukuran){
  const d = sk.kubu[id];
  return lambang(id, d.warna, ukuran, d.nama);
}

function totalRonde(p){ return (p.atur && p.atur.ronde) || M.ATURAN_AWAL.ronde; }

function gambarMain(){
  const r = G.ruang;
  const p = r.permainan;
  if(!p) return;
  const sk = SKENARIO[p.skenario];

  $('barJudul').textContent = sk.judul;
  $('barLatar').textContent = sk.latar;
  $('barFase').textContent = NAMA_FASE[p.fase] + (p.jeda != null ? ' (dijeda)' : '');
  $('barRonde').textContent = p.ronde ? `Ronde ${p.ronde} dari ${totalRonde(p)}` : 'Persiapan';
  $('kontrolHost').hidden = !G.host || r.status !== 'main';
  const tJeda = document.querySelector('[data-aksi="jeda"]');
  if(tJeda) tJeda.textContent = p.jeda != null ? 'Lanjutkan' : 'Jeda';

  gambarPapan(p, sk);
  gambarBanner();

  const kunci = [r.status, p.fase, p.ronde, kubuSaya(), kubuSayaHidup(), G.host, p.juru && p.juru.uid].join('|');
  if(kunci !== G.kunciTampil){
    G.kunciTampil = kunci;
    gambarPanggung(p, sk);
    gambarTab();
  } else {
    perbaruiHitungan();
    gambarTabIntel();
  }
  tik();
}

function gambarBanner(){
  const el = $('bannerHost');
  const r = G.ruang;
  if(!r || G.host || !G.hostBasi){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span>Host tidak merespons. Permainan akan tertahan sampai ada host baru.</span>
    <button type="button" class="ag-tombol ag-tombol-kecil" data-aksi="ambilAlih">Ambil alih host</button>`;
}

function gambarPapan(p, sk){
  const saya = kubuSaya();
  $('papan').innerHTML = Object.keys(sk.kubu).map(id => {
    const d = infoKubu(sk, id);
    const k = p.kubu[id];
    const jumlah = Object.values(p.anggota).filter(x => x === id).length;
    const bot = kubuBot(p, id);
    return `<div class="ag-papan-baris ${id === saya ? 'saya' : ''} ${k.hidup ? '' : 'keluar'}" style="--warna:${d.warna}">
      ${segel(sk, id, 38)}
      <span class="ag-papan-nama">${esc(d.nama)}<small>${id === saya ? 'Kubumu, ' : ''}${jumlah} anggota${bot ? `, ${bot} bot` : ''}${k.hidup ? '' : ', tereliminasi'}</small></span>
      <span class="ag-papan-nilai">${deretKT(k.kt, M.KT_MAKS, 11)}${nilaiPG(k.pg, 14)}</span>
    </div>`;
  }).join('');
}

/*
  Kartu kubu. Sisi belakang berupa map berkas rahasia, sisi depan berisi isi
  kartu. "balik" bernilai true untuk kartu yang dibuka dengan animasi flip
  saat kartu dibagikan; kartu di tab samping langsung tampil terbuka.
*/
function kartuKubu(sk, id, p, balik){
  const d = infoKubu(sk, id);
  const k = p.kubu[id];
  const tujuan = TUJUAN[d.tujuan];
  const depan = `<article class="ag-kartu-depan" style="--warna:${d.warna}">
    <header class="ag-kartu-pita">
      <span class="ag-kartu-label">Kartu kubu</span>
      <span class="ag-stempel">RAHASIA</span>
    </header>
    <div class="ag-kartu-identitas">
      ${segel(sk, id, 84)}
      <div>
        <h3>${esc(d.nama)}</h3>
        <span class="ag-kartu-tipe">Tujuan ${esc(tujuan.nama)}</span>
      </div>
    </div>
    <div class="ag-kartu-nilai">
      <div><span class="ag-kecil-kapital">Ketahanan</span>${deretKT(k.kt, M.KT_MAKS, 16)}</div>
      <div><span class="ag-kecil-kapital">Pengaruh</span>${nilaiPG(k.pg, 18)}</div>
    </div>
    <dl>
      <dt>Agenda</dt><dd>${esc(d.agenda)}</dd>
      <dt>Tujuan</dt><dd>${esc(kalimatTujuan(sk, id, p.target))}</dd>
      <dt>Risiko terbesar</dt><dd><strong>${esc(TITIK[d.titik].nama)}.</strong> ${esc(TITIK[d.titik].kalimat)} Kubu juga tereliminasi jika Ketahanan habis.</dd>
    </dl>
    <div class="ag-keunggulan"><span class="ag-kecil-kapital">Keunggulan: ${esc(tujuan.keunggulan.nama)}</span>${esc(tujuan.keunggulan.ket)}</div>
    <p class="ag-kartu-saran">${esc(d.saran)}</p>
    ${k.hidup ? '' : `<p class="ag-palsu">Tereliminasi karena ${esc(k.sebab)}.</p>`}
  </article>`;
  if(!balik) return `<div class="ag-kartu-tunggal">${depan}</div>`;
  return `<div class="ag-flip" data-flip tabindex="0" role="button" aria-label="Balik kartu kubu">
    <div class="ag-flip-dalam">
      <div class="ag-flip-sisi ag-flip-belakang">
        <div class="ag-map">
          <span class="ag-stempel">RAHASIA</span>
          ${lambang('saksi', '#6b5638', 96, 'Berkas rahasia')}
          <strong>${esc(sk.judul)}</strong>
          <span>Berkas kubu untukmu</span>
          <small>Ketuk untuk membuka</small>
        </div>
      </div>
      <div class="ag-flip-sisi ag-flip-muka">${depan}</div>
    </div>
  </div>`;
}

function kartuSaksi(balik){
  const isi = `<article class="ag-kartu-depan" style="--warna:#6b5638">
    <header class="ag-kartu-pita"><span class="ag-kartu-label">Kartu peran</span><span class="ag-stempel">SAKSI</span></header>
    <div class="ag-kartu-identitas">${lambang('saksi', '#6b5638', 84, 'Saksi')}<div><h3>Kamu adalah Saksi</h3><span class="ag-kartu-tipe">Tanpa kubu</span></div></div>
    <dl>
      <dt>Peran</dt><dd>Kamu mengikuti jalannya kasus tanpa kubu. Kubu yang sudah tereliminasi juga menjadi Saksi.</dd>
      <dt>Yang bisa kamu lakukan</dt><dd>Pada setiap voting, para Saksi memilih satu kubu untuk didukung. Kubu dengan dukungan terbanyak mendapat tambahan 1 Pengaruh. Jika dukungan seri, tidak ada kubu yang mendapatkannya.</dd>
    </dl>
    <p class="ag-kartu-saran">Dengarkan setiap juru bicara dengan cermat. Dukunganmu bisa menentukan nasib satu kubu.</p>
  </article>`;
  return balik
    ? `<div class="ag-flip" data-flip tabindex="0" role="button" aria-label="Balik kartu"><div class="ag-flip-dalam">
        <div class="ag-flip-sisi ag-flip-belakang"><div class="ag-map"><span class="ag-stempel">RAHASIA</span>${lambang('saksi', '#6b5638', 96, 'Berkas rahasia')}<strong>Saksi</strong><small>Ketuk untuk membuka</small></div></div>
        <div class="ag-flip-sisi ag-flip-muka">${isi}</div></div></div>`
    : `<div class="ag-kartu-tunggal">${isi}</div>`;
}

// Penjelasan Ketahanan dan Pengaruh beserta simbolnya.
function htmlNilai(){
  return `<div class="ag-legenda">
    <div class="ag-legenda-isi">
      <div class="ag-legenda-ikon">${ikonKT(30)}</div>
      <div><strong>Ketahanan (KT)</strong><p>Dilambangkan tameng. Menunjukkan seberapa kuat kubu bertahan. Setiap kubu mulai dengan ${M.KT_AWAL} KT dan berkurang saat diserang. Jika KT habis, kubu tereliminasi.</p></div>
    </div>
    <div class="ag-legenda-isi">
      <div class="ag-legenda-ikon">${ikonPG(30)}</div>
      <div><strong>Pengaruh (PG)</strong><p>Dilambangkan koin. Menunjukkan sumber daya dan kekuatan tawar kubu. Setiap kubu mulai dengan ${M.PG_AWAL} PG. Banyak tujuan rahasia diukur dari jumlah PG di akhir permainan.</p></div>
    </div>
  </div>`;
}

function htmlDaftarAksi(lengkap){
  return `<div class="ag-ringkas-aksi">${M.AKSI.map(a => `
    <div class="ag-ringkas-baris">
      <span class="ag-ringkas-ikon">${ikonAksi(a.id, 30)}</span>
      <div><strong>${esc(a.nama)}</strong> <span class="ag-kecil">${esc(a.ket)}</span>
        ${lengkap ? `<ul>${a.interaksi.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
    </div>`).join('')}</div>`;
}

function gambarPanggung(p, sk){
  const el = $('panggung');
  const saya = kubuSaya();
  const hidup = kubuSayaHidup();

  if(p.fase === 'kartu'){
    el.innerHTML = `<h2>Kartu kubumu sudah dibagikan</h2>
      <p class="ag-kecil">Kartu ini rahasia. Jangan perlihatkan layarmu kepada kubu lain. Kartu tetap bisa dibuka kapan saja lewat tab Kartu.</p>
      ${saya === 'saksi' ? kartuSaksi(true) : kartuKubu(sk, saya, p, true)}`;
    const flip = el.querySelector('[data-flip]');
    setTimeout(() => flip && flip.classList.add('terbuka'), 700);
    return;
  }

  if(p.fase === 'briefing'){
    el.innerHTML = `<span class="ag-stempel ag-stempel-pojok">BERKAS KASUS</span>
      <h2>${esc(sk.judul)}</h2>
      <p class="ag-kecil">${esc(sk.latar)}</p>
      ${sk.briefing.map(t => `<p>${esc(t)}</p>`).join('')}
      <h3>Kubu yang terlibat</h3>
      <div class="ag-kubu-grid">${Object.keys(sk.kubu).map(id => {
        const d = infoKubu(sk, id);
        return `<div class="ag-kubu-mini" style="--warna:${d.warna}">${segel(sk, id, 44)}<strong>${esc(d.nama)}</strong></div>`;
      }).join('')}</div>
      <h3>Cara membaca nilai kubu</h3>
      ${htmlNilai()}
      <h3>Enam aksi yang bisa dipilih</h3>
      <p class="ag-kecil">Hasil sebuah aksi bergantung pada pilihan kubu yang menjadi targetnya. Rincian lengkapnya ada di tab Aturan.</p>
      ${htmlDaftarAksi(false)}
      <p class="ag-kecil">Permainan berlangsung ${totalRonde(p)} ronde. Setiap kubu ingin mencapai tujuannya sendiri, dan tujuan kubu lain tidak diketahui siapa pun.</p>`;
    return;
  }

  if(p.fase === 'bicara' || p.fase === 'bebas'){
    const id = p.urutan[(p.ronde - 1) % p.urutan.length];
    const d = infoKubu(sk, id);
    if(p.fase === 'bebas'){
      el.innerHTML = `<div class="ag-sorot">
        ${segel(sk, id, 130)}
        <h2>Sesi bebas</h2>
        <p>${p.alasanBebas === 'bot'
          ? `${esc(d.nama)} dijalankan oleh bot, jadi giliran ini dipakai untuk diskusi bebas antar kubu.`
          : `${esc(d.nama)} sudah tereliminasi, jadi giliran ini dipakai untuk diskusi bebas antar kubu.`}</p>
        <p class="ag-kecil">Manfaatkan obrolan kubu untuk menyusun rencana voting berikutnya.</p>
      </div>`;
      return;
    }
    const giliranku = id === saya;
    const juru = p.juru ? (p.juru.uid === G.uid ? 'Kamu' : p.juru.nama) : 'Siapa pun dari kubu ini';
    el.innerHTML = `<div class="ag-sorot" style="--warna:${d.warna}">
      ${segel(sk, id, 150)}
      <p class="ag-label ag-label-merah">Giliran bicara</p>
      <h2>${esc(d.nama)}</h2>
      <p class="ag-juru">Juru bicara: <strong>${esc(juru)}</strong></p>
      <p>${giliranku
        ? 'Ini giliran kubumu. Sampaikan apa pun yang bisa memengaruhi kubu lain lewat kanal suara kelas. Kalian boleh jujur, boleh juga menggertak.'
        : 'Kubu lain menyimak lewat kanal suara kelas. Perhatikan mana yang fakta dan mana yang hanya klaim.'}</p>
      ${p.juru && p.juru.uid === G.uid ? '<p class="ag-kecil">Kamu ditunjuk sebagai juru bicara. Anggota kubumu boleh membantu lewat obrolan kubu.</p>' : ''}
    </div>`;
    return;
  }

  if(p.fase === 'voting'){
    if(hidup) gambarVotingKubu(el, p, sk, saya);
    else gambarVotingSaksi(el, p, sk);
    return;
  }

  if(p.fase === 'laporan'){
    el.innerHTML = htmlLaporan(p, sk, p.ronde, true);
    return;
  }

  if(p.fase === 'akhir'){
    el.innerHTML = htmlAkhir(p, sk);
  }
}

/* ---------- Voting ---------- */

function suaraSaya(){
  const p = permainan();
  const s = G.suaraKubu.find(x => x.uid === G.uid);
  return s && p && s.ronde === p.ronde ? s : null;
}

function gambarVotingKubu(el, p, sk, saya){
  const k = p.kubu[saya];
  const lawan = Object.keys(sk.kubu).filter(id => id !== saya && p.kubu[id].hidup);
  el.innerHTML = `<div class="ag-voting">
    <h2>Pilih aksi kubumu</h2>
    <p class="ag-kecil">Pilihanmu langsung tercatat dan masih bisa diganti sampai waktu habis. Aksi dengan suara terbanyak yang dijalankan. Jika seri, kubu otomatis Diam.</p>
    <div class="ag-kartu-aksi-daftar">${M.AKSI.map(a => `
      <button type="button" class="ag-kartu-aksi" data-pilih-aksi="${a.id}" aria-pressed="false">
        <span class="ag-hitung" data-hitung="${a.id}">0</span>
        <span class="ag-kartu-aksi-ikon">${ikonAksi(a.id, 44)}</span>
        <span class="ag-aksi-nama">${esc(a.nama)}</span>
        <span class="ag-aksi-sifat">${esc(a.sifat)}</span>
        <span class="ag-aksi-ket">${esc(a.ket)}</span>
        <span class="ag-aksi-interaksi">${a.interaksi.map(t => `<span>${esc(t)}</span>`).join('')}</span>
      </button>`).join('')}</div>
    <div class="ag-target" id="bungkusTarget" hidden>
      <span class="ag-kecil-kapital">Pilih kubu target</span>
      <div class="ag-target-daftar">${lawan.map(id => `
        <button type="button" class="ag-target-pilih" data-pilih-target="${id}" style="--warna:${sk.kubu[id].warna}">
          ${segel(sk, id, 30)}<span>${esc(sk.kubu[id].nama)}</span><b data-hitung-target="${id}"></b>
        </button>`).join('')}</div>
    </div>
    <p class="ag-status-suara" id="statusSuara"></p>
    <p class="ag-kecil">Kondisi kubumu: ${deretKT(k.kt, M.KT_MAKS, 13)} ${nilaiPG(k.pg, 14)}</p>
  </div>`;
  G.pilihanAksi = '';
  G.pilihanTarget = '';
  el.querySelectorAll('[data-pilih-aksi]').forEach(b => b.addEventListener('click', () => {
    G.pilihanAksi = b.dataset.pilihAksi;
    if(!M.butuhTarget(G.pilihanAksi)) G.pilihanTarget = '';
    tandaiPilihan();
    kirimSuara(G.pilihanAksi, G.pilihanTarget);
  }));
  el.querySelectorAll('[data-pilih-target]').forEach(b => b.addEventListener('click', () => {
    G.pilihanTarget = b.dataset.pilihTarget;
    tandaiPilihan();
    if(G.pilihanAksi) kirimSuara(G.pilihanAksi, G.pilihanTarget);
  }));
  perbaruiHitungan(true);
}

function tandaiPilihan(){
  const el = $('panggung');
  el.querySelectorAll('[data-pilih-aksi]').forEach(b => {
    const aktif = b.dataset.pilihAksi === G.pilihanAksi;
    b.classList.toggle('dipilih', aktif);
    b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
  });
  el.querySelectorAll('[data-pilih-target]').forEach(b => b.classList.toggle('dipilih', b.dataset.pilihTarget === G.pilihanTarget));
  const bungkus = $('bungkusTarget');
  if(bungkus) bungkus.hidden = !(G.pilihanAksi && M.butuhTarget(G.pilihanAksi));
}

function gambarVotingSaksi(el, p, sk){
  const hidup = Object.keys(sk.kubu).filter(id => p.kubu[id].hidup);
  el.innerHTML = `<div class="ag-voting">
    <h2>Dukungan Saksi</h2>
    <p class="ag-kecil">Pilih satu kubu yang ingin kamu dukung pada ronde ini. Kubu dengan dukungan Saksi terbanyak mendapat tambahan 1 Pengaruh.</p>
    <div class="ag-target-daftar">${hidup.map(id => `
      <button type="button" class="ag-target-pilih" data-dukung="${id}" style="--warna:${sk.kubu[id].warna}">
        ${segel(sk, id, 30)}<span>${esc(sk.kubu[id].nama)}</span><b data-hitung="${id}"></b>
      </button>`).join('')}</div>
    <p class="ag-status-suara" id="statusSuara"></p>
  </div>`;
  el.querySelectorAll('[data-dukung]').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('[data-dukung]').forEach(x => x.classList.toggle('dipilih', x === b));
    kirimSuara('dukung', b.dataset.dukung);
  }));
  perbaruiHitungan(true);
}

function perbaruiHitungan(pasangPilihan){
  const p = permainan();
  const el = $('panggung');
  if(!p || p.fase !== 'voting' || !el.querySelector('.ag-voting')) return;
  const suara = G.suaraKubu.filter(s => s.ronde === p.ronde);
  const saksi = !kubuSayaHidup();
  const hitung = {};
  const hitungTarget = {};
  for(const s of suara){
    const kunci = saksi ? s.target : s.aksi;
    hitung[kunci] = (hitung[kunci] || 0) + 1;
    if(!saksi && s.target) hitungTarget[s.target] = (hitungTarget[s.target] || 0) + 1;
  }
  el.querySelectorAll('[data-hitung]').forEach(b => {
    const n = hitung[b.dataset.hitung] || 0;
    b.textContent = saksi ? (n ? `${n} suara` : '') : n;
    b.classList.toggle('ada', n > 0);
  });
  el.querySelectorAll('[data-hitung-target]').forEach(b => {
    const n = hitungTarget[b.dataset.hitungTarget] || 0;
    b.textContent = n ? `${n} suara` : '';
  });

  $('statusSuara').textContent = saksi
    ? `${suara.length} Saksi sudah memilih.`
    : `${suara.length} dari ${anggotaHadir(p, kubuSaya()).length} anggota kubumu sudah memilih.`;

  if(pasangPilihan){
    const milik = suaraSaya();
    if(milik && !saksi){
      G.pilihanAksi = milik.aksi;
      G.pilihanTarget = milik.target || '';
      tandaiPilihan();
    } else if(milik && saksi){
      el.querySelectorAll('[data-dukung]').forEach(x => x.classList.toggle('dipilih', x.dataset.dukung === milik.target));
    }
  }
}

/* ---------- Laporan ---------- */

function teksAksi(sk, aksi){
  if(!aksi) return 'Diam';
  const nama = M.infoAksi(aksi.aksi).nama;
  return aksi.target && sk.kubu[aksi.target] ? `${nama} terhadap ${sk.kubu[aksi.target].nama}` : nama;
}

function perubahan(dari, jadi){
  if(dari === jadi) return `<b>${jadi}</b>`;
  return `${dari} <span aria-hidden="true">menjadi</span> <b class="${jadi < dari ? 'turun' : 'naik'}">${jadi}</b>`;
}

function htmlLaporan(p, sk, ronde, lengkap){
  const lap = (p.laporan || []).find(l => l.ronde === ronde);
  if(!lap) return '<p>Laporan belum tersedia.</p>';
  const saya = kubuSaya();
  const hasil = p.hasil && p.hasil[saya];
  const catatan = saya !== 'saksi' ? (p.catatan[saya] || []).filter(c => c.ronde === ronde) : [];

  return `<span class="ag-stempel ag-stempel-pojok">LAPORAN</span>
    <h2>Laporan ronde ${ronde}</h2>
    <p class="ag-kecil">Laporan ini hanya menampilkan akibat. Siapa pelakunya tidak disebutkan.</p>
    ${p.saksiKubu && lengkap ? `<p class="ag-kecil">Dukungan Saksi ronde ini jatuh kepada ${esc(sk.kubu[p.saksiKubu].nama)}.</p>` : ''}
    <div class="ag-laporan">${lap.baris.map(b => {
      const d = sk.kubu[b.kubu];
      return `<div class="ag-baris ${b.keluar ? 'keluar' : ''}" style="--warna:${d.warna}">
        ${segel(sk, b.kubu, 44)}
        <div>
          <strong>${esc(d.nama)}</strong>
          <div class="ag-angka"><span>${ikonKT(15)} ${perubahan(b.ktDari, b.ktJadi)}</span><span>${ikonPG(15)} ${perubahan(b.pgDari, b.pgJadi)}</span></div>
          <div class="ag-peristiwa">${b.peristiwa.length ? b.peristiwa.map(t => `<span>${esc(t)}</span>`).join('') : '<em>Tidak ada kejadian menonjol</em>'}${b.keluar ? `<span class="ag-palsu">Tereliminasi karena ${esc(b.keluar)}</span>` : ''}</div>
        </div>
      </div>`;
    }).join('')}</div>
    ${lengkap && saya !== 'saksi' && hasil ? `<div class="ag-catatan">
      <strong>Catatan rahasia kubumu</strong>
      <ul>
        <li>Hasil voting: ${esc(hasil.alasan)}</li>
        ${catatan.map(c => `<li>${esc(c.teks)}</li>`).join('')}
      </ul>
    </div>` : ''}`;
}

/* ---------- Akhir ---------- */

function htmlAkhir(p, sk){
  const ids = Object.keys(sk.kubu);
  const akhir = p.akhir || M.nilaiAkhir(p, sk);
  const berhasil = ids.filter(id => akhir[id].berhasil).length;
  const palsu = [];
  for(const id of ids){
    for(const it of (p.intel[id] || [])){
      if(it.palsu) palsu.push({ ...it, penerima: id });
    }
  }
  palsu.sort((a, b) => a.ronde - b.ronde);
  const sisa = p.selesaiPada ? Math.max(0, p.selesaiPada + BATAS_SELESAI - sekarang()) : BATAS_SELESAI;

  return `<span class="ag-stempel ag-stempel-pojok">DITUTUP</span>
    <h2>Kasus ditutup</h2>
    <p>${berhasil} dari ${ids.length} kubu berhasil mencapai agendanya. Inilah isi kartu rahasia setiap kubu.</p>
    <p class="ag-kecil" id="infoBubarAkhir">Ruang otomatis dibubarkan dalam ${formatSisa(sisa)} jika host tidak kembali ke lobi.</p>
    <div class="ag-hasil">${ids.map((id, i) => {
      const d = sk.kubu[id];
      const k = p.kubu[id];
      return `<article class="ag-hasil-kartu ${akhir[id].berhasil ? 'berhasil' : 'gagal'}" style="--warna:${d.warna}; --tunda:${i * 0.18}s">
        <div class="ag-hasil-kepala">${segel(sk, id, 56)}<h3>${esc(d.nama)}</h3></div>
        <dl>
          <dt>Tujuan ${esc(TUJUAN[d.tujuan].nama)}</dt><dd>${esc(kalimatTujuan(sk, id, p.target))}</dd>
          <dt>Titik lemah</dt><dd>${esc(TITIK[d.titik].nama)}</dd>
          <dt>Hasil</dt><dd>${esc(akhir[id].alasan)}</dd>
        </dl>
        <div class="ag-kartu-nilai">${deretKT(k.kt, M.KT_MAKS, 13)}${nilaiPG(k.pg, 15)}</div>
        <span class="ag-cap ${akhir[id].berhasil ? 'berhasil' : 'gagal'}">${akhir[id].berhasil ? 'BERHASIL' : 'GAGAL'}</span>
      </article>`;
    }).join('')}</div>

    <h3>Jejak keputusan</h3>
    <div class="ag-tabel-bungkus"><table class="ag-tabel">
      <thead><tr><th>Ronde</th>${ids.map(id => `<th><span class="ag-th-kubu">${segel(sk, id, 22)}${esc(sk.kubu[id].nama)}</span></th>`).join('')}</tr></thead>
      <tbody>${(p.riwayat || []).map(rw => `<tr><td>${rw.ronde}</td>${ids.map(id => `<td>${rw.aksi[id] ? esc(teksAksi(sk, rw.aksi[id])) : '<span class="ag-kecil">tereliminasi</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>

    <h3>Intel palsu yang beredar</h3>
    ${palsu.length ? `<ul class="ag-intel">${palsu.map(it => `<li><small>Ronde ${it.ronde}, diterima ${esc(sk.kubu[it.penerima].nama)}</small><span class="ag-palsu">PALSU.</span> ${esc(it.teks)}</li>`).join('')}</ul>`
      : '<p class="ag-kecil">Tidak ada intel palsu pada permainan ini.</p>'}

    <h3>Bahan diskusi</h3>
    <div class="ag-tabel-bungkus"><table class="ag-tabel">
      <thead><tr><th>Materi</th><th>Pertanyaan</th></tr></thead>
      <tbody>
        <tr><td>Critical Thinking</td><td>Intel mana yang kalian percaya? Apakah itu fakta atau hanya dugaan? Bagaimana kalian memeriksanya?</td></tr>
        <tr><td>Problem Solving</td><td>Bagaimana kubu kalian mengejar tujuan dengan informasi yang serba terbatas?</td></tr>
        <tr><td>Decision Making</td><td>Kapan kalian memilih bersekutu, bertahan, atau menyerang? Apa yang kalian perkirakan akan dipilih kubu lain?</td></tr>
      </tbody>
    </table></div>

    <div class="ag-akhir-aksi">
      ${G.host ? `<button type="button" class="ag-tombol" data-aksi="lobi">Kembali ke lobi</button>
        <button type="button" class="ag-tombol ag-tombol-garis ag-tombol-gelap" data-aksi="bubarkan">Bubarkan ruang</button>` : ''}
    </div>`;
}

/* ---------- Tab samping ---------- */

function gambarTab(){
  const p = permainan();
  if(!p) return;
  const sk = SKENARIO[p.skenario];
  const saya = kubuSaya();
  $('tabKartu').innerHTML = saya === 'saksi' ? kartuSaksi(false) : kartuKubu(sk, saya, p, false);
  $('tabAturan').innerHTML = `<h4>Nilai kubu</h4>${htmlNilai()}<h4 style="margin-top:14px">Enam aksi dan akibatnya</h4>${htmlDaftarAksi(true)}`;
  gambarTabIntel();
  gambarObrolan();
  pilihTab(G.tab);
}

function gambarTabIntel(){
  const p = permainan();
  if(!p) return;
  const sk = SKENARIO[p.skenario];
  const saya = kubuSaya();
  if(saya === 'saksi'){
    $('tabIntel').innerHTML = '<p class="ag-kecil">Saksi tidak menerima laporan intel. Ikuti laporan ronde di layar utama.</p>';
    return;
  }
  const intel = (p.intel[saya] || []).slice().reverse();
  const catatan = (p.catatan[saya] || []).slice().reverse();
  const akhir = p.fase === 'akhir';
  $('tabIntel').innerHTML = `
    <h4>Laporan intel</h4>
    <p class="ag-kecil">Sebagian laporan bisa saja palsu, misalnya karena target sedang Bertahan. Timbang sebelum mempercayainya.</p>
    ${intel.length ? `<ul class="ag-intel">${intel.map(it => `<li><small>Ronde ${it.ronde}</small>${akhir && it.palsu ? '<span class="ag-palsu">PALSU.</span> ' : ''}${esc(it.teks)}</li>`).join('')}</ul>`
      : '<p class="ag-kecil">Belum ada laporan intel. Gunakan aksi Selidiki untuk mendapatkannya.</p>'}
    <h4 style="margin-top:14px">Catatan kubu</h4>
    ${catatan.length ? `<ul class="ag-intel">${catatan.map(c => `<li><small>Ronde ${c.ronde}</small>${esc(c.teks)}</li>`).join('')}</ul>`
      : '<p class="ag-kecil">Belum ada catatan.</p>'}`;
  const baru = intel.length > G.intelDilihat && G.tab !== 'intel';
  tandaiTab('intel', baru);
  if(G.tab === 'intel') G.intelDilihat = intel.length;
}

function gambarObrolan(){
  const el = $('daftarObrolan');
  const p = permainan();
  if(!p) return;
  const sk = SKENARIO[p.skenario];
  const saluranSaksi = !kubuSayaHidup();
  $('obrolanKet').textContent = saluranSaksi
    ? 'Obrolan para Saksi. Kubu yang masih bermain tidak bisa membaca pesan ini.'
    : `Obrolan rahasia ${sk.kubu[kubuSaya()].nama}. Kubu lain tidak bisa membaca pesan ini.`;
  const bawah = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = G.obrolan.slice(-80).map(m => `<li><b>${esc(m.nama)}</b> ${esc(m.teks)}</li>`).join('')
    || '<li class="ag-kecil">Belum ada pesan.</li>';
  if(bawah) el.scrollTop = el.scrollHeight;
  const baru = G.obrolan.length > G.obrolanDilihat && G.tab !== 'obrolan';
  tandaiTab('obrolan', baru);
  if(G.tab === 'obrolan') G.obrolanDilihat = G.obrolan.length;
}

function tandaiTab(nama, nyala){
  const b = document.querySelector(`.ag-tab [data-tab="${nama}"]`);
  if(!b) return;
  const titik = b.querySelector('.ag-titik');
  if(nyala && !titik) b.insertAdjacentHTML('beforeend', '<span class="ag-titik" aria-label="ada yang baru"></span>');
  if(!nyala && titik) titik.remove();
}

function pilihTab(nama){
  G.tab = nama;
  document.querySelectorAll('.ag-tab [data-tab]').forEach(b => b.classList.toggle('aktif', b.dataset.tab === nama));
  $('tabKartu').hidden = nama !== 'kartu';
  $('tabIntel').hidden = nama !== 'intel';
  $('tabObrolan').hidden = nama !== 'obrolan';
  $('tabAturan').hidden = nama !== 'aturan';
  if(nama === 'intel'){
    const p = permainan();
    const saya = kubuSaya();
    G.intelDilihat = p && saya !== 'saksi' ? (p.intel[saya] || []).length : 0;
    tandaiTab('intel', false);
  }
  if(nama === 'obrolan'){
    G.obrolanDilihat = G.obrolan.length;
    tandaiTab('obrolan', false);
    const el = $('daftarObrolan');
    el.scrollTop = el.scrollHeight;
  }
}

document.querySelectorAll('.ag-tab [data-tab]').forEach(b => b.addEventListener('click', () => pilihTab(b.dataset.tab)));

// Kartu yang bisa dibalik: ketuk atau tekan Enter untuk membalik.
document.addEventListener('click', (e) => {
  const kartu = e.target.closest('[data-flip]');
  if(kartu) kartu.classList.toggle('terbuka');
});
document.addEventListener('keydown', (e) => {
  const kartu = e.target.closest && e.target.closest('[data-flip]');
  if(kartu && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); kartu.classList.toggle('terbuka'); }
});

/* ---------- Dialog pindah host ---------- */

function bukaDialogPindah(){
  const daftar = G.pemain.filter(p => p.uid !== G.uid);
  $('dialogIsi').innerHTML = `<h3>Pindahkan host</h3>
    <p>Host baru akan menjalankan permainan dari perangkatnya. Pastikan orangnya masih terhubung.</p>
    ${daftar.length ? `<ul>${daftar.map(p => `<li><span>${esc(p.nama)}</span><button type="button" class="ag-tombol ag-tombol-kecil" data-pindah="${esc(p.uid)}">Pilih</button></li>`).join('')}</ul>`
      : '<p>Belum ada pemain lain di ruang ini.</p>'}`;
  $('dialog').showModal();
}

$('dialogIsi').addEventListener('click', (e) => {
  const uid = e.target.dataset && e.target.dataset.pindah;
  if(!uid) return;
  pindahkanHost(uid).then(() => $('dialog').close()).catch((err) => { console.error(err); pesan('Host gagal dipindahkan.'); });
});

/* ---------- Tombol umum ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-aksi]');
  if(!t) return;
  const aksi = t.dataset.aksi;
  const jalankan = (f) => Promise.resolve().then(f).catch((err) => { console.error(err); pesan('Perintah gagal dijalankan. Coba lagi.'); });
  switch(aksi){
    case 'keluar': jalankan(keluarRuang); break;
    case 'bubarkan':
      if(confirm('Bubarkan ruang ini? Semua pemain akan dikeluarkan.')) jalankan(bubarkan);
      break;
    case 'jeda': jalankan(() => ubahWaktu('jeda')); break;
    case 'tambah': jalankan(() => ubahWaktu('tambah')); break;
    case 'lewati': {
      const p = permainan();
      if(p && G.host && confirm('Lewati fase ini sekarang?')) jalankan(() => maju(p.ronde + ':' + p.fase + ':lewati'));
      break;
    }
    case 'pindahHost': bukaDialogPindah(); break;
    case 'ambilAlih': jalankan(ambilAlihHost); break;
    case 'lobi': jalankan(kembaliKeLobi); break;
  }
});
