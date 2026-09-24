/*
  Pembuat gambar Instagram untuk perubahan jadwal sementara.

  Admin operasional mencentang satu atau beberapa perubahan, lalu berkas ini
  menempelkannya ke template KAFBE dan menghasilkan gambar siap unggah:

    - Post feed  1080 x 1350 (rasio 4:5, ukuran terbesar yang diterima feed)
    - Story / SG 1080 x 1920 (rasio 9:16)

  Tidak ada yang dikirim ke Instagram dari sini. Gambarnya hanya diunduh,
  disalin ke papan klip, atau dibagikan lewat menu bagikan ponsel, lalu
  diunggah sendiri oleh pengurus. Dengan begitu tidak perlu kunci akses
  Instagram apa pun di situs ini.

  MENGGANTI DESAIN

  Seluruh tampilan diatur dari objek TEMPLATE di bawah. Begitu template,
  font, dan design guideline resmi KAFBE tersedia:

    1. Font: muat lewat <link> Google Fonts atau @font-face di operasional.html,
       lalu tulis nama keluarganya di TEMPLATE.font.
    2. Latar: simpan gambar latar dari desainer (PNG/JPG, ukuran persis
       1080x1350 dan 1080x1920) di folder yang sama dengan situs, lalu isi
       TEMPLATE.latar.post dan TEMPLATE.latar.story dengan jalurnya. Bila
       diisi, gradasi dan hiasan bawaan tidak digambar lagi.
    3. Area isi: sesuaikan TEMPLATE.ukuran[...].atas / .bawah dan
       TEMPLATE.samping supaya kartu tidak menimpa hiasan di latar.
    4. Warna: TEMPLATE.warna dan TEMPLATE.jenis.

  Area atas dan bawah Story sengaja dikosongkan cukup lebar, karena bagian
  itu tertutup nama akun dan kolom balasan di aplikasi Instagram.
*/

export const TEMPLATE = {
  ukuran: {
    post:  { w: 1080, h: 1350, atas: 80,  bawah: 70,  nama: 'Post feed (4:5)' },
    story: { w: 1080, h: 1920, atas: 230, bawah: 280, nama: 'Story / SG (9:16)' },
  },
  samping: 72,

  font: {
    judul: '"Baloo 2"',
    isi:   '"Plus Jakarta Sans"',
  },

  warna: {
    latarAtas:  '#16294A',
    latarBawah: '#1F3A63',
    hiasan:     'rgba(111,168,201,0.16)',
    aksen:      '#F0B93D',
    judul:      '#FFFFFF',
    subjudul:   '#B7DAE8',
    kartu:      '#FFFFFF',
    tinta:      '#0F2540',
    tintaLembut:'#4C6885',
    kaki:       '#CFE7F0',
  },

  // Jalur gambar latar dari desainer. Kosongkan (null) untuk memakai latar bawaan.
  latar: { post: null, story: null },

  logo:     '/ikon-ponsel.svg',
  merek:    'KAFBE HUB',
  judul:    'Info Perubahan Jadwal',
  kaki:     'Jadwal lengkap: kafbehub.vercel.app/jadwal',
  akun:     '@ka.fbe.ubaya',

  jenis: {
    libur:    { label: 'Ditiadakan',  latar: '#FBE3E2', teks: '#B03B37' },
    daring:   { label: 'Online',      latar: '#EDE7F8', teks: '#5B3FA0' },
    pindah:   { label: 'Dipindah',    latar: '#E1F5E9', teks: '#1E7A44' },
    menyusul: { label: 'Dipindah',    latar: '#FDEEDB', teks: '#8A5A0B' },
    ruang:    { label: 'Ganti ruang', latar: '#E7EDF1', teks: '#3F5A70' },
  },
};

/* ============================================================
   Penggambaran
   ============================================================ */

const muatGambar = (() => {
  const simpanan = new Map();
  return src => {
    if(!src) return Promise.resolve(null);
    if(!simpanan.has(src)){
      simpanan.set(src, new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);   // gambar gagal dimuat bukan alasan untuk batal
        img.src = src;
      }));
    }
    return simpanan.get(src);
  };
})();

// Kanvas tidak menunggu font web termuat. Tanpa ini, gambar pertama bisa
// tergambar dengan font cadangan sistem.
async function siapkanFont(){
  const f = TEMPLATE.font;
  try{
    // Tunggu lembar gaya font selesai terbaca dulu. Sebelum itu, load()
    // untuk keluarga yang belum dikenal langsung selesai tanpa memuat apa pun.
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(`800 60px ${f.judul}`),
      document.fonts.load(`700 40px ${f.judul}`),
      document.fonts.load(`800 24px ${f.isi}`),
      document.fonts.load(`700 28px ${f.isi}`),
      document.fonts.load(`600 28px ${f.isi}`),
      document.fonts.load(`500 24px ${f.isi}`),
    ]);
  }catch{ /* tetap lanjut dengan font yang ada */ }
}

function kotakBulat(ctx, x, y, w, h, r){
  ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Memecah teks menjadi baris-baris yang muat dalam lebar tertentu.
function pecahBaris(ctx, teks, lebar, maks = Infinity){
  const kata = String(teks || '').split(/\s+/).filter(Boolean);
  const baris = [];
  let kini = '';
  for(const k of kata){
    const coba = kini ? kini + ' ' + k : k;
    if(ctx.measureText(coba).width <= lebar || !kini){ kini = coba; continue; }
    baris.push(kini);
    kini = k;
  }
  if(kini) baris.push(kini);
  if(baris.length > maks){
    const sisa = baris.slice(0, maks);
    let akhir = sisa[maks - 1];
    while(akhir && ctx.measureText(akhir + '…').width > lebar) akhir = akhir.slice(0, -1);
    sisa[maks - 1] = akhir + '…';
    return sisa;
  }
  return baris;
}

/*
  Satu kartu dihitung dulu tata letaknya (tinggi dan baris-barisnya) sebelum
  digambar, supaya pembagian ke beberapa halaman bisa diputuskan lebih dulu.
*/
function susunKartu(ctx, butir, lebar, s){
  const f = TEMPLATE.font;
  const pad = 30 * s;
  const dalam = lebar - pad * 2;
  const baris = [];

  ctx.font = `700 ${42 * s}px ${f.judul}`;
  for(const t of pecahBaris(ctx, butir.judul, dalam, 2)){
    baris.push({ teks: t, font: ctx.font, warna: TEMPLATE.warna.tinta, tinggi: 48 * s });
  }

  ctx.font = `600 ${26 * s}px ${f.isi}`;
  for(const t of pecahBaris(ctx, butir.info, dalam)){
    baris.push({ teks: t, font: ctx.font, warna: TEMPLATE.warna.tintaLembut, tinggi: 36 * s });
  }

  for(const d of butir.detail || []){
    ctx.font = `700 ${28 * s}px ${f.isi}`;
    const pecah = pecahBaris(ctx, d, dalam - 34 * s);
    pecah.forEach((t, i) => baris.push({
      teks: t, font: ctx.font, warna: TEMPLATE.warna.tinta, tinggi: 38 * s,
      panah: i === 0, geser: 34 * s, jarakAtas: i === 0 ? 8 * s : 0,
    }));
  }

  if(butir.catatan){
    ctx.font = `500 ${24 * s}px ${f.isi}`;
    pecahBaris(ctx, butir.catatan, dalam, 3).forEach((t, i) => baris.push({
      teks: t, font: ctx.font, warna: TEMPLATE.warna.tintaLembut, tinggi: 34 * s,
      jarakAtas: i === 0 ? 8 * s : 0,
    }));
  }

  const lencana = 42 * s;
  const tinggi = pad + lencana + 14 * s
    + baris.reduce((n, b) => n + b.tinggi + (b.jarakAtas || 0), 0) + pad - 6 * s;
  return { butir, baris, tinggi, pad, lencana, s };
}

function gambarKartu(ctx, k, x, y, lebar){
  const { butir, baris, tinggi, pad, lencana, s } = k;
  const jenis = TEMPLATE.jenis[butir.tipe] || { label: butir.tipe, latar: '#E7EDF1', teks: '#3F5A70' };

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 8 * s;
  ctx.fillStyle = TEMPLATE.warna.kartu;
  kotakBulat(ctx, x, y, lebar, tinggi, 28 * s);
  ctx.fill();
  ctx.restore();

  // Garis warna jenis di sisi kiri kartu
  ctx.save();
  kotakBulat(ctx, x, y, lebar, tinggi, 28 * s);
  ctx.clip();
  ctx.fillStyle = jenis.teks;
  ctx.fillRect(x, y, 10 * s, tinggi);
  ctx.restore();

  // Lencana jenis perubahan
  const f = TEMPLATE.font;
  ctx.font = `800 ${22 * s}px ${f.isi}`;
  const labelTeks = (butir.label || jenis.label).toUpperCase();
  const lebarLencana = ctx.measureText(labelTeks).width + 32 * s;
  let cy = y + pad;
  ctx.fillStyle = jenis.latar;
  kotakBulat(ctx, x + pad, cy, lebarLencana, lencana, lencana / 2);
  ctx.fill();
  ctx.fillStyle = jenis.teks;
  ctx.textBaseline = 'middle';
  ctx.fillText(labelTeks, x + pad + 16 * s, cy + lencana / 2 + 1 * s);

  // Tanggal ringkas di kanan lencana
  if(butir.tanggalPendek){
    ctx.font = `800 ${24 * s}px ${f.isi}`;
    ctx.fillStyle = TEMPLATE.warna.tintaLembut;
    ctx.textAlign = 'right';
    ctx.fillText(butir.tanggalPendek, x + lebar - pad, cy + lencana / 2 + 1 * s);
    ctx.textAlign = 'left';
  }

  cy += lencana + 14 * s;
  ctx.textBaseline = 'alphabetic';
  for(const b of baris){
    cy += (b.jarakAtas || 0) + b.tinggi;
    ctx.font = b.font;
    ctx.fillStyle = b.warna;
    const tx = x + pad + (b.geser || 0);
    if(b.panah){
      ctx.fillStyle = jenis.teks;
      ctx.fillText('→', x + pad, cy - 9 * s);
      ctx.fillStyle = b.warna;
    }
    ctx.fillText(b.teks, tx, cy - 9 * s);
  }
}

function gambarLatar(ctx, uk, latarImg){
  const { w, h } = uk;
  if(latarImg){
    // Seperti object-fit: cover
    const r = Math.max(w / latarImg.width, h / latarImg.height);
    const lw = latarImg.width * r, lh = latarImg.height * r;
    ctx.drawImage(latarImg, (w - lw) / 2, (h - lh) / 2, lw, lh);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, TEMPLATE.warna.latarAtas);
  g.addColorStop(1, TEMPLATE.warna.latarBawah);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = TEMPLATE.warna.hiasan;
  ctx.beginPath(); ctx.arc(w + 60, 120, 320, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-80, h - 80, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEMPLATE.warna.aksen;
  ctx.beginPath(); ctx.arc(w - 96, h - 54, 14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(110, 60 + uk.atas * 0.4, 9, 0, Math.PI * 2); ctx.fill();
}

// Tinggi kepala dan kaki yang dipakai tiap halaman, dipisah supaya bisa
// dihitung sebelum kartunya disusun.
const TINGGI_KEPALA = 250;
const TINGGI_KAKI = 110;

function gambarKepala(ctx, uk, logo, subjudul, halaman){
  const x = TEMPLATE.samping;
  let y = uk.atas;
  const f = TEMPLATE.font;

  if(logo){
    ctx.save();
    kotakBulat(ctx, x, y, 84, 84, 22);
    ctx.clip();
    ctx.drawImage(logo, x, y, 84, 84);
    ctx.restore();
  }
  ctx.textBaseline = 'middle';
  ctx.font = `800 26px ${f.isi}`;
  ctx.fillStyle = TEMPLATE.warna.aksen;
  ctx.fillText(TEMPLATE.merek, x + (logo ? 104 : 0), y + 30);
  ctx.font = `600 24px ${f.isi}`;
  ctx.fillStyle = TEMPLATE.warna.subjudul;
  ctx.fillText(TEMPLATE.akun, x + (logo ? 104 : 0), y + 62);

  if(halaman){
    ctx.textAlign = 'right';
    ctx.font = `800 24px ${f.isi}`;
    ctx.fillStyle = TEMPLATE.warna.subjudul;
    ctx.fillText(halaman, uk.w - x, y + 42);
    ctx.textAlign = 'left';
  }

  y += 84 + 22;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 76px ${f.judul}`;
  ctx.fillStyle = TEMPLATE.warna.judul;
  ctx.fillText(TEMPLATE.judul, x, y + 66);

  ctx.font = `700 28px ${f.isi}`;
  ctx.fillStyle = TEMPLATE.warna.aksen;
  ctx.fillText(subjudul, x, y + 112);
}

function gambarKaki(ctx, uk){
  const f = TEMPLATE.font;
  const y = uk.h - uk.bawah - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(TEMPLATE.samping, y - 58, uk.w - TEMPLATE.samping * 2, 2);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = `600 26px ${f.isi}`;
  ctx.fillStyle = TEMPLATE.warna.kaki;
  ctx.fillText(TEMPLATE.kaki, uk.w / 2, y);
  ctx.textAlign = 'left';
}

/*
  Membagi butir ke halaman. Diutamakan semuanya muat dalam satu gambar,
  bila perlu dengan huruf sedikit diperkecil. Bila tetap tidak muat,
  butir dibagi ke beberapa gambar dengan ukuran huruf normal.
*/
function bagiHalaman(ctx, uk, daftar){
  const lebar = uk.w - TEMPLATE.samping * 2;
  const ruang = uk.h - uk.atas - uk.bawah - TINGGI_KEPALA - TINGGI_KAKI;
  const jarak = s => 22 * s;

  for(const s of [1, 0.92, 0.84, 0.76, 0.7]){
    const kartu = daftar.map(b => susunKartu(ctx, b, lebar, s));
    const total = kartu.reduce((n, k) => n + k.tinggi, 0) + jarak(s) * (kartu.length - 1);
    if(total <= ruang) return [kartu];
  }

  const s = 0.76;
  const halaman = [];
  let kini = [], terpakai = 0;
  for(const b of daftar){
    const k = susunKartu(ctx, b, lebar, s);
    const tambah = (kini.length ? jarak(s) : 0) + k.tinggi;
    if(kini.length && terpakai + tambah > ruang){
      halaman.push(kini);
      kini = []; terpakai = 0;
    }
    terpakai += (kini.length ? jarak(s) : 0) + k.tinggi;
    kini.push(k);
  }
  if(kini.length) halaman.push(kini);

  // Pembagian di atas mengisi halaman awal sepenuh mungkin, sehingga halaman
  // terakhir bisa hanya berisi satu kartu. Bila memungkinkan, jumlah kartu
  // diratakan supaya tiap gambar tampak seimbang.
  const semua = halaman.flat();
  const per = Math.ceil(semua.length / halaman.length);
  const rata = [];
  for(let i = 0; i < semua.length; i += per) rata.push(semua.slice(i, i + per));
  const muat = h => h.reduce((n, k) => n + k.tinggi, 0) + jarak(s) * (h.length - 1) <= ruang;
  return rata.length === halaman.length && rata.every(muat) ? rata : halaman;
}

/*
  Menghasilkan daftar kanvas untuk satu format ('post' atau 'story').

  butir: [{ tipe, label?, judul, info, detail: [..], catatan?, tanggal, tanggalPendek }]
  subjudul: teks di bawah judul besar, misalnya rentang tanggalnya.
*/
export async function buatKanvas(format, daftar, subjudul){
  const uk = TEMPLATE.ukuran[format];
  await siapkanFont();
  // Latar dari desainer biasanya sudah memuat logo, jadi logo bawaan hanya
  // digambar di atas latar bawaan.
  const [logo, latarImg] = await Promise.all([
    TEMPLATE.latar[format] ? null : muatGambar(TEMPLATE.logo),
    muatGambar(TEMPLATE.latar[format]),
  ]);

  const ukur = document.createElement('canvas').getContext('2d');
  const halaman = bagiHalaman(ukur, uk, daftar);

  return halaman.map((kartu, i) => {
    const kanvas = document.createElement('canvas');
    kanvas.width = uk.w; kanvas.height = uk.h;
    const ctx = kanvas.getContext('2d');

    gambarLatar(ctx, uk, latarImg);
    gambarKepala(ctx, uk, logo, subjudul,
      halaman.length > 1 ? `${i + 1}/${halaman.length}` : '');

    const lebar = uk.w - TEMPLATE.samping * 2;
    const jarak = 22 * kartu[0].s;
    const ruang = uk.h - uk.atas - uk.bawah - TINGGI_KEPALA - TINGGI_KAKI;
    const total = kartu.reduce((n, k) => n + k.tinggi, 0) + jarak * (kartu.length - 1);
    // Kartu diletakkan sedikit ke atas dari tengah area isi, supaya gambar
    // dengan satu perubahan saja tidak terlihat kosong di bagian atas.
    let y = uk.atas + TINGGI_KEPALA + Math.max(0, (ruang - total) * 0.35);
    for(const k of kartu){
      gambarKartu(ctx, k, TEMPLATE.samping, y, lebar);
      y += k.tinggi + jarak;
    }

    gambarKaki(ctx, uk);
    return kanvas;
  });
}

/* ============================================================
   Jendela pratinjau, unduh, salin, dan bagikan
   ============================================================ */

const $ = id => document.getElementById(id);
const keBlob = kanvas => new Promise(res => kanvas.toBlob(res, 'image/png'));

let kini = { daftar: [], subjudul: '', format: 'post', kanvas: [], namaDasar: 'kafbe' };

function pesanIg(teks, jenis){
  const el = $('igPesan');
  el.textContent = teks || '';
  el.className = 'op-pesan' + (teks ? ' tampil' : '') + (teks && jenis ? ' ' + jenis : '');
}

function namaBerkas(i){
  const n = kini.kanvas.length > 1 ? `-${i + 1}` : '';
  return `${kini.namaDasar}-${kini.format}${n}.png`;
}

async function unduh(i){
  const blob = await keBlob(kini.kanvas[i]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = namaBerkas(i);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function salin(i){
  if(!navigator.clipboard || typeof ClipboardItem === 'undefined'){
    pesanIg('Peramban ini belum bisa menyalin gambar. Gunakan tombol Unduh.', 'salah');
    return;
  }
  try{
    // Safari hanya mengizinkan penulisan papan klip bila janji blob-nya
    // diserahkan langsung di dalam klik, bukan setelah ditunggu.
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': keBlob(kini.kanvas[i]) }),
    ]);
    pesanIg(`Gambar ${kini.kanvas.length > 1 ? (i + 1) + ' ' : ''}tersalin. Tempelkan di tempat tujuan.`, 'benar');
  }catch(err){
    console.error(err);
    pesanIg('Gagal menyalin gambar: ' + err.message + '. Gunakan tombol Unduh.', 'salah');
  }
}

async function bagikan(i){
  try{
    const blobs = i === 'semua'
      ? await Promise.all(kini.kanvas.map(keBlob))
      : [await keBlob(kini.kanvas[i])];
    const files = blobs.map((b, n) =>
      new File([b], namaBerkas(i === 'semua' ? n : i), { type: 'image/png' }));
    await navigator.share({ files });
  }catch(err){
    if(err.name !== 'AbortError') pesanIg('Gagal membagikan: ' + err.message, 'salah');
  }
}

function bisaBagikanBerkas(){
  try{
    const f = new File([new Blob()], 'a.png', { type: 'image/png' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  }catch{ return false; }
}

async function gambarUlang(){
  const wadah = $('igPratinjau');
  wadah.innerHTML = '<p class="op-samar">Menyusun gambar…</p>';
  document.querySelectorAll('[data-ig-format]').forEach(b =>
    b.classList.toggle('active', b.dataset.igFormat === kini.format));

  try{
    kini.kanvas = await buatKanvas(kini.format, kini.daftar, kini.subjudul);
  }catch(err){
    console.error(err);
    wadah.innerHTML = '';
    pesanIg('Gagal menyusun gambar: ' + err.message, 'salah');
    return;
  }

  const bagi = bisaBagikanBerkas();
  const banyak = kini.kanvas.length > 1;
  $('igRingkas').textContent =
    `${kini.daftar.length} perubahan · ${kini.kanvas.length} gambar · ${TEMPLATE.ukuran[kini.format].nama}`;
  $('igUnduhSemua').hidden = !banyak;
  $('igBagikanSemua').hidden = !(banyak && bagi);

  wadah.innerHTML = '';
  kini.kanvas.forEach((kanvas, i) => {
    const kartu = document.createElement('figure');
    kartu.className = 'op-ig-hasil ' + kini.format;
    const img = document.createElement('img');
    img.src = kanvas.toDataURL('image/png');
    img.alt = `Pratinjau gambar ${i + 1}`;
    const aksi = document.createElement('figcaption');
    aksi.className = 'op-tombol-baris';
    aksi.innerHTML = `
      ${banyak ? `<span class="op-samar">${i + 1}/${kini.kanvas.length}</span>` : ''}
      <button type="button" class="op-mini" data-ig="unduh">Unduh</button>
      <button type="button" class="op-mini" data-ig="salin">Salin</button>
      ${bagi ? '<button type="button" class="op-mini" data-ig="bagikan">Bagikan</button>' : ''}`;
    aksi.querySelector('[data-ig="unduh"]').addEventListener('click', () => unduh(i));
    aksi.querySelector('[data-ig="salin"]').addEventListener('click', () => salin(i));
    aksi.querySelector('[data-ig="bagikan"]')?.addEventListener('click', () => bagikan(i));
    kartu.append(img, aksi);
    wadah.appendChild(kartu);
  });
}

let terpasang = false;
function pasang(){
  if(terpasang) return;
  terpasang = true;
  document.querySelectorAll('[data-ig-format]').forEach(b => b.addEventListener('click', () => {
    if(kini.format === b.dataset.igFormat) return;
    kini.format = b.dataset.igFormat;
    pesanIg('');
    gambarUlang();
  }));
  $('igTutup').addEventListener('click', () => $('dialogIg').close());
  $('dialogIg').addEventListener('click', e => { if(e.target === $('dialogIg')) $('dialogIg').close(); });
  $('igUnduhSemua').addEventListener('click', async () => {
    for(let i = 0; i < kini.kanvas.length; i++){
      await unduh(i);
      // Jeda singkat, sebab sebagian peramban menolak banyak unduhan serentak.
      await new Promise(r => setTimeout(r, 350));
    }
  });
  $('igBagikanSemua').addEventListener('click', () => bagikan('semua'));
}

/*
  Membuka jendela pratinjau.
  namaDasar dipakai untuk nama berkas unduhan, misalnya "kafbe-2026-09-29".
*/
export function bukaGambarIg(daftar, subjudul, namaDasar){
  pasang();
  kini = { ...kini, daftar, subjudul, namaDasar: namaDasar || 'kafbe', kanvas: [] };
  pesanIg('');
  $('dialogIg').showModal();
  gambarUlang();
}
