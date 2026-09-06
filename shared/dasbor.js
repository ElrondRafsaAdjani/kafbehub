/*
  Dasbor kunjungan untuk /adminkafbe.

  Sumber datanya koleksi "statistik", satu dokumen per hari, yang diisi
  shared/kunjungan.js dari halaman publik. Bentuk tiap dokumennya:

    statistik/2026-08-23 = {
      tanggal      : '2026-08-23',
      tampilan     : jumlah halaman yang dibuka hari itu,
      perangkat    : jumlah perangkat berbeda yang datang hari itu,
      jam          : { '0'..'23' : jumlah },
      halaman      : { '_materi_stat2' : jumlah, ... },
      durasiTotal  : jumlah seluruh detik kunjungan,
      durasiJumlah : berapa kunjungan yang lama membukanya sempat tercatat
    }

  KENAPA GRAFIKNYA DIGAMBAR SENDIRI

  Halaman ini menggunakan Content-Security-Policy yang hanya mengizinkan skrip dari
  situs sendiri dan gstatic. Pustaka grafik dari CDN mana pun akan ditolak, dan
  melonggarkan aturan itu demi satu grafik bukan pertukaran yang sepadan.
  Grafiknya SVG biasa, sekitar seratus baris, tanpa pustaka apa pun.

  SATU HAL YANG PERLU DIKETAHUI SEJAK AWAL

  Pencatatan baru dimulai saat berkas ini dipasang. Hari-hari sebelumnya tidak
  punya data dan memang akan kosong. Grafik enam bulan baru benar-benar penuh
  setelah situs berjalan enam bulan.
*/

const SDK = 'https://www.gstatic.com/firebasejs/10.13.0';
const { collection, getDocs, query, where } = await import(`${SDK}/firebase-firestore.js`);

const $ = id => document.getElementById(id);

const BULAN_SINGKAT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const SARINGAN = [
  { kunci: '1h',  label: '1 hari',    hari: 1 },
  { kunci: '7h',  label: '1 minggu',  hari: 7 },
  { kunci: '30h', label: '1 bulan',   hari: 30 },
  { kunci: '90h', label: '3 bulan',   hari: 90 },
  { kunci: '180h',label: '6 bulan',   hari: 180 },
];

let db = null;
let saringanAktif = '30h';
let semuaHari = [];        // dokumen statistik yang sudah dimuat
let sudahDimuat = false;

/* ============================================================
   Alat bantu tanggal
   ============================================================ */

const p2 = n => String(n).padStart(2, '0');

function keIso(d){
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function mundurHari(n){
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dariIso(s){
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function tanggalPendek(iso){
  const d = dariIso(iso);
  return `${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]}`;
}

function angka(n){
  return Number(n || 0).toLocaleString('id-ID');
}

function lamaTerbaca(detik){
  detik = Math.round(detik || 0);
  if(!detik) return '0 detik';
  const m = Math.floor(detik / 60);
  const s = detik % 60;
  if(!m) return `${s} detik`;
  return s ? `${m} menit ${s} detik` : `${m} menit`;
}

// '_materi_stat2' kembali menjadi '/materi/stat2'
function alamatTerbaca(kunci){
  const jalur = String(kunci).replace(/_/g, '/');
  return jalur === '/' ? '/ (beranda)' : jalur;
}

/* ============================================================
   Memuat data
   ============================================================ */

/*
  Yang diambil selalu 180 hari terakhir, berapa pun saringan yang sedang
  dipilih, lalu penyaringannya dikerjakan di peramban.

  Sekali ambil berarti sekitar 180 pembacaan Firestore, dan berpindah-pindah
  saringan sesudahnya tidak menimbulkan pembacaan baru sama sekali. Jika tiap
  saringan mengambil ulang, sekadar membandingkan satu minggu dengan tiga bulan
  sudah menghabiskan ratusan pembacaan.
*/
async function muatStatistik(){
  const dari = keIso(mundurHari(180));
  const q = query(collection(db, 'statistik'), where('tanggal', '>=', dari));
  const snap = await getDocs(q);

  semuaHari = [];
  snap.forEach(d => semuaHari.push({ id: d.id, ...d.data() }));
  semuaHari.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
  sudahDimuat = true;
}

function rentangAktif(){
  const n = SARINGAN.find(s => s.kunci === saringanAktif).hari;
  const dari = keIso(mundurHari(n - 1));
  return semuaHari.filter(h => String(h.tanggal) >= dari);
}

/* ============================================================
   Perhitungan
   ============================================================ */

function jumlahkanPeta(daftar, nama){
  const keluar = {};
  daftar.forEach(h => {
    const peta = h[nama] || {};
    Object.keys(peta).forEach(k => { keluar[k] = (keluar[k] || 0) + Number(peta[k] || 0); });
  });
  return keluar;
}

function ringkasan(){
  const dalamRentang = rentangAktif();
  const hariIni = keIso(new Date());
  const awalBulan = hariIni.slice(0, 8) + '01';

  const jumlah = (daftar, medan) =>
    daftar.reduce((t, h) => t + Number(h[medan] || 0), 0);

  const durasiTotal  = jumlah(dalamRentang, 'durasiTotal');
  const durasiJumlah = jumlah(dalamRentang, 'durasiJumlah');

  const jam = jumlahkanPeta(dalamRentang, 'jam');
  let jamTeramai = null;
  Object.keys(jam).forEach(j => {
    if(jamTeramai === null || jam[j] > jam[jamTeramai]) jamTeramai = j;
  });

  return {
    hariIni:   jumlah(semuaHari.filter(h => h.tanggal === hariIni), 'tampilan'),
    bulanIni:  jumlah(semuaHari.filter(h => h.tanggal >= awalBulan && h.tanggal <= hariIni), 'tampilan'),
    tampilan:  jumlah(dalamRentang, 'tampilan'),
    perangkat: jumlah(dalamRentang, 'perangkat'),
    rataDurasi: durasiJumlah ? durasiTotal / durasiJumlah : 0,
    durasiJumlah,
    jam,
    jamTeramai,
    halaman: jumlahkanPeta(dalamRentang, 'halaman'),
    dalamRentang,
  };
}

/* ============================================================
   Grafik
   ============================================================ */

const LEBAR = 900;
const TINGGI = 260;
const TEPI = { atas: 18, bawah: 34, kiri: 52, kanan: 12 };

/*
  Batang digambar sendiri lewat SVG. Tiap batang punya satu bidang tak terlihat
  setinggi penuh sebagai sasaran tetikus, supaya batang yang nilainya kecil,
  bahkan nol, tetap bisa disorot. Tanpa itu, hari-hari sepi justru jadi bagian
  yang paling sulit diperiksa, padahal itu yang biasanya ingin ditelusuri.
*/
function gambarGrafik(r){
  const svg = $('dasborGrafik');
  const satuHari = saringanAktif === '1h';

  let titik;
  if(satuHari){
    titik = [];
    for(let j = 0; j < 24; j++){
      titik.push({ label: p2(j) + '.00', nilai: Number(r.jam[String(j)] || 0),
                   keterangan: `Pukul ${p2(j)}.00 sampai ${p2(j)}.59` });
    }
  }else{
    const n = SARINGAN.find(s => s.kunci === saringanAktif).hari;
    const peta = {};
    r.dalamRentang.forEach(h => { peta[h.tanggal] = Number(h.tampilan || 0); });
    titik = [];
    for(let i = n - 1; i >= 0; i--){
      const iso = keIso(mundurHari(i));
      titik.push({ label: tanggalPendek(iso), nilai: peta[iso] || 0,
                   keterangan: tanggalPanjangLokal(iso) });
    }
  }

  const maks = Math.max(1, ...titik.map(t => t.nilai));
  const lebarBidang = LEBAR - TEPI.kiri - TEPI.kanan;
  const tinggiBidang = TINGGI - TEPI.atas - TEPI.bawah;
  const lebarSatu = lebarBidang / titik.length;
  const lebarBatang = Math.max(1, Math.min(lebarSatu * 0.7, 40));

  // Garis bantu mendatar beserta angkanya.
  const garis = [0, 0.5, 1].map(f => {
    const y = TEPI.atas + tinggiBidang * (1 - f);
    const nilai = Math.round(maks * f);
    return `<line x1="${TEPI.kiri}" y1="${y}" x2="${LEBAR - TEPI.kanan}" y2="${y}"
              stroke="var(--line)" stroke-width="1"/>
            <text x="${TEPI.kiri - 8}" y="${y + 4}" text-anchor="end"
              font-size="11" fill="var(--ink-soft)">${angka(nilai)}</text>`;
  }).join('');

  const batang = titik.map((t, i) => {
    const xTengah = TEPI.kiri + lebarSatu * (i + 0.5);
    const tinggi = maks ? (t.nilai / maks) * tinggiBidang : 0;
    const y = TEPI.atas + tinggiBidang - tinggi;
    return `<g class="dasbor-batang" data-i="${i}">
      <rect x="${xTengah - lebarSatu/2}" y="${TEPI.atas}" width="${lebarSatu}"
            height="${tinggiBidang}" fill="transparent"/>
      <rect class="isi" x="${xTengah - lebarBatang/2}" y="${y}" width="${lebarBatang}"
            height="${Math.max(tinggi, t.nilai > 0 ? 2 : 0)}" rx="3" fill="var(--owl-mid)"/>
    </g>`;
  }).join('');

  // Label sumbu datar diberi jarak supaya tidak saling menimpa.
  const lompat = Math.max(1, Math.ceil(titik.length / 12));
  const label = titik.map((t, i) => {
    if(i % lompat !== 0) return '';
    const x = TEPI.kiri + lebarSatu * (i + 0.5);
    return `<text x="${x}" y="${TINGGI - 12}" text-anchor="middle"
              font-size="11" fill="var(--ink-soft)">${t.label}</text>`;
  }).join('');

  svg.setAttribute('viewBox', `0 0 ${LEBAR} ${TINGGI}`);
  svg.innerHTML = garis + batang + label;

  pasangSorot(svg, titik, satuHari);
}

function tanggalPanjangLokal(iso){
  const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                 'Agustus','September','Oktober','November','Desember'];
  const d = dariIso(iso);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function pasangSorot(svg, titik, satuHari){
  const balon = $('dasborBalon');
  const bungkus = svg.parentElement;

  svg.querySelectorAll('.dasbor-batang').forEach(g => {
    g.addEventListener('mouseenter', () => {
      const t = titik[+g.dataset.i];
      balon.innerHTML =
        `<b>${t.keterangan}</b>`
        + `<span>${angka(t.nilai)} ${satuHari ? 'halaman dibuka' : 'halaman dibuka'}</span>`;
      balon.hidden = false;
      g.querySelector('.isi').setAttribute('fill', 'var(--gold-deep)');
    });

    g.addEventListener('mousemove', (e) => {
      const kotak = bungkus.getBoundingClientRect();
      let x = e.clientX - kotak.left + 14;
      const y = e.clientY - kotak.top + 14;
      // Ditahan di dalam kotak supaya balon tidak terpotong di tepi kanan.
      if(x + balon.offsetWidth > kotak.width) x = kotak.width - balon.offsetWidth - 6;
      balon.style.left = Math.max(6, x) + 'px';
      balon.style.top = y + 'px';
    });

    g.addEventListener('mouseleave', () => {
      balon.hidden = true;
      g.querySelector('.isi').setAttribute('fill', 'var(--owl-mid)');
    });
  });
}

/* ============================================================
   Menggambar seluruh dasbor
   ============================================================ */

function gambarDasbor(){
  const r = ringkasan();

  $('dasborAngka').innerHTML = [
    { label: 'Halaman dibuka hari ini', nilai: angka(r.hariIni) },
    { label: 'Halaman dibuka bulan ini', nilai: angka(r.bulanIni) },
    { label: 'Halaman dibuka pada rentang ini', nilai: angka(r.tampilan) },
    { label: 'Perangkat berbeda pada rentang ini', nilai: angka(r.perangkat) },
    { label: 'Rata-rata lama membuka halaman',
      nilai: r.durasiJumlah ? lamaTerbaca(r.rataDurasi) : 'belum ada',
      catatan: r.durasiJumlah ? `dari ${angka(r.durasiJumlah)} kunjungan yang sempat tercatat` : '' },
    { label: 'Jam paling ramai',
      nilai: r.jamTeramai === null ? 'belum ada' : `${p2(r.jamTeramai)}.00`,
      catatan: r.jamTeramai === null ? '' : `${angka(r.jam[r.jamTeramai])} halaman dibuka pada jam itu` },
  ].map(k =>
    '<div class="ak-angka">'
    + `<span class="ak-angka-label">${k.label}</span>`
    + `<span class="ak-angka-nilai">${k.nilai}</span>`
    + (k.catatan ? `<span class="ak-angka-catatan">${k.catatan}</span>` : '')
    + '</div>').join('');

  gambarGrafik(r);

  // Halaman terpopuler
  const halaman = Object.entries(r.halaman)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const totalHalaman = halaman.reduce((t, x) => t + x[1], 0) || 1;

  $('dasborHalaman').innerHTML = halaman.length
    ? '<table class="op-tabel"><thead><tr><th>Halaman</th><th>Dibuka</th><th>Bagian</th></tr></thead><tbody>'
      + halaman.map(([k, v]) =>
          `<tr><td>${alamatTerbaca(k)}</td><td>${angka(v)}</td>`
          + `<td><span class="ak-bilah"><span style="width:${(v/totalHalaman*100).toFixed(1)}%"></span></span>`
          + ` ${(v/totalHalaman*100).toFixed(1)}%</td></tr>`).join('')
      + '</tbody></table>'
    : '<p class="ak-kosong">Belum ada halaman yang tercatat pada rentang ini.</p>';

  // Jam teramai, seluruh 24 jam
  const jamTerurut = Object.entries(r.jam).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('dasborJam').innerHTML = jamTerurut.length
    ? jamTerurut.map(([j, v]) =>
        `<div class="ak-jam"><b>${p2(j)}.00</b><span>${angka(v)} halaman dibuka</span></div>`).join('')
    : '<p class="ak-kosong">Belum ada catatan jam kunjungan.</p>';

  const adaData = semuaHari.length > 0;
  $('dasborKosong').hidden = adaData;
}

/* ============================================================
   Pemasangan
   ============================================================ */

export async function pasangDasbor(basisData){
  db = basisData;

  $('dasborSaringan').innerHTML = SARINGAN.map(s =>
    `<button type="button" data-saring="${s.kunci}"${s.kunci === saringanAktif ? ' class="aktif"' : ''}>${s.label}</button>`
  ).join('');

  $('dasborSaringan').addEventListener('click', (e) => {
    const t = e.target.closest('[data-saring]');
    if(!t) return;
    saringanAktif = t.dataset.saring;
    $('dasborSaringan').querySelectorAll('button').forEach(b =>
      b.classList.toggle('aktif', b.dataset.saring === saringanAktif));
    gambarDasbor();
  });

  $('dasborMuatUlang').addEventListener('click', () => muatDasbor(true));

  await muatDasbor(false);
}

export async function muatDasbor(paksa){
  if(sudahDimuat && !paksa){ gambarDasbor(); return; }
  const pesan = $('dasborPesan');
  pesan.className = 'op-pesan tampil sibuk';
  pesan.textContent = 'Memuat catatan kunjungan…';
  try{
    await muatStatistik();
    gambarDasbor();
    pesan.className = 'op-pesan';
    pesan.textContent = '';
  }catch(err){
    console.error(err);
    pesan.className = 'op-pesan tampil salah';
    pesan.innerHTML = err.code === 'permission-denied'
      ? 'Catatan kunjungan tidak bisa dibaca. Aturan Firestore untuk koleksi '
        + '<code>statistik</code> belum terpasang. Tempel ulang isi '
        + '<code>firestore.rules</code> melalui Firebase Console.'
      : 'Gagal memuat catatan kunjungan: ' + (err.message || 'tidak diketahui');
  }
}
