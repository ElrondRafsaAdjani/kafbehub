/*
  Pembuat gambar Story Instagram (SG) untuk pengumuman perubahan jadwal.

  Admin operasional memilih perubahan sementara, atau baru saja memindah
  jadwal permanen, lalu berkas ini menuliskan pengumumannya ke template story
  KAFBE berukuran 1080 x 1920:

    PENGUMUMAN
    [judul, misalnya JADWAL PERPINDAHAN SEMENTARA]
    [kalimat pembuka, bagian bertanda *...* berwarna emas]
    [daftar kelas yang berubah, satu kotak per kelas]
    TERIMA KASIH

  Dulu jadwal pengganti ditempel sebagai tangkapan layar tabel Excel. Karena
  datanya kini sudah ada di KAFBE Hub, daftar itu ditulis langsung sebagai
  teks, jadi tetap terbaca di layar ponsel.

  Tidak ada yang dikirim ke Instagram dari sini. Gambar diunduh, disalin, atau
  dibagikan lewat menu bagikan ponsel, lalu diunggah sendiri oleh pengurus.

  TEMPLATE

  Latarnya selalu template yang diunggah tim di tab "Upload dan Download"
  (disimpan di Firestore, koleksi templateig). Template diunggah sekali dan
  dipakai sepanjang satu periode kepengurusan; periode berikutnya cukup
  mengunggah template baru untuk menggantikannya.

  Berkas ini tidak menggambar hiasan apa pun di luar area teks. Semua bagian
  yang selalu sama, seperti batik, logo, pita PENGUMUMAN, kartu putih,
  TERIMA KASIH, dan slogan, sudah ada di gambar template. Yang ditulis di sini
  hanya judul, kalimat pembuka, dan daftar kelas, di dalam "area teks" yang
  batasnya diatur di tab yang sama. Jadi di template, bagian tengah kartu
  putih harus dikosongkan.

  Font dimuat lewat Google Fonts di operasional.html. Untuk menggantinya, ubah
  tautan itu dan TEMPLATE.font di bawah.
*/

export const TEMPLATE = {
  w: 1080,
  h: 1920,

  // Area teks dalam persen dari lebar dan tinggi gambar. Dipakai bila belum
  // ada pengaturan area yang disimpan di tab "Upload dan Download".
  areaBawaan: { atas: 22, bawah: 79, kiri: 15, kanan: 15 },

  font: {
    judul:  '"League Spartan"',
    isi:    '"Montserrat"',
  },

  warna: {
    tinta:       '#1C1F3A',
    tintaLembut: '#5D6278',
    emas:        '#C8923A',
    kotak:       '#F7F1E4',
  },
};

/* ============================================================
   Keadaan template yang sedang dipakai
   ============================================================ */

let tpl = { gambar: null, area: { ...TEMPLATE.areaBawaan } };

/*
  Dipanggil oleh operasional.js setelah template dari Firestore dimuat.
  gambar: HTMLImageElement, atau null bila belum ada template yang diunggah.
*/
export function aturTemplate({ gambar = null, area = null } = {}){
  tpl = { gambar, area: { ...TEMPLATE.areaBawaan, ...(area || {}) } };
}

export const adaTemplate = () => !!tpl.gambar;

/* ============================================================
   Alat bantu penggambaran
   ============================================================ */

// Kanvas tidak menunggu font web termuat. Tanpa ini, gambar pertama bisa
// tergambar dengan font cadangan sistem.
async function siapkanFont(){
  const f = TEMPLATE.font;
  try{
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(`700 80px ${f.judul}`),
      document.fonts.load(`600 30px ${f.isi}`),
      document.fonts.load(`700 40px ${f.isi}`),
      document.fonts.load(`800 40px ${f.isi}`),
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

// Garis emas dengan belah ketupat di tengah, seperti ornamen di template.
function ornamen(ctx, cx, cy, lebar, s = 1){
  const w = TEMPLATE.warna;
  ctx.save();
  ctx.strokeStyle = w.emas;
  ctx.fillStyle = w.emas;
  ctx.lineWidth = 3 * s;
  const d = 13 * s;
  for(const arah of [-1, 1]){
    ctx.beginPath();
    ctx.moveTo(cx + arah * (d + 14 * s), cy);
    ctx.lineTo(cx + arah * lebar / 2, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + arah * (d + 26 * s), cy, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + arah * lebar / 2, cy, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------- Teks berwarna: *kata* ditulis emas ---------- */

function tokenKaya(teks){
  const out = [];
  let emas = false;
  for(const bag of String(teks || '').split(/(\*)/)){
    if(bag === '*'){ emas = !emas; continue; }
    for(const t of bag.split(/(\s+)/)){
      if(!t) continue;
      if(/^\s+$/.test(t)){
        const n = (t.match(/\n/g) || []).length;
        out.push(n ? { br: n } : { spasi: true });
      }else out.push({ k: t, emas });
    }
  }
  return out;
}

function barisKaya(ctx, teks, lebar){
  const baris = [];
  let kini = [], lebarKini = 0, spasi = false;
  const lebarSpasi = ctx.measureText(' ').width;
  const tutup = () => { baris.push({ kata: kini, lebar: lebarKini }); kini = []; lebarKini = 0; spasi = false; };

  for(const t of tokenKaya(teks)){
    if(t.br){ tutup(); for(let i = 1; i < t.br; i++) baris.push({ kata: [], lebar: 0 }); continue; }
    if(t.spasi){ spasi = kini.length > 0; continue; }
    const w = ctx.measureText(t.k).width;
    const tambah = (spasi ? lebarSpasi : 0) + w;
    if(kini.length && lebarKini + tambah > lebar) tutup();
    const pakaiSpasi = kini.length > 0 && spasi;
    kini.push({ ...t, w, spasi: pakaiSpasi });
    lebarKini += (pakaiSpasi ? lebarSpasi : 0) + w;
    spasi = false;
  }
  if(kini.length) tutup();
  return { baris, lebarSpasi };
}

function gambarBarisKaya(ctx, b, cx, y, lebarSpasi, warnaBiasa){
  let x = cx - b.lebar / 2;
  for(const k of b.kata){
    if(k.spasi) x += lebarSpasi;
    ctx.fillStyle = k.emas ? TEMPLATE.warna.emas : warnaBiasa;
    ctx.fillText(k.k, x, y);
    x += k.w;
  }
}

/* ============================================================
   Latar
   ============================================================ */

function gambarLatar(ctx){
  const { w, h } = TEMPLATE;
  const img = tpl.gambar;
  const r = Math.max(w / img.width, h / img.height);
  const lw = img.width * r, lh = img.height * r;
  ctx.drawImage(img, (w - lw) / 2, (h - lh) / 2, lw, lh);
}

/* ============================================================
   Isi pengumuman
   ============================================================

   konten = {
     judul: 'JADWAL PERPINDAHAN SEMENTARA',
     isi:   'Diharapkan bagi mahasiswa ... *AKM 1 KP B* ...',
     daftar: [{ judul: 'Akuntansi ... KP B',
                baris: [{ teks, gaya: 'lembut' | 'tebal' | 'catatan' }] }],
   }
*/

function susunKepala(ctx, konten, lebar, s){
  const f = TEMPLATE.font;
  ctx.font = `700 ${84 * s}px ${f.judul}`;
  const judul = barisKaya(ctx, String(konten.judul || '').toUpperCase(), lebar);
  const tJudul = judul.baris.length * 88 * s;

  ctx.font = `700 ${42 * s}px ${f.isi}`;
  const isi = barisKaya(ctx, konten.isi, lebar);
  const tIsi = isi.baris.length * 58 * s;

  const tinggi = tJudul + (tJudul ? 26 * s : 0) + 26 * s + 40 * s + tIsi;
  return { judul, isi, tJudul, tIsi, tinggi, s };
}

function susunButir(ctx, butir, lebar, s){
  const f = TEMPLATE.font;
  const pad = 24 * s;
  const dalam = lebar - pad * 2;
  const baris = [];
  const gaya = {
    judul:   { font: `800 ${36 * s}px ${f.isi}`, tinggi: 46 * s, warna: TEMPLATE.warna.emas },
    lembut:  { font: `600 ${30 * s}px ${f.isi}`, tinggi: 40 * s, warna: TEMPLATE.warna.tintaLembut },
    tebal:   { font: `700 ${32 * s}px ${f.isi}`, tinggi: 42 * s, warna: TEMPLATE.warna.tinta },
    catatan: { font: `500 ${26 * s}px ${f.isi}`, tinggi: 36 * s, warna: TEMPLATE.warna.tintaLembut },
  };
  const tambah = (teks, g) => {
    ctx.font = g.font;
    const { baris: bs, lebarSpasi } = barisKaya(ctx, teks, dalam);
    for(const b of bs) baris.push({ b, lebarSpasi, ...g });
  };
  if(butir.judul) tambah(butir.judul, gaya.judul);
  for(const b of butir.baris || []) tambah(b.teks, gaya[b.gaya] || gaya.tebal);
  const tinggi = pad * 2 + baris.reduce((n, b) => n + b.tinggi, 0);
  return { baris, tinggi, pad, s };
}

function gambarKepala(ctx, k, cx, y){
  const f = TEMPLATE.font;
  const s = k.s;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${84 * s}px ${f.judul}`;
  for(const b of k.judul.baris){
    y += 88 * s;
    gambarBarisKaya(ctx, b, cx, y - 14 * s, k.judul.lebarSpasi, TEMPLATE.warna.tinta);
  }
  if(k.tJudul) y += 26 * s;
  ornamen(ctx, cx, y + 13 * s, 260 * s, s);
  y += 26 * s + 40 * s;
  ctx.font = `700 ${42 * s}px ${f.isi}`;
  for(const b of k.isi.baris){
    y += 58 * s;
    gambarBarisKaya(ctx, b, cx, y - 14 * s, k.isi.lebarSpasi, TEMPLATE.warna.tinta);
  }
  return y;
}

function gambarButir(ctx, k, x, y, lebar){
  ctx.fillStyle = TEMPLATE.warna.kotak;
  kotakBulat(ctx, x, y, lebar, k.tinggi, 26 * k.s);
  ctx.fill();
  let cy = y + k.pad;
  const cx = x + lebar / 2;
  for(const b of k.baris){
    cy += b.tinggi;
    ctx.font = b.font;
    gambarBarisKaya(ctx, b.b, cx, cy - b.tinggi * 0.26, b.lebarSpasi, b.warna);
  }
}

function hitungArea(){
  const { w, h } = TEMPLATE;
  const a = tpl.area;
  const x0 = w * a.kiri / 100, x1 = w * (1 - a.kanan / 100);
  const y0 = h * a.atas / 100, y1 = h * a.bawah / 100;
  return { x0, x1, y0, y1, lebar: x1 - x0, tinggi: y1 - y0 };
}

const JARAK_DAFTAR = 38;   // jarak isi ke daftar
const JARAK_BUTIR = 18;

function tinggiHalaman(kepala, butir, s){
  if(!butir.length) return kepala.tinggi;
  return kepala.tinggi + JARAK_DAFTAR * s
    + butir.reduce((n, b) => n + b.tinggi, 0) + JARAK_BUTIR * s * (butir.length - 1);
}

/*
  Diutamakan semuanya muat dalam satu gambar, bila perlu dengan huruf
  diperkecil. Bila tetap tidak muat, daftar dibagi ke beberapa gambar dengan
  judul dan kalimat pembuka yang sama di tiap gambar.
*/
function bagiHalaman(ctx, konten, area){
  const daftar = konten.daftar || [];
  for(const s of [1, 0.92, 0.85, 0.78, 0.72]){
    const kepala = susunKepala(ctx, konten, area.lebar, s);
    const butir = daftar.map(b => susunButir(ctx, b, area.lebar, s));
    if(tinggiHalaman(kepala, butir, s) <= area.tinggi) return { kepala, halaman: [butir] };
  }

  const s = 0.72;
  const kepala = susunKepala(ctx, konten, area.lebar, s);
  const semua = daftar.map(b => susunButir(ctx, b, area.lebar, s));
  const halaman = [];
  let kini = [];
  for(const b of semua){
    if(kini.length && tinggiHalaman(kepala, [...kini, b], s) > area.tinggi){
      halaman.push(kini); kini = [];
    }
    kini.push(b);
  }
  if(kini.length) halaman.push(kini);

  // Ratakan jumlah kotak per gambar bila masih muat, supaya gambar terakhir
  // tidak hanya berisi satu kotak.
  const per = Math.ceil(semua.length / halaman.length);
  const rata = [];
  for(let i = 0; i < semua.length; i += per) rata.push(semua.slice(i, i + per));
  const pakai = rata.length === halaman.length && rata.every(h => tinggiHalaman(kepala, h, s) <= area.tinggi)
    ? rata : halaman;
  return { kepala, halaman: pakai };
}

/*
  Menghasilkan daftar kanvas story.
  opsi.panduan: gambar garis putus-putus di batas area teks (untuk pratinjau
  di tab Upload dan Download, tidak untuk gambar yang diunduh).
*/
export async function buatStory(konten, opsi = {}){
  if(!tpl.gambar) throw new Error('Belum ada template story. Upload dulu di tab Upload dan Download.');
  await siapkanFont();
  const area = hitungArea();
  const ukur = document.createElement('canvas').getContext('2d');
  const { kepala, halaman } = bagiHalaman(ukur, konten, area);

  return halaman.map((butir, i) => {
    const kanvas = document.createElement('canvas');
    kanvas.width = TEMPLATE.w; kanvas.height = TEMPLATE.h;
    const ctx = kanvas.getContext('2d');
    gambarLatar(ctx);

    if(opsi.panduan){
      ctx.save();
      ctx.setLineDash([18, 12]);
      ctx.strokeStyle = '#E0457B';
      ctx.lineWidth = 4;
      ctx.strokeRect(area.x0, area.y0, area.lebar, area.tinggi);
      ctx.restore();
    }

    const s = kepala.s;
    const total = tinggiHalaman(kepala, butir, s);
    const cx = area.x0 + area.lebar / 2;
    let y = area.y0 + Math.max(0, (area.tinggi - total) / 2);
    y = gambarKepala(ctx, kepala, cx, y);
    if(butir.length) y += JARAK_DAFTAR * s;
    for(const b of butir){
      gambarButir(ctx, b, area.x0, y, area.lebar);
      y += b.tinggi + JARAK_BUTIR * s;
    }

    if(halaman.length > 1){
      ctx.font = `700 ${26}px ${TEMPLATE.font.isi}`;
      ctx.fillStyle = TEMPLATE.warna.tintaLembut;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${i + 1}/${halaman.length}`, area.x1, area.y1 + 34);
      ctx.textAlign = 'left';
    }
    return kanvas;
  });
}

/* ============================================================
   Jendela pratinjau: ubah teks, unduh, salin, bagikan
   ============================================================ */

const $ = id => document.getElementById(id);
const keBlob = kanvas => new Promise(res => kanvas.toBlob(res, 'image/png'));

let kini = { konten: null, kanvas: [], namaDasar: 'kafbe-story' };
let jedaGambar = null;

function pesanIg(teks, jenis){
  const el = $('igPesan');
  el.textContent = teks || '';
  el.className = 'op-pesan' + (teks ? ' tampil' : '') + (teks && jenis ? ' ' + jenis : '');
}

function namaBerkas(i){
  const n = kini.kanvas.length > 1 ? `-${i + 1}` : '';
  return `${kini.namaDasar}${n}.png`;
}

export function unduhBlobSebagai(blob, nama){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function unduh(i){
  unduhBlobSebagai(await keBlob(kini.kanvas[i]), namaBerkas(i));
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
  const konten = { ...kini.konten, judul: $('igJudulTeks').value, isi: $('igIsiTeks').value };
  try{
    kini.kanvas = await buatStory(konten);
  }catch(err){
    console.error(err);
    pesanIg('Gagal menyusun gambar: ' + err.message, 'salah');
    return;
  }

  const bagi = bisaBagikanBerkas();
  const banyak = kini.kanvas.length > 1;
  const n = (kini.konten.daftar || []).length;
  $('igRingkas').textContent = `${n ? n + ' kelas · ' : ''}${kini.kanvas.length} gambar story 1080 × 1920`;
  $('igUnduhSemua').hidden = !banyak;
  $('igBagikanSemua').hidden = !(banyak && bagi);

  wadah.innerHTML = '';
  kini.kanvas.forEach((kanvas, i) => {
    const kartu = document.createElement('figure');
    kartu.className = 'op-ig-hasil';
    const img = document.createElement('img');
    img.src = kanvas.toDataURL('image/png');
    img.alt = `Pratinjau story ${i + 1}`;
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

function jadwalkanGambar(){
  clearTimeout(jedaGambar);
  jedaGambar = setTimeout(gambarUlang, 350);
}

let terpasang = false;
function pasang(){
  if(terpasang) return;
  terpasang = true;
  $('igJudulTeks').addEventListener('input', jadwalkanGambar);
  $('igIsiTeks').addEventListener('input', jadwalkanGambar);
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
  Membuka jendela pratinjau. Judul dan kalimat pembuka bisa disunting di
  jendela itu sebelum gambarnya diunduh.
*/
export function bukaStory(konten, namaDasar){
  pasang();
  kini = { konten, kanvas: [], namaDasar: namaDasar || 'kafbe-story' };
  $('igJudulTeks').value = konten.judul || '';
  $('igIsiTeks').value = konten.isi || '';
  $('igPratinjau').innerHTML = '<p class="op-samar">Menyusun gambar…</p>';
  pesanIg('');
  $('dialogIg').showModal();
  gambarUlang();
}
