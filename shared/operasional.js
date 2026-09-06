/*
  Halaman operasional KAFBE Hub.

  PENTING UNTUK YANG MERAWAT BERKAS INI:

  Berkas ini berjalan di peramban pengurus, jadi isinya bisa dibaca siapa pun.
  Jangan pernah menaruh kata sandi, kunci rahasia, atau pemeriksaan keamanan di
  sini. Semua pemeriksaan di bawah hanya untuk KENYAMANAN pemakai, misalnya
  memberi tahu jadwal bentrok sebelum tersimpan.

  Yang benar-benar menjaga data adalah firestore.rules, karena aturan itu
  dijalankan di server Google dan tidak bisa dilewati lewat Console peramban.
*/

import { bacaBerkas, susunBerkas, unduhBlob } from './excel.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  query, orderBy, limit, startAfter, serverTimestamp,
} = await import(`${SDK}/firebase-firestore.js`);

const app  = initializeApp(window.KAFBE_FIREBASE_CONFIG);
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

// 470 -> "07.50", bentuk yang dipakai halaman publik.
function keJamTitik(menit){
  const j = Math.floor(menit / 60), n = menit % 60;
  return `${String(j).padStart(2,'0')}.${String(n).padStart(2,'0')}`;
}

function rentangJam(mulai, selesai){
  return `${keJamTitik(keMenit(mulai))} - ${keJamTitik(keMenit(selesai))}`;
}

// Tanggal hari ini menurut zona waktu Jakarta (UTC+7), bukan zona waktu jam
// komputer pemakai. Kalau pakai toISOString() biasa, pengumuman bisa dianggap
// belum berakhir gara-gara jamnya masih dini hari menurut UTC padahal di
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

// Dua rentang waktu dianggap bentrok kalau saling menimpa, bukan sekadar
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

  Dua kelas daring pada jam yang sama sama sekali tidak berebut apa pun, tapi
  pemeriksa bentrok ruangan dulu memperlakukan tulisan ONLINE seperti nama
  ruangan biasa. Akibatnya memindahkan kelas ke hari lain sekaligus menjadikannya
  daring selalu ditolak dengan alasan ruangnya sudah dipakai kelas pengganti
  lain, padahal keduanya memang daring.

  Fungsi ini mengembalikan nama ruang hanya kalau ruangnya benar-benar ada.
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
  asinkron, dan kalau salah satunya gagal diam-diam pemakai cuma melihat
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

onAuthStateChanged(auth, async (user) => {
  if(!user){
    $('layarMasuk').hidden = false;
    $('aplikasi').hidden = true;
    return;
  }

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
    // Pesan dipasang LEBIH DULU, baru keluar. Kalau urutannya dibalik dan
    // signOut gagal, pemakai hanya melihat halaman masuk kosong tanpa
    // penjelasan apa pun, dan itu justru yang paling membingungkan.
    if(galat){
      pesan($('pesanMasuk'),
        'Masuk berhasil, tapi status admin tidak bisa diperiksa.<br>'
        + `Pesan aslinya: <code>${esc(galat.message || galat.code || 'tidak diketahui')}</code><br><br>`
        + 'Biasanya ini berarti aturan keamanan Firestore belum terpasang. '
        + 'Lihat langkah 1.4 di PANDUAN-PENGURUS.md.',
        'salah');
    }else{
      pesan($('pesanMasuk'),
        'Masuk berhasil, tapi akun ini belum terdaftar sebagai admin.<br><br>'
        + 'Di Firestore, koleksi <code>admins</code> harus punya dokumen yang '
        + '<strong>Document ID-nya persis sama</strong> dengan baris di bawah ini:'
        + `<br><code class="op-uid">${esc(user.uid)}</code>`
        + 'Pastikan memakai ID itu, <strong>bukan</strong> tombol Auto-ID, dan '
        + 'UID-nya ditaruh sebagai Document ID, bukan sebagai isi field.',
        'salah');
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

// Siapa yang sedang memakai halaman, diisi setelah login dan dipakai sebagai
// pelaku pada catatan log.
let pemakai = { nama: '', email: '' };

const data = {
  matakuliah: [],
  jadwal: [],
  perubahan: [],
  pengumuman: [],
  pengajar: [],
  // Dua koleksi di bawah hanya dipakai halaman ini dan berkas Excel. Isinya
  // tidak pernah ikut diterbitkan ke dokumen publik.
  classroom: [],
  koordinator: [],
  // Pengajuan akun dari halaman /pengajar. Isinya nama, NRP, dan email orang,
  // jadi tidak pernah ikut diterbitkan ke dokumen publik.
  pengajarakun: [],
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
      ? 'Aturan keamanan Firestore belum mengizinkan koleksi ini. Tempel ulang isi firestore.rules lewat Firebase Console, lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
      : (err.message || 'tidak diketahui'));
    return [];
  }
}

async function muatSemua(){
  status('Memuat data…', 'sibuk');
  try{
    const [mk, jd, pb, pm, pg, gc, ko, ap] = await Promise.all([
      ambilKoleksi('matakuliah'),
      ambilKoleksi('jadwal'),
      ambilKoleksi('perubahan'),
      ambilKoleksi('pengumuman'),
      ambilKoleksi('pengajar'),
      ambilKoleksi('classroom'),
      ambilKoleksi('koordinator'),
      ambilKoleksi('pengajarakun'),
    ]);
    data.matakuliah = mk.sort((a,b) => (a.nama||'').localeCompare(b.nama||''));
    data.jadwal = jd;
    data.perubahan = pb.sort((a,b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    data.pengumuman = pm;
    data.pengajar = pg;
    data.classroom = gc;
    data.koordinator = ko;
    // Yang menunggu keputusan ditaruh paling atas, sebab itulah satu-satunya
    // baris yang menuntut pekerjaan dari pengurus.
    data.pengajarakun = ap.sort((a, b) =>
      (a.status === 'menunggu' ? 0 : 1) - (b.status === 'menunggu' ? 0 : 1)
      || String(a.nama || '').localeCompare(String(b.nama || '')));

    gambarSemua();

    if(gagalMuat.size === 0){
      $('statusSimpan').hidden = true;
    }else{
      status(
        `Sebagian data tidak bisa dimuat: ${[...gagalMuat.keys()].join(', ')}. `
        + 'Bagian lainnya tetap bisa dipakai seperti biasa.', 'salah');
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
    // cuma mengubah satu jadwal tidak perlu ikut menanggung pembacaannya.
    if(btn.dataset.tab === 'log' && !logSudahDimuat) muatLog(false);
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
   5. Mata kuliah
   ============================================================ */

function gambarMatkul(){
  const t = $('tabelMatkul');
  if(data.matakuliah.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada mata kuliah. Tambahkan lewat formulir di atas.</td></tr></tbody>';
    return;
  }
  t.innerHTML = `
    <thead><tr><th>Kode</th><th>Nama</th><th>Dipakai jadwal</th><th></th></tr></thead>
    <tbody>${data.matakuliah.map(m => {
      const dipakai = data.jadwal.filter(j => j.kode === m.kode).length;
      return `<tr>
        <td><strong>${esc(m.kode)}</strong></td>
        <td>${esc(m.nama)}</td>
        <td class="op-samar">${dipakai} kelas</td>
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
  if(kembar) salah.push(`Kode ${kode} sudah dipakai untuk "${kembar.nama}".`);

  if(salah.length){ pesan(el, daftarKesalahan('Belum bisa disimpan:', salah), 'salah'); return; }

  try{
    status('Menyimpan…', 'sibuk');
    if(id){
      const lama = data.matakuliah.find(m => m.id === id);
      await updateDoc(doc(db, 'matakuliah', id), { kode, nama });
      await catat('ubah', 'matakuliah', `${kode} · ${nama}`,
        lama && (lama.kode !== kode || lama.nama !== nama)
          ? `Sebelumnya ${lama.kode} · ${lama.nama}` : '');
      // Kode adalah tali penghubung ke jadwal, jadi kalau kode berubah,
      // semua jadwal yang memakainya harus ikut diperbarui. Kalau tidak,
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
  const dipakai = data.jadwal.filter(j => j.kode === m.kode);
  if(dipakai.length){
    pesan($('pesanMatkul'),
      `"${esc(m.nama)}" masih dipakai ${dipakai.length} kelas di Jadwal Permanen. `
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

  t.querySelectorAll('[data-hapus-jd]').forEach(b => b.addEventListener('click', () => {
    hapusJadwal(b.dataset.hapusJd);
  }));
}

$('cariJadwal').addEventListener('input', gambarJadwal);

// Pemeriksaan inilah yang mencegah dua kelas memakai ruangan yang sama pada
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
          `Ruang ${ruang} sudah dipakai ${b.kode} KP ${b.kp} pada ${b.hari} `
          + `${rentangJam(b.mulai, b.selesai)}.`);
      }
    }else if(!samakanRuang(ruang)){
      hati.push('Ruang dikosongkan, jadi bentrok ruangan tidak bisa diperiksa.');
    }

    // Bukan kesalahan, tapi pantas ditanyakan: satu mata kuliah dengan dua KP
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
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi kalau memang benar:', hati), 'hati');
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
      lamaJd
        ? `Sebelumnya ${lamaJd.hari} ${rentangJam(lamaJd.mulai, lamaJd.selesai)} · ${lamaJd.ruang || 'tanpa ruang'}`
        : '');
    e.target.reset(); $('jdId').value = ''; modeUbah('formJadwal', false);
    bersihkanPesan(el);
    await muatSemua();
    await terbitkan();
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
  Daftar pilihan kelas memakai NAMA mata kuliah, bukan kodenya.

  Kode seperti 1303MW24 tidak dihafal siapa pun, jadi memilih kelas berarti
  mencocokkan kode satu per satu dengan daftar di tab Mata Kuliah. Nama mata
  kuliahnya yang dikenal, jadi itu yang ditaruh paling depan. Kodenya sengaja
  tidak dibuang sama sekali, hanya dipindah ke belakang sebagai penegas kalau
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

  // Kelas yang sedang dipilih dipertahankan kalau masih lolos saringan. Kalau
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
  Jenis "menyusul" memakai kotak isian yang sama dengan "pindah", bedanya
  seluruh kotak itu boleh dikosongkan. Dipakai untuk perpindahan yang sudah
  pasti terjadi tapi tanggal, jam, atau ruangnya belum ditentukan.
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
  saat menyimpan. Tapi menunggu sampai tombol Simpan ditekan berarti pengurus
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
    <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kelas</th><th>Keterangan</th><th></th></tr></thead>
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
        <td>${esc(tanggalPanjang(p.tanggal))}${lewat ? '<br><span class="op-samar">sudah lewat</span>' : ''}</td>
        <td><span class="op-lencana ${esc(p.tipe)}">${esc(label)}</span></td>
        <td>${esc(p.kode)} KP ${esc(p.kp)}${j ? '' : '<br><span class="op-samar">kelas sudah dihapus</span>'}</td>
        <td>${ket}</td>
        <td><div class="op-tombol-baris">
          <button class="op-mini" data-ubah-pb="${esc(p.id)}">Ubah</button>
          <button class="op-mini op-hapus" data-hapus-pb="${esc(p.id)}">Hapus</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;

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
      await catat('hapus', 'perubahan',
        `${namaMatkul(p.kode) || p.kode} KP ${p.kp} · ${tanggalPanjang(p.tanggal)}`,
        `Jenis ${p.tipe}`);
      await muatSemua();
      await terbitkan();
    }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
  }));
}

function periksaPerubahan(isi){
  const salah = [];
  const hati = [];
  const j = data.jadwal.find(x => x.id === isi.jadwalId);

  if(!j){ salah.push('Kelas belum dipilih.'); return { salah, hati }; }
  if(!isi.tanggal){ salah.push('Tanggal terdampak belum diisi.'); return { salah, hati }; }

  // Tanggal harus jatuh pada hari kelas itu berlangsung. Tanpa pemeriksaan ini
  // orang gampang salah pilih tanggal dan perubahannya tidak pernah muncul.
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
      misalnya jam mulai diisi tapi jam selesai tidak. Keadaan begitu bukan
      "belum ditentukan", melainkan kemungkinan besar lupa mengisi, dan kalau
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
        Ruang yang benar-benar dipakai kelas pengganti ini: yang diisi di kotak
        Ruang baru kalau ada, kalau kosong berarti tetap memakai ruang aslinya.

        Kalau yang diisi ternyata bukan ruang fisik, misalnya ONLINE, hasilnya
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
          salah.push(`Ruang ${isi.ruangBaru || j.ruang} sudah dipakai ${b.kode} KP ${b.kp} setiap ${b.hari} ${rentangJam(b.mulai, b.selesai)}.`);
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
        // memakai ruang aslinya luput dari pemeriksaan.
        const asal = data.jadwal.find(x => x.id === p.jadwalId);
        const ruangLain = samakanRuang(p.ruangBaru)
          ? ruangFisik(p.ruangBaru)
          : ruangFisik(asal && asal.ruang);

        if(ruang && ruangLain === ruang
           && beririsan(m1, m2, keMenit(p.mulaiBaru), keMenit(p.selesaiBaru))){
          salah.push(`Ruang itu sudah dipakai kelas pengganti ${p.kode} KP ${p.kp} pada tanggal yang sama.`);
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
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi kalau memang benar:', hati), 'hati');
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
    await catat(isi.id ? 'ubah' : 'tambah', 'perubahan',
      `${namaMatkul(muatan.kode) || muatan.kode} KP ${muatan.kp} · ${tanggalPanjang(muatan.tanggal)} · jenis ${muatan.tipe}`,
      lamaPb ? `Sebelumnya ${tanggalPanjang(lamaPb.tanggal)} · jenis ${lamaPb.tipe}` : (muatan.catatan || ''));
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

    // Ditulis sebagai satu transaksi. Kalau di tengah jalan gagal, tidak ada
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
      <button class="op-mini op-hapus" data-hapus-kelompok="${esc(nama)}">Hapus kelompok</button>
    </div>`).join('')}
  </div>`;

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
    pesan(el, daftarKesalahan('Periksa dulu, lalu tekan Simpan sekali lagi kalau memang benar:', hati), 'hati');
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
      lamaPg ? `Sebelumnya ${lamaPg.nama} · ${lamaPg.kode} KP ${lamaPg.kp}` : `NRP ${muatan.nrp || 'tidak ada'}`);
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

   Pengajuan akun yang dikirim sendiri lewat halaman /pengajar. Yang diputuskan
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

// Dokumen yang dibuat langsung lewat Firebase Console boleh tidak menyebut
// status. Bawaannya sama dengan yang dipakai firestore.rules dan halaman
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

    // Kalau namanya justru ketemu, kemungkinan besar NRP-nya salah ketik, dan
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
    Email student UBAYA memakai NRP-nya sendiri, jadi ketidakcocokan di sini
    bukan sekadar hal yang perlu dilirik.

    Salah satu dari keduanya pasti keliru, dan keduanya sama-sama menentukan:
    NRP dipakai mencocokkan dengan data pengajar, email dipakai masuk. Karena
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
// dengan yang dipakai halaman pengajar, supaya kodenya tidak pernah berbeda.
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
        + 'bahkan kalau halamannya sedang terbuka.'
      : (s === 'ditolak'
          ? 'Penolakannya ikut terhapus, sehingga orang ini bisa mendaftar lagi. '
            + 'Kalau maksud Anda menutup pintunya, biarkan barisnya dan pakai Tolak.'
          : 'Pengajuannya hilang dari antrean tanpa pernah diputuskan.');

    if(!confirm(
      `Hapus baris ${a.nama} (${a.nrp})?\n\n${akibat}\n\n`
      + 'Akun Firebase-nya tidak ikut terhapus. Orang ini masih bisa masuk dan '
      + 'mengirim pengajuan baru. Untuk menutup akunnya sama sekali, '
      + 'nonaktifkan lewat Firebase Console pada menu Authentication.')) return;
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
    Peringatan hasil pencocokan tidak memblokir, tapi menerima pengajuan yang
    datanya tidak cocok perlu dilakukan dengan sadar, bukan tersenggol. Karena
    itu penyimpanannya minta ditekan dua kali.
  */
  const { catatan } = periksaAkun(a);
  const berat = catatan.filter(c => c.jenis === 'salah');
  if(status_ === 'diterima' && berat.length && el.dataset.konfirmasi !== '1'){
    pesan(el, daftarKesalahan(
      'Data pendaftar ini tidak cocok dengan data pengajar. Periksa dulu, lalu tekan Simpan keputusan sekali lagi kalau memang benar:',
      berat.map(c => c.teks)), 'hati');
    el.dataset.konfirmasi = '1';
    return;
  }
  el.dataset.konfirmasi = '';

  /*
    Ditulis utuh, bukan digabung. Nama, NRP, dan email disalin apa adanya dari
    baris yang sudah tersimpan, dan aturan Firestore menolak kalau ketiganya
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
      lamaPm && lamaPm.judul !== muatan.judul ? `Sebelumnya "${lamaPm.judul}"` : '');
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
  ditaruh di sisi penulisan.
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
          Pada tanggal aslinya kelas ini tidak berlangsung, TAPI ada
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
          Perpindahan yang sudah pasti terjadi, tapi belum tentu kapan dan di
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

        // Kalau tanggal dan jamnya ternyata sudah ditentukan, kelas
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
      'Data tersimpan, TAPI gagal menerbitkan ke halaman publik: ' + err.message
      + '. Coba simpan ulang salah satu data supaya penerbitan diulang.', 'salah');
  }
}

/* ============================================================
   11. Excel: unduh, unggah, dan data pendampingnya
   ============================================================ */

/*
  Sumber kebenaran data adalah basis data, bukan berkas Excel.

  Pengurus tetap menerima berkas Informasi Kelas Asistensi tiap awal semester,
  jadi unggahan dipakai untuk mengisi sekali di depan. Sesudah itu perubahan
  cukup dilakukan di halaman ini, dan berkas Excel yang baru diambil lewat
  tombol unduh. Dengan begitu tidak ada dua salinan yang harus dijaga sama.

  Dua lembar Excel tidak punya tempat di koleksi yang sudah ada, yaitu kode
  Google Classroom dan daftar koordinator. Keduanya diberi koleksi sendiri,
  bukan ditempelkan sebagai kolom jadwal dan mata kuliah, karena kodenya
  sering tidak sama: lembar Contact Koor memakai kode kurikulum lain, dan
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
        : 'Belum ada kode kelas daring. Isi lewat formulir di atas atau unggah berkas Excel.'
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
      lamaGc && lamaGc.classroom !== muatan.classroom ? `Sebelumnya ${lamaGc.classroom || 'tanpa kode'}` : '');
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
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada koordinator. Isi lewat formulir di atas atau unggah berkas Excel.</td></tr></tbody>';
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
      lamaKo && lamaKo.koordinator !== muatan.koordinator
        ? `Sebelumnya ${lamaKo.koordinator || 'tanpa nama'}` : '');
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
    // Yang isinya sama persis tidak ditulis ulang ke basis data, tapi tetap
    // dihitung. Tanpa angka ini, pengurus tidak punya cara tahu bedanya
    // "berkasnya memang cuma mengubah tiga kelas" dengan "berkasnya salah
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
    mana-mana: yang paling bawah dipakai, dan kejadiannya diberitahukan.

    Alasannya, baris yang lebih bawah biasanya hasil pembetulan yang ditambah
    belakangan. Yang penting bukan tebakan itu benar atau tidak, melainkan
    pengurus tahu bahwa berkasnya memuat dua baris berbeda untuk hal yang sama.
  */
  const satukan = (daftar, ambilKunci, sebutan) => {
    const peta = new Map();
    for(const isi of daftar){
      const k = ambilKunci(isi);
      if(peta.has(k)){
        r.dilewati.push(`Baris ${isi.baris}: ${sebutan(isi)} muncul lebih dari sekali di berkas, yang terakhir dipakai.`);
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
    tapi harus disebutkan.

    Halaman publik menampilkan kode mentah kalau namanya tidak ketemu, dan itu
    tidak terbaca siapa pun. Formulir Jadwal Permanen sudah menolak keadaan
    seperti ini sejak awal, jadi unggahan tidak boleh diam-diam membuatnya.
  */
  const kodeDikenal = new Set([...data.matakuliah.map(m => m.kode), ...r.mkBaru.map(m => m.kode)]);
  const yatim = [...new Set([...r.jdBaru, ...r.jdUbah].map(j => j.kode).filter(k => !kodeDikenal.has(k)))];
  for(const kode of yatim){
    r.masalah.push(`Kode ${kode} dipakai di lembar jadwal tapi tidak punya nama mata kuliah di berkas mana pun. Kelasnya tetap masuk, tapi isi namanya lewat tab Mata Kuliah supaya tidak tampil sebagai kode di halaman jadwal.`);
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
  kalau halamannya dicetak hitam putih.
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
  Kalau keduanya boleh diubah di sini, baris ini akan menimpa dokumen yang salah
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
  const dipakai = daftar.filter(u => u.terima).length;
  return `
    <h4>${esc(JUDUL_BAGIAN[koleksi])}
      <span class="pra-jumlah">${dipakai} dari ${daftar.length} disimpan</span></h4>
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

  // Tombol simpan ikut mati kalau tidak ada satu pun baris yang dicentang,
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
    status('Berkas terbaca. Belum ada yang tersimpan. Periksa perbandingannya, atur tiap baris kalau perlu, lalu tekan Simpan perubahan.', 'benar');
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

  Satu berkas bisa berisi ratusan baris. Kalau ditulis satu per satu, prosesnya
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
        Kalau dibiarkan, perubahan itu menjadi yatim: halaman publik tidak bisa
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

  KENAPA PERLU. Pengurus berganti tiap kepengurusan dan jumlahnya banyak. Kalau
  ada jadwal yang tiba-tiba berbeda dari yang disepakati, satu-satunya cara
  menelusurinya dulu adalah bertanya satu per satu. Catatan ini menjawabnya
  sendiri: apa yang berubah, kapan, dan oleh siapa.

  TIDAK BISA DIHAPUS. Aturan Firestore hanya mengizinkan menambah. Mengubah dan
  menghapus ditutup untuk semua orang, termasuk pengurus yang menulisnya.
  Catatan yang bisa dirapikan sendiri oleh pelakunya bukan catatan.

  GAGALNYA TIDAK MENJATUHKAN AKSI UTAMA. Kalau penulisan catatan gagal,
  jadwalnya tetap tersimpan dan pengurus diberi tahu bahwa catatannya yang
  bermasalah. Kebalikannya akan lebih buruk: pekerjaan hilang gara-gara buku
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
  // Ditulis dari halaman /pengajar, bukan dari halaman ini. Catatannya tetap
  // masuk ke daftar yang sama supaya seluruh perubahan bisa ditelusuri di satu
  // tempat, tanpa perlu ingat halaman mana yang dipakai saat itu.
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
    // Kalau tab Log sedang dibuka, daftarnya ikut disegarkan supaya tidak
    // terlihat seolah aksinya tidak tercatat.
    if(logSudahDimuat && !$('panel-log').hidden) await muatLog(false);
  }catch(err){
    console.error('Gagal menulis catatan log', err);
    status('Perubahannya tersimpan, tapi catatan log gagal ditulis: ' + err.message, 'salah');
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
      ? 'Koleksi "log" belum diizinkan oleh aturan keamanan Firestore. Tempel ulang isi firestore.rules lewat Firebase Console, lihat langkah 1.4 di PANDUAN-PENGURUS.md.'
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
