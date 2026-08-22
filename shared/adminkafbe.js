/*
  Halaman /adminkafbe: pengaturan tampilan dan status KAFBE Hub.

  PENTING UNTUK YANG MERAWAT BERKAS INI:

  Berkas ini berjalan di peramban, jadi isinya bisa dibaca siapa pun. Semua
  penguncian di sini, termasuk kotak isian yang dimatikan saat situs sedang
  aktif, hanya untuk KENYAMANAN pemakai. Yang benar-benar menegakkan aturan
  adalah firestore.rules, yang berjalan di server Google:

    - hanya akun terdaftar di koleksi "adminutama" yang boleh menulis
      publik/situs, jadi pengurus operasional ditolak di sisi server;
    - naskah dan status fitur hanya boleh berubah kalau dokumennya sudah
      berstatus maintenance.

  Kalau ada yang melewati halaman ini lewat Console peramban, dua aturan itu
  tetap menolaknya.

  ------------------------------------------------------------------
  DARI MANA DAFTAR ISI SITUS DIAMBIL

  Tidak ada daftar naskah yang ditulis ulang di berkas ini. Halaman publiknya
  diambil apa adanya, lalu elemen ber-atribut data-teks dan data-fitur dibaca
  dari situ. Akibatnya naskah bawaan yang tampil di sini selalu sama dengan
  yang benar-benar ada di halaman, dan menambah kolom baru yang bisa diubah
  cukup dengan menambah atribut di HTML, tanpa menyentuh berkas ini.

  Menambah HALAMAN baru ke daftar ini tetap manual: tambahkan satu baris di
  DAFTAR_HALAMAN di bawah.
*/

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc,
} = await import(`${SDK}/firebase-firestore.js`);

const app  = initializeApp(window.KAFBE_FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   1. Daftar halaman publik
   ============================================================ */

const DAFTAR_HALAMAN = [
  { nama: 'Beranda',                        berkas: '/index.html' },
  { nama: 'Jadwal Kelas',                   berkas: '/jadwal.html' },
  { nama: 'Pengantar Mikroekonomi',         berkas: '/materi/pemi.html' },
  { nama: 'Sistem Informasi',               berkas: '/materi/si.html' },
  { nama: 'Statistika 2',                   berkas: '/materi/stat2.html' },
  { nama: 'Manajemen Keuangan & Investasi', berkas: '/materi/mki.html' },
  { nama: 'Flappy Owl',                     berkas: '/game-santai/flappy-owl.html' },
];

// Bagian yang bisa dicentang pada catatan versi. Halaman publik diambil dari
// daftar di atas, sisanya bagian yang tidak punya halaman publik sendiri.
const BAGIAN_TAMBAHAN = ['Operasional', 'Admin Situs', 'Aturan Firestore', 'Lainnya'];

const STATUS_FITUR = [
  { nilai: 'aktif',        label: 'Aktif' },
  { nilai: 'pengembangan', label: 'Dalam Pengembangan' },
  { nilai: 'maintenance',  label: 'Pemeliharaan' },
];

/* ============================================================
   2. Alat bantu umum
   ============================================================ */

const $ = id => document.getElementById(id);

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// Naskah di HTML ditulis dengan lekukan dan pindah baris demi keterbacaan
// berkasnya. Semua itu tidak berarti apa-apa bagi hasil akhir, jadi
// perbandingan "sudah berubah atau belum" dilakukan atas bentuk yang sudah
// dirapikan. Tanpa ini, setiap naskah akan selalu terlihat berbeda dari
// bawaannya hanya karena spasi.
function rapikan(s){
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function pesan(el, teks, jenis){
  el.className = 'op-pesan tampil ' + (jenis || '');
  el.innerHTML = teks;
}
function bersihkanPesan(el){
  el.className = 'op-pesan';
  el.innerHTML = '';
}

let waktuStatus = null;
function status(teks, jenis){
  const el = $('statusSimpan');
  el.hidden = false;
  el.className = 'op-status ' + (jenis || 'sibuk');
  el.textContent = teks;
  clearTimeout(waktuStatus);
  if(jenis === 'benar') waktuStatus = setTimeout(() => { el.hidden = true; }, 4000);
}

function diag(teks){
  const el = $('diagnosa');
  if(!el) return;
  $('diagnosaBungkus').hidden = false;
  const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
  el.textContent += `[${jam}] ${teks}\n`;
  console.log('[adminkafbe] ' + teks);
}

function hariIniISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tanggalPanjang(iso){
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                 'Agustus','September','Oktober','November','Desember'];
  const [y,m,d] = String(iso).split('-').map(Number);
  if(!y || !m || !d) return iso || '';
  return `${d} ${BULAN[m-1]} ${y}`;
}

/* ============================================================
   3. Masuk dan keluar
   ============================================================ */

function pesanAuth(kode){
  switch(kode){
    case 'auth/invalid-email':          return 'Format email tidak benar.';
    case 'auth/user-disabled':          return 'Akun ini dinonaktifkan. Hubungi pemegang akses Firebase Console.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return 'Email atau kata sandi salah.';
    case 'auth/too-many-requests':      return 'Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/network-request-failed': return 'Gagal menghubungi server. Periksa koneksi internet Anda.';
    case 'auth/configuration-not-found':return 'Metode masuk email dan kata sandi belum diaktifkan di Firebase Console.';
    default:                            return 'Tidak bisa masuk (' + kode + ').';
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

let akun = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){
    akun = null;
    $('layarMasuk').hidden = false;
    $('aplikasi').hidden = true;
    return;
  }

  diag('Sesi aktif sebagai ' + user.email);
  diag('UID akun ini: ' + user.uid);
  diag('Membaca dokumen adminutama/' + user.uid + ' …');

  // Wewenang halaman ini TIDAK diambil dari koleksi "admins". Pengurus
  // operasional yang membuka halaman ini akan berhenti di sini.
  let profil = null;
  let galat = null;
  try{
    const snap = await getDoc(doc(db, 'adminutama', user.uid));
    diag('Dokumen adminutama terbaca. Ada isinya? ' + (snap.exists() ? 'YA' : 'TIDAK'));
    if(snap.exists()) profil = snap.data();
  }catch(err){
    console.error('Gagal memeriksa status admin utama', err);
    diag('GAGAL membaca adminutama: ' + (err.code || err.message));
    galat = err;
  }

  if(!profil){
    if(galat){
      pesan($('pesanMasuk'),
        'Masuk berhasil, tapi status admin utama tidak bisa diperiksa.<br>'
        + `Pesan aslinya: <code>${esc(galat.message || galat.code || 'tidak diketahui')}</code><br><br>`
        + 'Biasanya ini berarti aturan keamanan Firestore belum diperbarui. '
        + 'Tempel ulang isi <code>firestore.rules</code> lewat Firebase Console.',
        'salah');
    }else{
      pesan($('pesanMasuk'),
        'Akun ini bukan admin utama, jadi tidak bisa membuka halaman ini.<br><br>'
        + 'Akun pengurus operasional memang sengaja tidak diberi akses ke sini. '
        + 'Kalau akun ini memang seharusnya bisa masuk, di Firestore buat koleksi '
        + '<code>adminutama</code> dengan dokumen yang <strong>Document ID-nya persis '
        + 'sama</strong> dengan baris di bawah ini:'
        + `<br><code class="op-uid">${esc(user.uid)}</code>`
        + 'Pakai ID itu, <strong>bukan</strong> tombol Auto-ID.',
        'salah');
    }
    try{ await signOut(auth); }
    catch(err){ console.warn('Gagal keluar setelah penolakan admin utama', err); }
    return;
  }

  akun = { uid: user.uid, email: user.email, nama: profil.nama || '' };
  diag('Terverifikasi sebagai admin utama. Membuka halaman…');
  $('siapa').textContent = (akun.nama ? akun.nama + ' · ' : '') + akun.email;
  $('layarMasuk').hidden = true;
  $('aplikasi').hidden = false;

  isiPilihanBagian();
  $('cvTanggal').value = hariIniISO();

  await muatSemua();
});

/* ============================================================
   4. Keadaan halaman
   ============================================================ */

/*
  bawaan  : apa yang tertulis di berkas HTML halaman publik.
  simpanan: apa yang tersimpan di Firestore, hanya berisi yang BERBEDA dari
            bawaan. Menyimpan selisihnya saja, bukan salinan lengkap, membuat
            perbaikan naskah langsung di HTML tetap sampai ke pengunjung
            selama kolom itu belum pernah ditimpa lewat halaman ini.
*/
const bawaan  = { fitur: new Map(), teks: new Map() };
let   simpanan = { statusSitus: 'aktif', pesanMaintenance: {}, fitur: {}, teks: {} };
let   susunan  = [];      // hasil pembacaan halaman publik
let   catatan  = [];      // isi koleksi catatanversi
let   dokumenAda = false;

function sedangDipelihara(){
  return simpanan.statusSitus === 'maintenance';
}

/* ============================================================
   5. Membaca susunan situs dari halaman publiknya
   ============================================================ */

function statusDariLencana(kartu){
  const b = kartu.querySelector('.badge');
  if(!b) return 'aktif';
  if(b.classList.contains('badge-maint')) return 'maintenance';
  if(b.classList.contains('badge-soon'))  return 'pengembangan';
  return 'aktif';
}

/*
  Satu kunci hanya boleh muncul sekali di panel ini.

  Di halaman publik kunci yang sama memang boleh dipakai berkali-kali, dan itu
  disengaja: kartu "Main Santai" muncul dua kali di beranda dan keduanya harus
  ikut satu status yang sama. Tapi kalau panel ini menggambar dua kotak isian
  untuk kunci yang sama, keduanya bisa diisi berbeda dan yang tersimpan cuma
  salah satunya tanpa ketahuan mana. Jadi kemunculan pertama yang dipakai.
*/
let sudahTampil = new Set();

async function bacaHalaman(h){
  const res = await fetch(h.berkas, { cache: 'no-cache' });
  if(!res.ok) throw new Error(`${h.berkas} tidak terbaca (HTTP ${res.status})`);
  const dok = new DOMParser().parseFromString(await res.text(), 'text/html');

  // Satu kueri untuk keduanya, supaya urutannya persis urutan di halaman:
  // kartu fitur lebih dulu, lalu judul dan keterangan miliknya.
  const elemen = dok.querySelectorAll('[data-fitur], [data-teks]');
  const bagian = [];

  const cariBagian = (nama) => {
    let g = bagian.find(x => x.nama === nama);
    if(!g){ g = { nama, butir: [] }; bagian.push(g); }
    return g;
  };

  elemen.forEach(el => {
    const induk = el.closest('[data-bagian]');
    const namaBagian = induk ? induk.dataset.bagian : 'Umum';

    if(el.dataset.fitur !== undefined){
      const kunci = el.dataset.fitur;
      const asal  = statusDariLencana(el);
      if(sudahTampil.has('fitur:' + kunci)) return;
      sudahTampil.add('fitur:' + kunci);
      bawaan.fitur.set(kunci, asal);
      cariBagian(namaBagian).butir.push({
        jenis: 'fitur',
        kunci,
        label: el.dataset.fiturLabel || kunci,
        asal,
      });
    }else{
      const kunci = el.dataset.teks;
      const asal  = { id: rapikan(el.innerHTML), en: rapikan(el.dataset.en || '') };
      if(sudahTampil.has('teks:' + kunci)) return;
      sudahTampil.add('teks:' + kunci);
      bawaan.teks.set(kunci, asal);
      cariBagian(namaBagian).butir.push({
        jenis: 'teks',
        kunci,
        label: el.dataset.label || kunci,
        asal,
      });
    }
  });

  return { nama: h.nama, berkas: h.berkas, bagian };
}

async function bacaSusunan(){
  bawaan.fitur.clear();
  bawaan.teks.clear();
  sudahTampil = new Set();

  const hasil = [];
  const gagal = [];

  for(const h of DAFTAR_HALAMAN){
    try{
      hasil.push(await bacaHalaman(h));
    }catch(err){
      console.error(err);
      gagal.push(h.berkas);
    }
  }

  susunan = hasil;
  return gagal;
}

/* ============================================================
   6. Memuat dari Firestore
   ============================================================ */

async function muatSemua(){
  status('Memuat…', 'sibuk');
  try{
    const snap = await getDoc(doc(db, 'publik', 'situs'));
    dokumenAda = snap.exists();
    if(dokumenAda){
      const d = snap.data();
      simpanan = {
        statusSitus: d.statusSitus === 'maintenance' ? 'maintenance' : 'aktif',
        pesanMaintenance: d.pesanMaintenance || {},
        fitur: d.fitur || {},
        teks:  d.teks  || {},
      };
    }

    const gagal = await bacaSusunan();

    try{
      const cs = await getDocs(collection(db, 'catatanversi'));
      catatan = [];
      cs.forEach(d => catatan.push({ id: d.id, ...d.data() }));
      catatan.sort((a,b) =>
        String(b.tanggal||'').localeCompare(String(a.tanggal||''))
        || String(b.versi||'').localeCompare(String(a.versi||''), undefined, { numeric:true }));
    }catch(err){
      console.error('Gagal memuat catatan versi', err);
      catatan = [];
    }

    gambarSemua();

    if(gagal.length){
      status('Sebagian halaman tidak terbaca: ' + gagal.join(', ')
        + '. Bagian lainnya tetap bisa diatur.', 'salah');
    }else{
      $('statusSimpan').hidden = true;
    }
  }catch(err){
    console.error(err);
    status('Gagal memuat: ' + err.message, 'salah');
  }
}

function gambarSemua(){
  gambarGembok();
  gambarCermin();
  gambarFormStatus();
  gambarCatatan();
}

/* ============================================================
   7. Palang pengunci
   ============================================================ */

function gambarGembok(){
  const el = $('gembok');
  const lampu = $('lampuStatus');

  if(sedangDipelihara()){
    el.className = 'ak-gembok ak-gembok-terbuka';
    el.innerHTML =
      '<div><strong>Situs sedang dalam pemeliharaan.</strong>'
      + 'Naskah dan status fitur bisa diubah sekarang. Pengunjung melihat layar pemberitahuan '
      + 'sampai situs dinyalakan kembali.</div>'
      + '<button type="button" class="btn btn-primary op-kecil" id="gembokNyalakan">Nyalakan situs</button>';
    lampu.className = 'ak-lampu ak-lampu-tutup';
    lampu.textContent = 'Pemeliharaan';
    $('gembokNyalakan').addEventListener('click', () => ubahStatus('aktif'));
  }else{
    el.className = 'ak-gembok ak-gembok-terkunci';
    el.innerHTML =
      '<div><strong>Situs sedang aktif, jadi isinya terkunci.</strong>'
      + 'Naskah dan status fitur hanya bisa diubah saat situs berstatus pemeliharaan, '
      + 'supaya pengunjung tidak menemui halaman yang berubah-ubah di tengah pengerjaan.</div>'
      + '<button type="button" class="btn btn-ghost op-kecil" id="gembokTutup">Masuk pemeliharaan</button>';
    lampu.className = 'ak-lampu ak-lampu-aktif';
    lampu.textContent = 'Aktif';
    $('gembokTutup').addEventListener('click', () => ubahStatus('maintenance'));
  }

  // Semua kotak isian yang menulis naskah ikut mengunci diri.
  const terkunci = !sedangDipelihara();
  document.querySelectorAll('#panel-tampilan textarea, #panel-tampilan select, '
    + '#panel-tampilan .ak-balik, #tombolSimpanTampilan, '
    + '#formPesanTutup input, #formPesanTutup textarea, #formPesanTutup button')
    .forEach(x => { x.disabled = terkunci; });
}

/* ============================================================
   8. Cerminan situs
   ============================================================ */

function nilaiTeks(kunci, bahasa){
  const simpan = simpanan.teks[kunci];
  if(simpan && typeof simpan[bahasa] === 'string') return simpan[bahasa];
  const asal = bawaan.teks.get(kunci);
  return asal ? asal[bahasa] : '';
}

function nilaiFitur(kunci){
  const simpan = simpanan.fitur[kunci];
  if(simpan && simpan.status) return simpan.status;
  return bawaan.fitur.get(kunci) || 'aktif';
}

function sudahDitimpa(butir){
  if(butir.jenis === 'fitur') return !!simpanan.fitur[butir.kunci];
  return !!simpanan.teks[butir.kunci];
}

function gambarButir(b){
  const ditimpa = sudahDitimpa(b)
    ? '<span class="ak-diubah">Diubah</span>' : '';
  const tombolBalik = sudahDitimpa(b)
    ? `<button type="button" class="ak-balik" data-balik="${esc(b.jenis)}:${esc(b.kunci)}">Kembalikan ke bawaan</button>`
    : '';

  const kepala =
    '<div class="ak-butir-kepala">'
    + `<span class="ak-butir-label">${esc(b.label)}</span>`
    + `<span class="ak-kunci">${esc(b.kunci)}</span>`
    + ditimpa + tombolBalik
    + '</div>';

  if(b.jenis === 'fitur'){
    const kini = nilaiFitur(b.kunci);
    const opsi = STATUS_FITUR.map(s =>
      `<option value="${s.nilai}"${s.nilai === kini ? ' selected' : ''}>${esc(s.label)}</option>`
    ).join('');
    return `<div class="ak-butir">${kepala}`
      + `<select class="ak-status-pilih" data-fitur="${esc(b.kunci)}">${opsi}</select>`
      + '</div>';
  }

  return `<div class="ak-butir">${kepala}`
    + '<div class="ak-dwibahasa">'
      + '<div class="ak-kotak"><label>Indonesia</label>'
      + `<textarea data-teks="${esc(b.kunci)}" data-bahasa="id">${esc(nilaiTeks(b.kunci,'id'))}</textarea></div>`
      + '<div class="ak-kotak"><label>Inggris</label>'
      + `<textarea data-teks="${esc(b.kunci)}" data-bahasa="en">${esc(nilaiTeks(b.kunci,'en'))}</textarea></div>`
    + '</div></div>';
}

function gambarCermin(){
  const wadah = $('cerminSitus');
  const cari = rapikan($('cariTampilan').value).toLowerCase();

  const cocok = (b) => {
    if(!cari) return true;
    const bahan = [b.label, b.kunci,
      nilaiTeks(b.kunci,'id'), nilaiTeks(b.kunci,'en')].join(' ').toLowerCase();
    return bahan.includes(cari);
  };

  const bagianHtml = (h) => h.bagian
    .map(g => {
      const butir = g.butir.filter(cocok);
      if(!butir.length) return '';
      return '<div class="ak-bagian">'
        + `<div class="ak-bagian-nama">${esc(g.nama)}</div>`
        + butir.map(gambarButir).join('')
        + '</div>';
    })
    .join('');

  const html = susunan.map(h => {
    const isi = bagianHtml(h);
    if(!isi) return '';
    const alamat = h.berkas.replace(/\.html$/, '');
    return '<article class="ak-halaman">'
      + '<div class="ak-halaman-kepala">'
        + `<h3>${esc(h.nama)}</h3>`
        + `<span class="ak-jalur">${esc(alamat)}</span>`
        + `<a class="op-tautan-luar" href="${esc(h.berkas)}" target="_blank" rel="noopener">Buka halaman</a>`
      + '</div>' + isi + '</article>';
  }).join('');

  wadah.innerHTML = html || '<p class="ak-kosong">'
    + (cari
        ? 'Tidak ada yang cocok dengan pencarian itu.'
        : 'Belum ada isi yang bisa diatur. Pastikan halaman publiknya memakai atribut '
          + '<code>data-teks</code> dan <code>data-fitur</code>.')
    + '</p>';

  wadah.querySelectorAll('[data-balik]').forEach(t => {
    t.addEventListener('click', () => {
      const [jenis, ...sisa] = t.dataset.balik.split(':');
      const kunci = sisa.join(':');
      if(jenis === 'fitur') delete simpanan.fitur[kunci];
      else delete simpanan.teks[kunci];
      gambarCermin();
      gambarGembok();
      pesan($('pesanTampilan'),
        'Dikembalikan ke naskah bawaan halaman. Tekan <strong>Simpan perubahan</strong> supaya berlaku di situs publik.',
        'benar');
    });
  });

  // Setelah menggambar ulang, penguncian dipasang lagi karena elemennya baru.
  const terkunci = !sedangDipelihara();
  wadah.querySelectorAll('textarea, select, .ak-balik')
    .forEach(x => { x.disabled = terkunci; });
}

$('cariTampilan').addEventListener('input', gambarCermin);
$('tombolMuatUlang').addEventListener('click', async () => {
  bersihkanPesan($('pesanTampilan'));
  await muatSemua();
});

/* ============================================================
   9. Menyimpan tampilan
   ============================================================ */

/*
  Yang disimpan hanya yang berbeda dari bawaannya. Kolom yang dikosongkan
  kembali atau diketik persis sama dengan naskah aslinya dianggap tidak
  ditimpa, sehingga dokumennya tetap ramping dan perbaikan naskah di HTML
  masih bisa mengalir ke pengunjung.
*/
function kumpulkanPerubahan(){
  const fitur = {};
  const teks  = {};

  document.querySelectorAll('#cerminSitus select[data-fitur]').forEach(sel => {
    const kunci = sel.dataset.fitur;
    if(sel.value !== (bawaan.fitur.get(kunci) || 'aktif')){
      fitur[kunci] = { status: sel.value };
    }
  });

  document.querySelectorAll('#cerminSitus textarea[data-teks]').forEach(ta => {
    const kunci = ta.dataset.teks;
    const asal = bawaan.teks.get(kunci) || { id:'', en:'' };
    const isi  = rapikan(ta.value);
    if(isi === '' || isi === asal[ta.dataset.bahasa]) return;
    if(!teks[kunci]) teks[kunci] = {};
    teks[kunci][ta.dataset.bahasa] = isi;
  });

  /*
    Pencarian menyembunyikan sebagian butir dari layar, dan butir yang tidak
    tergambar tidak punya kotak isian untuk dibaca di atas. Kalau tahap ini
    dilewat, menyimpan sambil menyaring akan menghapus diam-diam semua naskah
    yang kebetulan sedang tidak terlihat.
  */
  const terlihatFitur = new Set([...document.querySelectorAll('#cerminSitus select[data-fitur]')].map(x => x.dataset.fitur));
  const terlihatTeks  = new Set([...document.querySelectorAll('#cerminSitus textarea[data-teks]')].map(x => x.dataset.teks));

  for(const [kunci, nilai] of Object.entries(simpanan.fitur)){
    if(!terlihatFitur.has(kunci)) fitur[kunci] = nilai;
  }
  for(const [kunci, nilai] of Object.entries(simpanan.teks)){
    if(!terlihatTeks.has(kunci)) teks[kunci] = nilai;
  }

  return { fitur, teks };
}

async function tulisDokumen(isi){
  if(dokumenAda){
    await updateDoc(doc(db, 'publik', 'situs'), isi);
  }else{
    await setDoc(doc(db, 'publik', 'situs'), {
      statusSitus: 'maintenance',
      pesanMaintenance: {},
      fitur: {},
      teks: {},
      ...isi,
    });
    dokumenAda = true;
  }
}

function jelaskanGagal(err){
  if(err && err.code === 'permission-denied'){
    return 'Ditolak server. Dua sebab yang mungkin: situs belum berstatus pemeliharaan, '
      + 'atau akun ini belum terdaftar di koleksi <code>adminutama</code>. '
      + 'Ubah statusnya lebih dulu lewat tab <strong>Status Situs</strong>, lalu coba lagi.';
  }
  return 'Gagal menyimpan: ' + esc((err && err.message) || 'tidak diketahui');
}

$('tombolSimpanTampilan').addEventListener('click', async () => {
  const el = $('pesanTampilan');
  bersihkanPesan(el);

  if(!sedangDipelihara()){
    pesan(el, 'Situs masih aktif. Masuk ke pemeliharaan dulu lewat tab <strong>Status Situs</strong>.', 'salah');
    return;
  }

  const { fitur, teks } = kumpulkanPerubahan();

  try{
    status('Menyimpan…', 'sibuk');
    await tulisDokumen({
      fitur, teks,
      diperbaruiPada: new Date().toISOString(),
      diperbaruiOleh: akun ? akun.email : '',
    });
    simpanan.fitur = fitur;
    simpanan.teks  = teks;
    gambarCermin();
    gambarGembok();

    const jumlah = Object.keys(fitur).length + Object.keys(teks).length;
    status('Tersimpan.', 'benar');
    pesan(el, jumlah === 0
      ? 'Tersimpan. Sekarang tidak ada satu pun yang menimpa naskah bawaan halaman.'
      : `Tersimpan. ${jumlah} bagian sedang menimpa naskah bawaan halaman.`, 'benar');
  }catch(err){
    console.error(err);
    pesan(el, jelaskanGagal(err), 'salah');
    status('Gagal menyimpan.', 'salah');
  }
});

/* ============================================================
   10. Status situs
   ============================================================ */

function gambarFormStatus(){
  const radio = document.querySelector(`input[name="statusSitus"][value="${simpanan.statusSitus}"]`);
  if(radio) radio.checked = true;

  const p = simpanan.pesanMaintenance || {};
  $('mtJudul').value   = p.judul   || '';
  $('mtJudulEn').value = p.judulEn || '';
  $('mtIsi').value     = p.isi     || '';
  $('mtIsiEn').value   = p.isiEn   || '';
}

async function ubahStatus(baru){
  const el = $('pesanStatus');
  bersihkanPesan(el);

  if(baru === simpanan.statusSitus){
    pesan(el, 'Situs memang sudah berstatus itu.', '');
    return;
  }
  if(baru === 'maintenance'
     && !confirm('Tutup situs untuk pemeliharaan? Semua pengunjung akan melihat layar pemberitahuan sampai dinyalakan kembali.')){
    return;
  }

  try{
    status('Mengubah status…', 'sibuk');
    await tulisDokumen({
      statusSitus: baru,
      diperbaruiPada: new Date().toISOString(),
      diperbaruiOleh: akun ? akun.email : '',
    });
    simpanan.statusSitus = baru;
    gambarGembok();
    gambarCermin();
    gambarFormStatus();
    status(baru === 'maintenance'
      ? 'Situs ditutup untuk pemeliharaan.'
      : 'Situs kembali aktif.', 'benar');
    pesan(el, baru === 'maintenance'
      ? 'Pengunjung sekarang melihat layar pemeliharaan. Naskah dan status fitur sudah bisa diubah.'
      : 'Situs sudah bisa dibuka pengunjung. Naskah dan status fitur terkunci lagi.', 'benar');
  }catch(err){
    console.error(err);
    pesan(el, jelaskanGagal(err), 'salah');
    status('Gagal mengubah status.', 'salah');
  }
}

$('formStatus').addEventListener('submit', (e) => {
  e.preventDefault();
  const dipilih = document.querySelector('input[name="statusSitus"]:checked');
  if(dipilih) ubahStatus(dipilih.value);
});

$('formPesanTutup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanTutup');
  bersihkanPesan(el);

  if(!sedangDipelihara()){
    pesan(el, 'Naskah ini hanya bisa disimpan saat situs berstatus pemeliharaan.', 'salah');
    return;
  }

  const isi = {
    judul:   $('mtJudul').value.trim(),
    judulEn: $('mtJudulEn').value.trim(),
    isi:     $('mtIsi').value.trim(),
    isiEn:   $('mtIsiEn').value.trim(),
  };

  try{
    status('Menyimpan…', 'sibuk');
    await tulisDokumen({
      pesanMaintenance: isi,
      diperbaruiPada: new Date().toISOString(),
      diperbaruiOleh: akun ? akun.email : '',
    });
    simpanan.pesanMaintenance = isi;
    status('Tersimpan.', 'benar');
    pesan(el, 'Naskah layar pemeliharaan tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    pesan(el, jelaskanGagal(err), 'salah');
    status('Gagal menyimpan.', 'salah');
  }
});

/* ============================================================
   11. Catatan versi
   ============================================================ */

function daftarBagian(){
  return DAFTAR_HALAMAN.map(h => h.nama).concat(BAGIAN_TAMBAHAN);
}

function isiPilihanBagian(){
  $('cvHalaman').innerHTML = daftarBagian().map((nama, i) =>
    `<label><input type="checkbox" value="${esc(nama)}" id="cvH${i}" /> ${esc(nama)}</label>`
  ).join('');
}

function bagianTerpilih(){
  return [...document.querySelectorAll('#cvHalaman input:checked')].map(x => x.value);
}

function modeUbahCatatan(aktif){
  $('cvBatal').hidden = !aktif;
  $('formCatatan').querySelector('button[type="submit"]').textContent =
    aktif ? 'Simpan perubahan' : 'Simpan catatan';
}

function kosongkanFormCatatan(){
  $('formCatatan').reset();
  $('cvId').value = '';
  $('cvTanggal').value = hariIniISO();
  document.querySelectorAll('#cvHalaman input').forEach(x => { x.checked = false; });
  modeUbahCatatan(false);
  bersihkanPesan($('pesanCatatan'));
}

$('cvBatal').addEventListener('click', kosongkanFormCatatan);

$('formCatatan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const el = $('pesanCatatan');
  bersihkanPesan(el);

  const isi = {
    versi:     $('cvVersi').value.trim(),
    tanggal:   $('cvTanggal').value,
    ringkasan: $('cvRingkasan').value.trim(),
    halaman:   bagianTerpilih(),
  };

  const salah = [];
  if(!isi.versi)     salah.push('Nomor versi belum diisi.');
  if(!isi.tanggal)   salah.push('Tanggal belum diisi.');
  if(!isi.ringkasan) salah.push('Isi perubahan belum ditulis.');
  if(!isi.halaman.length) salah.push('Pilih setidaknya satu halaman atau tab yang diperbarui.');

  // Nomor versi yang sama dipakai dua kali membuat riwayatnya tidak bisa
  // dipercaya, jadi ditolak sejak awal.
  const kembar = catatan.find(c => c.versi === isi.versi && c.id !== $('cvId').value);
  if(kembar) salah.push(`Versi ${isi.versi} sudah tercatat pada ${tanggalPanjang(kembar.tanggal)}.`);

  if(salah.length){
    pesan(el, `Belum bisa disimpan:<ul>${salah.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`, 'salah');
    return;
  }

  try{
    status('Menyimpan catatan…', 'sibuk');
    if($('cvId').value){
      await updateDoc(doc(db, 'catatanversi', $('cvId').value), isi);
    }else{
      await addDoc(collection(db, 'catatanversi'), {
        ...isi,
        oleh: akun ? akun.email : '',
        dibuatPada: new Date().toISOString(),
      });
    }
    kosongkanFormCatatan();
    await muatSemua();
    status('Catatan tersimpan.', 'benar');
  }catch(err){
    console.error(err);
    pesan(el, jelaskanGagal(err), 'salah');
    status('Gagal menyimpan catatan.', 'salah');
  }
});

function gambarCatatan(){
  const wadah = $('daftarCatatan');
  if(!catatan.length){
    wadah.innerHTML = '<p class="ak-kosong">Belum ada catatan versi.</p>';
    return;
  }

  wadah.innerHTML = catatan.map(c => {
    const baris = String(c.ringkasan || '')
      .split('\n').map(x => x.trim()).filter(Boolean);
    const tanda = (c.halaman || [])
      .map(h => `<span>${esc(h)}</span>`).join('');

    return '<article class="ak-versi">'
      + '<div class="ak-versi-kepala">'
        + `<span class="ak-versi-nomor">Versi ${esc(c.versi)}</span>`
        + `<span class="ak-versi-tanggal">${esc(tanggalPanjang(c.tanggal))}</span>`
        + '<span class="op-tombol-baris">'
          + `<button type="button" class="btn btn-ghost op-mini" data-ubah="${esc(c.id)}">Ubah</button>`
          + `<button type="button" class="btn btn-ghost op-mini" data-hapus="${esc(c.id)}">Hapus</button>`
        + '</span>'
      + '</div>'
      + `<ul>${baris.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      + (tanda ? `<div class="ak-tanda">${tanda}</div>` : '')
      + (c.oleh ? `<p class="ak-versi-oleh">Ditulis oleh ${esc(c.oleh)}</p>` : '')
      + '</article>';
  }).join('');

  wadah.querySelectorAll('[data-ubah]').forEach(t => {
    t.addEventListener('click', () => {
      const c = catatan.find(x => x.id === t.dataset.ubah);
      if(!c) return;
      $('cvId').value        = c.id;
      $('cvVersi').value     = c.versi || '';
      $('cvTanggal').value   = c.tanggal || '';
      $('cvRingkasan').value = c.ringkasan || '';
      document.querySelectorAll('#cvHalaman input').forEach(x => {
        x.checked = (c.halaman || []).includes(x.value);
      });
      modeUbahCatatan(true);
      $('formCatatan').scrollIntoView({ behavior:'smooth', block:'center' });
    });
  });

  wadah.querySelectorAll('[data-hapus]').forEach(t => {
    t.addEventListener('click', async () => {
      const c = catatan.find(x => x.id === t.dataset.hapus);
      if(!c) return;
      if(!confirm(`Hapus catatan versi ${c.versi}?`)) return;
      try{
        status('Menghapus…', 'sibuk');
        await deleteDoc(doc(db, 'catatanversi', c.id));
        await muatSemua();
        status('Catatan dihapus.', 'benar');
      }catch(err){
        console.error(err);
        pesan($('pesanCatatan'), jelaskanGagal(err), 'salah');
        status('Gagal menghapus.', 'salah');
      }
    });
  });
}

/* ============================================================
   12. Tab
   ============================================================ */

document.querySelectorAll('.op-tab-btn').forEach(tombol => {
  tombol.addEventListener('click', () => {
    document.querySelectorAll('.op-tab-btn').forEach(b => b.classList.remove('active'));
    tombol.classList.add('active');
    document.querySelectorAll('.op-panel').forEach(p => { p.hidden = true; });
    $('panel-' + tombol.dataset.tab).hidden = false;
  });
});
