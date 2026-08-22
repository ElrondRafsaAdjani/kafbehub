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
const bawaan  = { fitur: new Map(), teks: new Map(), urutan: new Map() };
let   simpanan = { statusSitus: 'aktif', pesanMaintenance: {}, fitur: {}, teks: {}, urutan: {} };
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
  Nama yang dibaca manusia untuk tiap kunci, diambil dari data-fitur-label dan
  data-label di HTML. Kemunculan PERTAMA yang dipakai.

  Di halaman publik satu kunci memang boleh dipakai berkali-kali, dan itu
  disengaja: kartu "Main Santai" muncul dua kali di beranda dan keduanya harus
  ikut satu status yang sama.
*/
const labelFitur = new Map();
const labelTeks  = new Map();

/*
  Markup asli tiap bagian disimpan apa adanya, lalu digambar ulang di panel ini
  memakai styles.css yang sama dengan halaman publik.

  Sebelumnya panel ini hanya menampilkan daftar kotak isian bertuliskan nama
  kunci. Itu benar isinya, tapi tidak menjawab pertanyaan yang sebenarnya
  dipakai saat mengelola situs, yaitu "kalau saya ubah ini, halamannya jadi
  seperti apa". Sekarang yang tampil kartu yang sama persis dengan yang dilihat
  mahasiswa, dan yang diubah ditunjuk langsung di gambarnya.
*/
async function bacaHalaman(h){
  const res = await fetch(h.berkas, { cache: 'no-cache' });
  if(!res.ok) throw new Error(`${h.berkas} tidak terbaca (HTTP ${res.status})`);
  const dok = new DOMParser().parseFromString(await res.text(), 'text/html');

  const bagian = [];

  dok.querySelectorAll('[data-bagian]').forEach(sec => {
    // Naskah dan status bawaannya dicatat dari markup ini, jadi apa yang
    // ditawarkan panel sebagai "bawaan" tidak mungkin berbeda dari halaman.
    sec.querySelectorAll('[data-fitur]').forEach(el => {
      const kunci = el.dataset.fitur;
      if(!bawaan.fitur.has(kunci)) bawaan.fitur.set(kunci, statusDariLencana(el));
      if(!labelFitur.has(kunci)) labelFitur.set(kunci, el.dataset.fiturLabel || kunci);
    });

    sec.querySelectorAll('[data-teks]').forEach(el => {
      const kunci = el.dataset.teks;
      if(bawaan.teks.has(kunci)) return;
      bawaan.teks.set(kunci, {
        id: rapikan(el.innerHTML),
        en: rapikan(el.dataset.en || ''),
      });
      labelTeks.set(kunci, el.dataset.label || kunci);
    });

    // Urutan bawaan tiap kisi kartu, dipakai tombol "kembalikan urutan".
    sec.querySelectorAll('[data-urutan]').forEach(kisi => {
      bawaan.urutan.set(kisi.dataset.urutan,
        [...kisi.querySelectorAll('[data-fitur]')].map(x => x.dataset.fitur));
    });

    bagian.push({ nama: sec.dataset.bagian, html: sec.outerHTML });
  });

  return { nama: h.nama, berkas: h.berkas, bagian };
}

async function bacaSusunan(){
  bawaan.fitur.clear();
  bawaan.teks.clear();
  bawaan.urutan.clear();
  labelFitur.clear();
  labelTeks.clear();

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
        fitur:  d.fitur  || {},
        teks:   d.teks   || {},
        urutan: d.urutan || {},
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

  // Semua yang menulis naskah ikut mengunci diri.
  const terkunci = !sedangDipelihara();
  document.querySelectorAll('#tombolSimpanTampilan, #tombolUrutanBawaan, '
    + '#formPesanTutup input, #formPesanTutup textarea, #formPesanTutup button')
    .forEach(x => { x.disabled = terkunci; });

  kunciCermin();
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

function nilaiUrutan(kunci){
  const simpan = simpanan.urutan[kunci];
  if(simpan && simpan.length) return simpan;
  return bawaan.urutan.get(kunci) || [];
}

const LENCANA = {
  aktif:        { kelas: 'badge-live',  teks: 'Aktif' },
  pengembangan: { kelas: 'badge-soon',  teks: 'Dalam Pengembangan' },
  maintenance:  { kelas: 'badge-maint', teks: 'Pemeliharaan' },
};

/*
  Naskah dan status yang sedang berlaku dipasang ke salinan markup, memakai
  aturan yang sama dengan shared/situs.js. Jadi yang tampil di panel ini bukan
  gambaran kasar, melainkan hasil akhirnya.
*/
function pasangNilai(wadah){
  wadah.querySelectorAll('[data-teks]').forEach(el => {
    const isi = nilaiTeks(el.dataset.teks, 'id');
    if(isi) el.innerHTML = isi;
  });

  wadah.querySelectorAll('[data-fitur]').forEach(kartu => {
    const s = nilaiFitur(kartu.dataset.fitur);
    const l = LENCANA[s] || LENCANA.aktif;
    const lencana = kartu.querySelector('.badge');
    if(lencana){
      lencana.className = 'badge ' + l.kelas;
      lencana.textContent = l.teks;
    }
    kartu.querySelectorAll('a.btn').forEach(a => { a.hidden = (s !== 'aktif'); });
    kartu.classList.toggle('fitur-tidak-aktif', s !== 'aktif');
  });
}

function urutkanKisi(wadah){
  wadah.querySelectorAll('[data-urutan]').forEach(kisi => {
    const daftar = nilaiUrutan(kisi.dataset.urutan);
    if(!daftar.length) return;
    const anak = [...kisi.children];
    const punyaKunci = [];
    const sisa = [];
    anak.forEach(el => {
      const i = el.dataset.fitur === undefined ? -1 : daftar.indexOf(el.dataset.fitur);
      if(i >= 0) punyaKunci.push({ el, i }); else sisa.push(el);
    });
    punyaKunci.sort((a,b) => a.i - b.i);
    punyaKunci.forEach(x => kisi.appendChild(x.el));
    sisa.forEach(el => kisi.appendChild(el));
  });
}

function adaTimpaan(wadah){
  const kunciTeks  = [...wadah.querySelectorAll('[data-teks]')].map(x => x.dataset.teks);
  const kunciFitur = [...wadah.querySelectorAll('[data-fitur]')].map(x => x.dataset.fitur);
  const kunciKisi  = [...wadah.querySelectorAll('[data-urutan]')].map(x => x.dataset.urutan);
  return kunciTeks.some(k => simpanan.teks[k])
      || kunciFitur.some(k => simpanan.fitur[k])
      || kunciKisi.some(k => simpanan.urutan[k]);
}

/*
  Tombol di dalam salinan ini mengarah ke halaman publik. Kalau dibiarkan,
  sekali salah klik pengurus terlempar keluar dari panel dan pekerjaan yang
  belum disimpan hilang. Semua klik di dalam cermin ditahan di sini, kecuali
  klik pada tombol milik panel ini sendiri.
*/
function tahanKlik(wadah){
  wadah.addEventListener('click', (e) => {
    if(e.target.closest('.ak-alat')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function gambarCermin(){
  const wadah = $('cerminSitus');
  const cari = rapikan($('cariTampilan').value).toLowerCase();
  wadah.innerHTML = '';

  let adaIsi = false;

  susunan.forEach(h => {
    h.bagian.forEach((g, iBagian) => {
      const kotak = document.createElement('div');
      kotak.innerHTML = g.html;
      const sec = kotak.firstElementChild;
      if(!sec) return;

      urutkanKisi(sec);
      pasangNilai(sec);

      // Penyaringan bekerja atas naskah yang SEDANG berlaku, bukan atas nama
      // kuncinya saja, supaya mencari kalimat yang terlihat di layar berhasil.
      if(cari){
        const bahan = [h.nama, g.nama, sec.textContent,
          ...[...sec.querySelectorAll('[data-teks]')].map(x => x.dataset.teks),
          ...[...sec.querySelectorAll('[data-fitur]')].map(x => x.dataset.fitur),
        ].join(' ').toLowerCase();
        if(!bahan.includes(cari)) return;
      }

      adaIsi = true;

      const bingkai = document.createElement('article');
      bingkai.className = 'ak-bingkai';
      bingkai.innerHTML =
        '<div class="ak-bingkai-kepala">'
        + `<span class="ak-bingkai-halaman">${esc(h.nama)}</span>`
        + `<span class="ak-bingkai-bagian">${esc(g.nama)}</span>`
        + (adaTimpaan(sec) ? '<span class="ak-diubah">Diubah</span>' : '')
        + '<span class="ak-bingkai-alat">'
          + `<button type="button" class="btn btn-ghost op-mini ak-alat" data-ubah-bagian="${esc(h.berkas)}|${iBagian}">Ubah teks bagian</button>`
          + `<a class="op-tautan-luar ak-alat" href="${esc(h.berkas)}" target="_blank" rel="noopener">Buka halaman</a>`
        + '</span>'
        + '</div>';

      const panggung = document.createElement('div');
      panggung.className = 'ak-panggung';
      panggung.appendChild(sec);
      bingkai.appendChild(panggung);
      wadah.appendChild(bingkai);

      pasangAlatKartu(sec);
      pasangSeret(sec);
      tahanKlik(panggung);
    });
  });

  if(!adaIsi){
    wadah.innerHTML = '<p class="ak-kosong">'
      + (cari ? 'Tidak ada yang cocok dengan pencarian itu.'
              : 'Belum ada isi yang bisa diatur.')
      + '</p>';
  }

  kunciCermin();
}

/* ---------- Tombol ubah pada tiap kartu ---------- */

function pasangAlatKartu(sec){
  sec.querySelectorAll('[data-fitur]').forEach(kartu => {
    kartu.classList.add('ak-kartu');

    const bisaGeser = !!kartu.closest('[data-urutan]');
    const alat = document.createElement('div');
    alat.className = 'ak-alat ak-alat-kartu';
    alat.innerHTML =
      (bisaGeser ? '<span class="ak-genggam" title="Seret untuk memindahkan urutan">&#10495;</span>' : '')
      + '<button type="button" class="ak-tombol-ubah">Ubah</button>';
    kartu.appendChild(alat);

    alat.querySelector('.ak-tombol-ubah').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bukaPenyunting({ jenis: 'kartu', kartu });
    });
  });
}

/* ---------- Memindahkan urutan kartu ---------- */

/*
  Yang bisa dipindah HANYA urutannya. Sengaja tidak ada pengaturan posisi
  bebas, kemiringan, atau ukuran, sebab tata letak situs diatur styles.css dan
  harus tetap rapi dari layar ponsel sampai layar lebar. Kartu yang ditaruh di
  titik bebas akan berantakan begitu lebar layarnya berubah, dan kerusakan itu
  baru ketahuan di perangkat orang lain.
*/
let kartuDiseret = null;

function pasangSeret(sec){
  sec.querySelectorAll('[data-urutan]').forEach(kisi => {
    kisi.querySelectorAll('[data-fitur]').forEach(kartu => {
      kartu.draggable = true;

      kartu.addEventListener('dragstart', (e) => {
        if(!sedangDipelihara()){ e.preventDefault(); return; }
        kartuDiseret = kartu;
        kartu.classList.add('ak-sedang-diseret');
        e.dataTransfer.effectAllowed = 'move';
        // Sebagian peramban membatalkan seretan kalau tidak ada data sama sekali.
        e.dataTransfer.setData('text/plain', kartu.dataset.fitur);
      });

      kartu.addEventListener('dragend', () => {
        kartu.classList.remove('ak-sedang-diseret');
        kartuDiseret = null;
        simpanUrutanKisi(kisi);
      });
    });

    kisi.addEventListener('dragover', (e) => {
      if(!kartuDiseret || !kisi.contains(kartuDiseret)) return;
      e.preventDefault();
      const sasaran = e.target.closest('[data-fitur]');
      if(!sasaran || sasaran === kartuDiseret || sasaran.parentElement !== kisi) return;

      // Titik tengah kartu sasaran menentukan sisi mana yang dituju, supaya
      // kartunya tidak bolak-balik melompat saat kursor bergerak sedikit.
      const kotak = sasaran.getBoundingClientRect();
      const setelah = (e.clientX - kotak.left) > kotak.width / 2;
      kisi.insertBefore(kartuDiseret, setelah ? sasaran.nextSibling : sasaran);
    });
  });
}

function simpanUrutanKisi(kisi){
  const kunci = kisi.dataset.urutan;
  const baru = [...kisi.querySelectorAll('[data-fitur]')].map(x => x.dataset.fitur);
  const asal = bawaan.urutan.get(kunci) || [];

  if(baru.join('|') === asal.join('|')) delete simpanan.urutan[kunci];
  else simpanan.urutan[kunci] = baru;

  pesan($('pesanTampilan'),
    'Urutan diubah. Tekan <strong>Simpan perubahan</strong> supaya berlaku di situs publik.', 'benar');
}

/* ---------- Penguncian saat situs aktif ---------- */

function kunciCermin(){
  const terkunci = !sedangDipelihara();
  const wadah = $('cerminSitus');
  wadah.classList.toggle('ak-terkunci', terkunci);
  wadah.querySelectorAll('.ak-tombol-ubah, [data-ubah-bagian]')
    .forEach(x => { x.disabled = terkunci; });
  // Hanya kartu yang memang berada di dalam kisi ber-atribut data-urutan yang
  // boleh diseret. Kartu di luar kisi itu tidak punya penangan seret sama
  // sekali, jadi menandainya bisa diseret cuma menjanjikan sesuatu yang tidak
  // akan terjadi.
  wadah.querySelectorAll('[data-urutan] [data-fitur]')
    .forEach(x => { x.draggable = !terkunci; });
}

/* ============================================================
   8B. Jendela penyuntingan
   ============================================================ */

let sedangDisunting = null;

function medanTeks(kunci){
  const label = labelTeks.get(kunci) || kunci;
  return '<div class="ak-medan">'
    + `<div class="ak-medan-label">${esc(label)}<span class="ak-kunci">${esc(kunci)}</span></div>`
    + '<div class="ak-dwibahasa">'
      + '<div class="ak-kotak"><label>Indonesia</label>'
      + `<textarea data-teks="${esc(kunci)}" data-bahasa="id">${esc(nilaiTeks(kunci,'id'))}</textarea></div>`
      + '<div class="ak-kotak"><label>Inggris</label>'
      + `<textarea data-teks="${esc(kunci)}" data-bahasa="en">${esc(nilaiTeks(kunci,'en'))}</textarea></div>`
    + '</div></div>';
}

function bukaPenyunting(konteks){
  if(!sedangDipelihara()){
    pesan($('pesanTampilan'),
      'Situs masih aktif. Masuk ke pemeliharaan dulu lewat tab <strong>Status Situs</strong>.', 'salah');
    return;
  }

  let judul;
  let kunciFitur = null;
  let kunciTeks = [];

  if(konteks.jenis === 'kartu'){
    kunciFitur = konteks.kartu.dataset.fitur;
    judul = labelFitur.get(kunciFitur) || kunciFitur;
    kunciTeks = [...konteks.kartu.querySelectorAll('[data-teks]')].map(x => x.dataset.teks);
  }else{
    judul = konteks.namaBagian;
    // Naskah yang sudah punya tombol ubah sendiri di kartunya tidak diulang di
    // sini, supaya satu kunci tidak bisa diisi dari dua tempat sekaligus.
    kunciTeks = [...konteks.sec.querySelectorAll('[data-teks]')]
      .filter(x => !x.closest('[data-fitur]'))
      .map(x => x.dataset.teks);
  }

  sedangDisunting = { kunciFitur, kunciTeks };
  $('penyuntingJudul').textContent = judul;

  const bagianStatus = kunciFitur
    ? '<div class="ak-medan"><div class="ak-medan-label">Status fitur</div>'
      + '<select class="ak-status-pilih" id="penyuntingStatus">'
      + STATUS_FITUR.map(s =>
          `<option value="${s.nilai}"${s.nilai === nilaiFitur(kunciFitur) ? ' selected' : ''}>${esc(s.label)}</option>`
        ).join('')
      + '</select>'
      + '<p class="op-catatan">Selain Aktif, tombol pada kartu ini disembunyikan dan halamannya ikut tertutup.</p>'
      + '</div>'
    : '';

  $('penyuntingIsi').innerHTML = bagianStatus
    + (kunciTeks.length
        ? kunciTeks.map(medanTeks).join('')
        : '<p class="ak-kosong">Bagian ini tidak punya naskah yang bisa diubah.</p>');

  $('penyunting').hidden = false;
  const pertama = $('penyuntingIsi').querySelector('textarea, select');
  if(pertama) pertama.focus();
}

function tutupPenyunting(){
  $('penyunting').hidden = true;
  sedangDisunting = null;
}

/*
  Nilai yang sama dengan bawaannya TIDAK disimpan, dan kotak yang dikosongkan
  berarti "pakai naskah bawaan halaman", bukan "kosongkan tulisannya". Itu yang
  menjaga dokumen Firestore tetap berisi selisihnya saja.
*/
function simpanPenyunting(){
  if(!sedangDisunting) return;

  const sel = $('penyuntingStatus');
  if(sel && sedangDisunting.kunciFitur){
    const k = sedangDisunting.kunciFitur;
    if(sel.value === (bawaan.fitur.get(k) || 'aktif')) delete simpanan.fitur[k];
    else simpanan.fitur[k] = { status: sel.value };
  }

  $('penyuntingIsi').querySelectorAll('textarea[data-teks]').forEach(ta => {
    const kunci = ta.dataset.teks;
    const bahasa = ta.dataset.bahasa;
    const asal = bawaan.teks.get(kunci) || { id:'', en:'' };
    const isi = rapikan(ta.value);

    if(isi === '' || isi === asal[bahasa]){
      if(simpanan.teks[kunci]) delete simpanan.teks[kunci][bahasa];
    }else{
      if(!simpanan.teks[kunci]) simpanan.teks[kunci] = {};
      simpanan.teks[kunci][bahasa] = isi;
    }
    if(simpanan.teks[kunci] && Object.keys(simpanan.teks[kunci]).length === 0){
      delete simpanan.teks[kunci];
    }
  });

  tutupPenyunting();
  gambarCermin();
  pesan($('pesanTampilan'),
    'Perubahan tercatat. Tekan <strong>Simpan perubahan</strong> supaya berlaku di situs publik.', 'benar');
}

function kembalikanBawaan(){
  if(!sedangDisunting) return;
  if(sedangDisunting.kunciFitur) delete simpanan.fitur[sedangDisunting.kunciFitur];
  sedangDisunting.kunciTeks.forEach(k => { delete simpanan.teks[k]; });
  tutupPenyunting();
  gambarCermin();
  pesan($('pesanTampilan'),
    'Dikembalikan ke naskah bawaan halaman. Tekan <strong>Simpan perubahan</strong> supaya berlaku di situs publik.', 'benar');
}

$('penyuntingSimpan').addEventListener('click', simpanPenyunting);
$('penyuntingBatal').addEventListener('click', tutupPenyunting);
$('penyuntingBawaan').addEventListener('click', kembalikanBawaan);
$('penyuntingTutup').addEventListener('click', tutupPenyunting);

$('penyunting').addEventListener('click', (e) => {
  if(e.target.id === 'penyunting') tutupPenyunting();
});

document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !$('penyunting').hidden) tutupPenyunting();
});

/*
  Tombol "Ubah teks bagian" ditangani dari wadahnya, bukan dipasang satu per
  satu, karena isi cermin digambar ulang tiap ada perubahan dan penangan yang
  menempel di tombol lama akan ikut terbuang.
*/
$('cerminSitus').addEventListener('click', (e) => {
  const t = e.target.closest('[data-ubah-bagian]');
  if(!t) return;
  e.preventDefault();
  const potong = t.dataset.ubahBagian.lastIndexOf('|');
  const berkas = t.dataset.ubahBagian.slice(0, potong);
  const iBagian = +t.dataset.ubahBagian.slice(potong + 1);
  const h = susunan.find(x => x.berkas === berkas);
  if(!h) return;
  const sec = t.closest('.ak-bingkai').querySelector('.ak-panggung > *');
  bukaPenyunting({ jenis: 'bagian', sec, namaBagian: h.bagian[iBagian].nama });
});

$('cariTampilan').addEventListener('input', gambarCermin);

$('tombolMuatUlang').addEventListener('click', async () => {
  bersihkanPesan($('pesanTampilan'));
  await muatSemua();
});

$('tombolUrutanBawaan').addEventListener('click', () => {
  if(!sedangDipelihara()){
    pesan($('pesanTampilan'), 'Situs masih aktif, jadi urutannya terkunci.', 'salah');
    return;
  }
  simpanan.urutan = {};
  gambarCermin();
  pesan($('pesanTampilan'),
    'Urutan kartu dikembalikan seperti bawaan halaman. Tekan <strong>Simpan perubahan</strong> supaya berlaku.', 'benar');
});

/* ============================================================
   9. Menyimpan tampilan
   ============================================================ */

async function tulisDokumen(isi){
  if(dokumenAda){
    await updateDoc(doc(db, 'publik', 'situs'), isi);
  }else{
    await setDoc(doc(db, 'publik', 'situs'), {
      statusSitus: 'maintenance',
      pesanMaintenance: {},
      fitur: {},
      teks: {},
      urutan: {},
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

  try{
    status('Menyimpan…', 'sibuk');
    await tulisDokumen({
      fitur:  simpanan.fitur,
      teks:   simpanan.teks,
      urutan: simpanan.urutan,
      diperbaruiPada: new Date().toISOString(),
      diperbaruiOleh: akun ? akun.email : '',
    });
    gambarCermin();

    const jumlah = Object.keys(simpanan.fitur).length
                 + Object.keys(simpanan.teks).length
                 + Object.keys(simpanan.urutan).length;
    status('Tersimpan.', 'benar');
    pesan(el, jumlah === 0
      ? 'Tersimpan. Sekarang tidak ada satu pun yang menimpa bawaan halaman.'
      : `Tersimpan. ${jumlah} bagian sedang menimpa bawaan halaman.`, 'benar');
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
