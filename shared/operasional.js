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

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
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
  $('siapa').textContent = (profil.nama ? profil.nama + ' · ' : '') + user.email;
  $('layarMasuk').hidden = true;
  $('aplikasi').hidden = false;
  await muatSemua();
});

/* ============================================================
   3. Memuat data
   ============================================================ */

const data = {
  matakuliah: [],
  jadwal: [],
  perubahan: [],
  pengumuman: [],
  pengajar: [],
  pengaturan: { mulaiDefault: '', perMatkul: {} },
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
    const [mk, jd, pb, pm, pg] = await Promise.all([
      ambilKoleksi('matakuliah'),
      ambilKoleksi('jadwal'),
      ambilKoleksi('perubahan'),
      ambilKoleksi('pengumuman'),
      ambilKoleksi('pengajar'),
    ]);
    data.matakuliah = mk.sort((a,b) => (a.nama||'').localeCompare(b.nama||''));
    data.jadwal = jd;
    data.perubahan = pb.sort((a,b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    data.pengumuman = pm;
    data.pengajar = pg;

    try{
      const st = await getDoc(doc(db, 'pengaturan', 'umum'));
      data.pengaturan = st.exists()
        ? { mulaiDefault: st.data().mulaiDefault || '', perMatkul: st.data().perMatkul || {} }
        : { mulaiDefault: '', perMatkul: {} };
      gagalMuat.delete('pengaturan');
    }catch(err){
      console.error('Gagal memuat pengaturan', err);
      gagalMuat.set('pengaturan', err.message || 'tidak diketahui');
    }

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
  gambarMatkul();
  gambarJadwal();
  gambarPerubahan();
  gambarKelompok();
  gambarPengajar();
  gambarPengumuman();
  gambarPengaturan();
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
  $('stKode').innerHTML = '<option value="">— pilih —</option>' + opsi;
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

    if(samakanRuang(ruang)){
      const bentrok = data.jadwal.filter(j =>
        j.id !== id
        && j.hari === hari
        && samakanRuang(j.ruang) === samakanRuang(ruang)
        && beririsan(m1, m2, keMenit(j.mulai), keMenit(j.selesai)));
      for(const b of bentrok){
        salah.push(
          `Ruang ${ruang} sudah dipakai ${b.kode} KP ${b.kp} pada ${b.hari} `
          + `${rentangJam(b.mulai, b.selesai)}.`);
      }
    }else{
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
    if(isi.id) await updateDoc(doc(db, 'jadwal', isi.id), muatan);
    else await addDoc(collection(db, 'jadwal'), muatan);
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
    await muatSemua();
    await terbitkan();
  }catch(err){ status('Gagal menghapus: ' + err.message, 'salah'); }
}

/* ============================================================
   7. Perubahan sementara
   ============================================================ */

function isiPilihanKelas(){
  const opsi = [...data.jadwal].sort(urutJadwal).map(j =>
    `<option value="${esc(j.id)}">${esc(j.kode)} KP ${esc(j.kp)} · ${esc(j.hari)} ${esc(rentangJam(j.mulai, j.selesai))} · ${esc(j.ruang || 'tanpa ruang')}</option>`
  ).join('');
  const el = $('pbKelas');
  const terpilih = el.value;
  el.innerHTML = '<option value="">— pilih —</option>' + opsi;
  if(terpilih) el.value = terpilih;
}

// Jenis "daring" dan "libur" tidak butuh ruang maupun tanggal pengganti,
// jadi kolomnya disembunyikan supaya tidak membingungkan.
function aturTampilanPerubahan(){
  const tipe = $('pbTipe').value;
  $('barisPindah').hidden = tipe !== 'pindah';
  $('barisRuang').hidden = !(tipe === 'pindah' || tipe === 'ruang');
}
$('pbTipe').addEventListener('change', aturTampilanPerubahan);
aturTampilanPerubahan();

function gambarPerubahan(){
  const t = $('tabelPerubahan');
  if(data.perubahan.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada perubahan sementara.</td></tr></tbody>';
    return;
  }
  const hariIni = new Date().toISOString().slice(0,10);
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
      }else if(p.tipe === 'daring'){
        ket = 'Kelas berlangsung daring'
            + (p.catatan ? `<br><span class="op-samar">${esc(p.catatan)}</span>` : '');
      }
      if(p.kelompok){
        ket += `<br><span class="op-samar">dari pembuatan massal: ${esc(p.kelompok)}</span>`;
      }
      const label = { libur:'Ditiadakan', daring:'Online', pindah:'Dipindah', ruang:'Ganti ruang' }[p.tipe] || p.tipe;
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

  if(isi.tipe === 'pindah'){
    if(!isi.tanggalBaru) salah.push('Tanggal pengganti belum diisi.');
    const m1 = keMenit(isi.mulaiBaru), m2 = keMenit(isi.selesaiBaru);
    if(m1 === null || m2 === null) salah.push('Jam pengganti belum lengkap.');
    else if(m2 <= m1) salah.push('Jam selesai pengganti harus lebih akhir daripada jam mulai.');

    if(isi.tanggalBaru && isi.tanggalBaru === isi.tanggal){
      salah.push('Tanggal pengganti sama dengan tanggal aslinya.');
    }

    if(isi.tanggalBaru && m1 !== null && m2 !== null){
      const hariBaru = hariDariTanggal(isi.tanggalBaru);
      const ruang = samakanRuang(isi.ruangBaru) || samakanRuang(j.ruang);

      // Kelas pengganti tidak boleh menabrak kelas rutin di ruangan yang sama.
      if(ruang){
        const bentrok = data.jadwal.filter(x =>
          x.hari === hariBaru
          && samakanRuang(x.ruang) === ruang
          && beririsan(m1, m2, keMenit(x.mulai), keMenit(x.selesai)));
        for(const b of bentrok){
          salah.push(`Ruang ${isi.ruangBaru || j.ruang} sudah dipakai ${b.kode} KP ${b.kp} setiap ${b.hari} ${rentangJam(b.mulai, b.selesai)}.`);
        }
      }

      // Dan tidak boleh menabrak kelas pengganti lain di tanggal yang sama.
      const gantiLain = data.perubahan.filter(p =>
        p.id !== isi.id && p.tipe === 'pindah' && p.tanggalBaru === isi.tanggalBaru);
      for(const p of gantiLain){
        const sama = ruang && samakanRuang(p.ruangBaru) === ruang;
        if(sama && beririsan(m1, m2, keMenit(p.mulaiBaru), keMenit(p.selesaiBaru))){
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
    tanggalBaru: isi.tipe === 'pindah' ? isi.tanggalBaru : '',
    mulaiBaru: isi.tipe === 'pindah' ? isi.mulaiBaru : '',
    selesaiBaru: isi.tipe === 'pindah' ? isi.selesaiBaru : '',
    ruangBaru: (isi.tipe === 'pindah' || isi.tipe === 'ruang') ? isi.ruangBaru : '',
  };

  try{
    status('Menyimpan…', 'sibuk');
    if(isi.id) await updateDoc(doc(db, 'perubahan', isi.id), muatan);
    else await addDoc(collection(db, 'perubahan'), muatan);
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

function mulaiUntukKode(kode){
  return data.pengaturan.perMatkul[kode] || data.pengaturan.mulaiDefault || null;
}

let massalKandidat = [];   // { jadwalId, tanggalList[], belumMulai }

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

  massalKandidat = [...peta.entries()].map(([jadwalId, tgls]) => {
    const j = data.jadwal.find(x => x.id === jadwalId);
    const mulai = mulaiUntukKode(j.kode);
    // Kelas yang perkuliahannya belum dimulai pada seluruh rentang tidak perlu
    // diubah, jadi tidak dicentang secara bawaan.
    const belumMulai = mulai && tgls.every(t => t < mulai);
    return { jadwalId, tanggalList: tgls, belumMulai };
  }).sort((a, b) => {
    const ja = data.jadwal.find(x => x.id === a.jadwalId);
    const jb = data.jadwal.find(x => x.id === b.jadwalId);
    return urutJadwal(ja, jb);
  });

  const baris = massalKandidat.map(k => {
    const j = data.jadwal.find(x => x.id === k.jadwalId);
    return `<label class="op-centang-baris${k.belumMulai ? ' op-redup' : ''}">
      <input type="checkbox" data-massal="${esc(k.jadwalId)}"${k.belumMulai ? '' : ' checked'} />
      <span>
        <strong>${esc(namaMatkul(j.kode) || j.kode)}</strong> KP ${esc(j.kp)}
        <span class="op-samar">· ${esc(j.hari)} ${esc(rentangJam(j.mulai, j.selesai))} · ${esc(j.ruang || 'tanpa ruang')}
        · ${k.tanggalList.length} tanggal${k.belumMulai ? ' · belum dimulai' : ''}</span>
      </span>
    </label>`;
  }).join('');

  const jumlahTercentang = massalKandidat.filter(k => !k.belumMulai).length;
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
    if(isi.id) await updateDoc(doc(db, 'pengajar', isi.id), muatan);
    else await addDoc(collection(db, 'pengajar'), muatan);
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
   8. Pengumuman
   ============================================================ */

function gambarPengumuman(){
  const t = $('tabelPengumuman');
  if(data.pengumuman.length === 0){
    t.innerHTML = '<tbody><tr><td class="op-kosong">Belum ada pengumuman.</td></tr></tbody>';
    return;
  }
  const hariIni = new Date().toISOString().slice(0,10);
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
    if(isi.id) await updateDoc(doc(db, 'pengumuman', isi.id), muatan);
    else await addDoc(collection(db, 'pengumuman'), muatan);
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
   9. Pengaturan
   ============================================================ */

function gambarPengaturan(){
  $('stMulai').value = data.pengaturan.mulaiDefault || '';
  const daftar = Object.entries(data.pengaturan.perMatkul || {});
  const el = $('daftarPengecualian');
  if(daftar.length === 0){
    el.innerHTML = '<p class="op-samar" style="margin:0 0 12px;">Belum ada pengecualian.</p>';
    return;
  }
  el.innerHTML = `<div class="op-tabel-bungkus" style="margin-bottom:14px;"><table class="op-tabel">
    <thead><tr><th>Mata Kuliah</th><th>Mulai</th><th></th></tr></thead>
    <tbody>${daftar.map(([kode, tgl]) => `<tr>
      <td>${esc(kode)}<br><span class="op-samar">${esc(namaMatkul(kode) || 'tidak ada di daftar')}</span></td>
      <td>${esc(tanggalPanjang(tgl))}</td>
      <td><button class="op-mini op-hapus" data-buang-kec="${esc(kode)}">Hapus</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  el.querySelectorAll('[data-buang-kec]').forEach(b => b.addEventListener('click', () => {
    delete data.pengaturan.perMatkul[b.dataset.buangKec];
    gambarPengaturan();
    pesan($('pesanPengaturan'), 'Pengecualian dihapus dari daftar. Tekan "Simpan pengaturan" supaya benar-benar tersimpan.', 'hati');
  }));
}

$('tambahPengecualian').addEventListener('click', () => {
  const kode = $('stKode').value, tgl = $('stTanggal').value;
  const el = $('pesanPengaturan');
  if(!kode || !tgl){ pesan(el, 'Pilih mata kuliah dan tanggalnya dulu.', 'salah'); return; }
  data.pengaturan.perMatkul[kode] = tgl;
  $('stKode').value = ''; $('stTanggal').value = '';
  gambarPengaturan();
  pesan(el, 'Ditambahkan ke daftar. Tekan "Simpan pengaturan" supaya benar-benar tersimpan.', 'hati');
});

$('formPengaturan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanPengaturan');
  data.pengaturan.mulaiDefault = $('stMulai').value;
  try{
    status('Menyimpan…', 'sibuk');
    await setDoc(doc(db, 'pengaturan', 'umum'), {
      mulaiDefault: data.pengaturan.mulaiDefault,
      perMatkul: data.pengaturan.perMatkul,
    });
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
        changes.push({
          tanggal: p.tanggal, tipe: 'libur', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(j.mulai, j.selesai), ruang: j.ruang || '',
          catatan: `Diganti ke ${tanggalPanjang(p.tanggalBaru)} pukul ${rentangJam(p.mulaiBaru, p.selesaiBaru)}`
            + ` di ${p.ruangBaru || j.ruang || '(ruang belum ditentukan)'}`,
        });
        changes.push({
          tanggal: p.tanggalBaru, tipe: 'pengganti', kode: j.kode, kp: j.kp, nama,
          jam: rentangJam(p.mulaiBaru, p.selesaiBaru), ruang: p.ruangBaru || j.ruang || '',
          catatan: p.catatan || `Kelas pengganti dari ${tanggalPanjang(p.tanggal)}`,
        });
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

    const hariIni = new Date().toISOString().slice(0,10);
    const pengumuman = data.pengumuman
      .filter(p => (!p.mulai || p.mulai <= hariIni) && (!p.selesai || p.selesai >= hariIni))
      .sort((a,b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.mulai||'').localeCompare(String(a.mulai||'')))
      .map(p => ({ judul: p.judul, isi: p.isi || '', pin: !!p.pin, mulai: p.mulai || '', selesai: p.selesai || '' }));

    await setDoc(doc(db, 'publik', 'terkini'), {
      updatedAt: new Date().toISOString(),
      mulai: {
        default: data.pengaturan.mulaiDefault || null,
        perMatkul: data.pengaturan.perMatkul || {},
      },
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
   11. Impor sekali dari data lama
   ============================================================ */

$('tombolImpor').addEventListener('click', async () => {
  const el = $('pesanImpor');
  bersihkanPesan(el);

  // Penjaga: menolak jalan kalau sudah ada isinya, supaya tidak menimpa
  // pekerjaan yang sudah dimasukkan lewat halaman ini.
  if(data.matakuliah.length || data.jadwal.length){
    pesan(el, 'Impor dibatalkan karena basis data sudah berisi. Tombol ini hanya untuk pemakaian pertama kali.', 'salah');
    return;
  }
  if(!confirm('Impor daftar mata kuliah dan jadwal permanen dari data lama?')) return;

  try{
    status('Mengimpor…', 'sibuk');
    const res = await fetch('data/jadwal.json', { cache: 'no-cache' });
    if(!res.ok) throw new Error('berkas data lama tidak terbaca (HTTP ' + res.status + ')');
    const lama = await res.json();

    const matkul = new Map();
    let jumlahJadwal = 0;

    for(const hari of (lama.days || [])){
      for(const k of (hari.classes || [])){
        if(k.kode && !matkul.has(k.kode)) matkul.set(k.kode, k.nama || k.kode);
      }
    }
    for(const [kode, nama] of matkul){
      await addDoc(collection(db, 'matakuliah'), { kode, nama });
    }

    for(const hari of (lama.days || [])){
      for(const k of (hari.classes || [])){
        const m = String(k.jam || '').match(/(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/);
        if(!m) continue;
        await addDoc(collection(db, 'jadwal'), {
          kode: k.kode,
          kp: String(k.kp || '').toUpperCase(),
          hari: hari.day,
          mulai: `${m[1].padStart(2,'0')}:${m[2]}`,
          selesai: `${m[3].padStart(2,'0')}:${m[4]}`,
          ruang: k.ruang || '',
        });
        jumlahJadwal++;
      }
    }

    if(lama.mulai){
      await setDoc(doc(db, 'pengaturan', 'umum'), {
        mulaiDefault: lama.mulai.default || '',
        perMatkul: lama.mulai.perMatkul || {},
      });
    }

    await muatSemua();
    await terbitkan();
    pesan(el,
      `Selesai. ${matkul.size} mata kuliah dan ${jumlahJadwal} kelas berhasil diimpor. `
      + 'Perubahan sementara tidak ikut diimpor karena bentuk datanya berbeda, '
      + 'silakan masukkan ulang lewat tab Perubahan Sementara bila masih berlaku.',
      'benar');
  }catch(err){
    console.error(err);
    pesan(el, 'Impor gagal: ' + esc(err.message), 'salah');
    status('Impor gagal.', 'salah');
  }
});
