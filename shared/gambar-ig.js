/*
  Pembuat gambar Story Instagram (SG) untuk pengumuman perubahan jadwal.

  Admin operasional memilih perubahan sementara, atau baru saja memindah
  jadwal permanen, lalu berkas ini MENEMPELKAN TEKS pengumumannya ke template
  story yang diunggah tim di tab PR:

    [judul, misalnya JADWAL PERPINDAHAN SEMENTARA]
    [kalimat pembuka, bagian bertanda *...* diberi warna sekunder]
    [daftar kelas yang berubah]

  Dulu jadwal pengganti ditempel sebagai tangkapan layar tabel Excel. Karena
  datanya kini sudah ada di KAFBE Hub, daftar itu ditulis langsung sebagai
  teks, jadi tetap terbaca di layar ponsel.

  Tidak ada yang dikirim ke Instagram dari sini. Gambar diunduh, disalin, atau
  dibagikan lewat menu bagikan ponsel, lalu diunggah sendiri oleh pengurus.

  TEMPLATE DAN GAYA TEKS

  Latarnya selalu template yang diunggah tim di tab PR (disimpan di
  Firestore, koleksi templateig). Template diunggah sekali dan dipakai
  sepanjang satu periode kepengurusan; periode berikutnya cukup mengunggah
  template baru untuk menggantikannya.

  Berkas ini tidak menggambar apa pun selain teks. Batik, logo, pita
  PENGUMUMAN, kartu putih, ornamen emas, TERIMA KASIH, dan slogan sudah ada di
  gambar template. Teks ditulis di dalam "area teks" yang batasnya diatur di
  tab PR, jadi di template bagian itu harus dikosongkan.

  Font dan warnanya juga diatur di tab PR:
    - font primer    : judul
    - font sekunder  : kalimat pembuka dan daftar kelas
    - warna primer   : seluruh teks biasa
    - warna sekunder : kata yang diapit *...* dan nama kelas di daftar
  Font diambil dari Google Fonts sesuai nama yang ditulis di sana.
*/

export const TEMPLATE = {
  w: 1080,
  h: 1920,

  // Dipakai bila belum ada pengaturan yang disimpan di tab PR.
  areaBawaan:  { atas: 22, bawah: 79, kiri: 15, kanan: 15 },
  fontBawaan:  { primer: 'Lilita One', sekunder: 'Fredoka' },
  warnaBawaan: { primer: '#13192f', sekunder: '#be8f41' },
};

/* ============================================================
   Keadaan template yang sedang dipakai
   ============================================================ */

let tpl = {
  gambar: null,
  area:  { ...TEMPLATE.areaBawaan },
  font:  { ...TEMPLATE.fontBawaan },
  warna: { ...TEMPLATE.warnaBawaan },
};

// Mengisi nilai kosong dengan bawaannya, supaya kolom yang dikosongkan di tab
// PR tidak membuat teks hilang.
function lengkapi(nilai, bawaan){
  const out = { ...bawaan };
  for(const [k, v] of Object.entries(nilai || {})){
    if(v !== '' && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/*
  Dipanggil oleh operasional.js setelah template dari Firestore dimuat, dan
  setiap kali isian di tab PR berubah (untuk pratinjau).
  gambar: HTMLImageElement, atau null bila belum ada template yang diunggah.
*/
export function aturTemplate({ gambar = null, area = null, font = null, warna = null } = {}){
  tpl = {
    gambar,
    area:  lengkapi(area, TEMPLATE.areaBawaan),
    font:  lengkapi(font, TEMPLATE.fontBawaan),
    warna: lengkapi(warna, TEMPLATE.warnaBawaan),
  };
}

export const adaTemplate = () => !!tpl.gambar;

/* ============================================================
   Font dari Google Fonts
   ============================================================

   Nama font ditulis bebas di tab PR, jadi lembar gayanya dipasang saat
   dibutuhkan. Ketebalan yang tersedia berbeda-beda (Lilita One hanya punya
   satu), sedangkan Google Fonts menolak permintaan ketebalan yang tidak ada.
   Karena itu dicoba dulu dengan beberapa ketebalan, lalu tanpa ketebalan.
*/

const fontDipasang = new Map();   // nama -> Promise<boolean>

function pasangLink(href){
  return new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => res(true);
    l.onerror = () => { l.remove(); res(false); };
    document.head.appendChild(l);
  });
}

function pasangFontGoogle(nama){
  if(!fontDipasang.has(nama)){
    const f = encodeURIComponent(nama).replace(/%20/g, '+');
    fontDipasang.set(nama, (async () =>
      await pasangLink(`https://fonts.googleapis.com/css2?family=${f}:wght@400;500;600;700&display=swap`)
      || await pasangLink(`https://fonts.googleapis.com/css2?family=${f}&display=swap`)
    )());
  }
  return fontDipasang.get(nama);
}

const css = nama => `"${String(nama).replace(/"/g, '')}"`;

// Ketebalan yang benar-benar tersedia paling dekat dengan yang diinginkan,
// supaya font berketebalan tunggal tidak ditebalkan palsu oleh peramban.
function ketebalan(nama, ingin){
  const tersedia = [];
  document.fonts.forEach(f => {
    if(f.family.replace(/["']/g, '') !== nama || f.style !== 'normal') return;
    const [a, b] = String(f.weight).split(/\s+/).map(Number);
    tersedia.push([a, b || a]);
  });
  if(!tersedia.length) return ingin;
  let terbaik = ingin, jarak = Infinity;
  for(const [a, b] of tersedia){
    const w = Math.min(Math.max(ingin, a), b);
    if(Math.abs(w - ingin) < jarak){ jarak = Math.abs(w - ingin); terbaik = w; }
  }
  return terbaik;
}

async function siapkanFont(){
  const { primer, sekunder } = tpl.font;
  await Promise.all([pasangFontGoogle(primer), pasangFontGoogle(sekunder)]);
  try{
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(`400 80px ${css(primer)}`),
      document.fonts.load(`700 80px ${css(primer)}`),
      ...[400, 500, 600, 700].map(w => document.fonts.load(`${w} 40px ${css(sekunder)}`)),
    ]);
  }catch{ /* tetap lanjut dengan font yang ada */ }
}

// Susunan huruf untuk tiap jenis teks, dihitung sekali per penggambaran.
function gaya(s){
  const { primer, sekunder } = tpl.font;
  const f = (nama, ingin, px) => `${ketebalan(nama, ingin)} ${px * s}px ${css(nama)}`;
  return {
    judul:    { font: f(primer, 700, 88),   tinggi: 94 * s },
    isi:      { font: f(sekunder, 600, 44), tinggi: 58 * s },
    kelas:    { font: f(sekunder, 700, 38), tinggi: 48 * s, sekunder: true },
    lembut:   { font: f(sekunder, 500, 31), tinggi: 41 * s },
    tebal:    { font: f(sekunder, 600, 33), tinggi: 43 * s },
    catatan:  { font: f(sekunder, 400, 28), tinggi: 38 * s },
  };
}

/* ---------- Teks berwarna: *kata* memakai warna sekunder ---------- */

function tokenKaya(teks){
  const out = [];
  let sorot = false;
  for(const bag of String(teks || '').split(/(\*)/)){
    if(bag === '*'){ sorot = !sorot; continue; }
    for(const t of bag.split(/(\s+)/)){
      if(!t) continue;
      if(/^\s+$/.test(t)){
        const n = (t.match(/\n/g) || []).length;
        out.push(n ? { br: n } : { spasi: true });
      }else out.push({ k: t, sorot });
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

function gambarBarisKaya(ctx, b, cx, y, lebarSpasi, semuaSekunder){
  let x = cx - b.lebar / 2;
  for(const k of b.kata){
    if(k.spasi) x += lebarSpasi;
    ctx.fillStyle = (semuaSekunder || k.sorot) ? tpl.warna.sekunder : tpl.warna.primer;
    ctx.fillText(k.k, x, y);
    x += k.w;
  }
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

   Semuanya ditulis rata tengah sebagai blok teks yang disusun ke bawah.
*/

// Satu blok = beberapa baris dengan gaya yang sama.
function susunBlok(ctx, teks, g, lebar, hurufBesar = false){
  ctx.font = g.font;
  const { baris, lebarSpasi } = barisKaya(ctx, hurufBesar ? String(teks || '').toUpperCase() : teks, lebar);
  return { baris, lebarSpasi, g, tinggi: baris.length * g.tinggi };
}

function susunKepala(ctx, konten, lebar, s){
  const g = gaya(s);
  const judul = susunBlok(ctx, konten.judul, g.judul, lebar, true);
  const isi = susunBlok(ctx, konten.isi, g.isi, lebar);
  const jarak = judul.tinggi && isi.tinggi ? 34 * s : 0;
  return { blok: [judul, isi], jarak, tinggi: judul.tinggi + jarak + isi.tinggi, s };
}

function susunButir(ctx, butir, lebar, s){
  const g = gaya(s);
  const blok = [];
  if(butir.judul) blok.push(susunBlok(ctx, butir.judul, g.kelas, lebar));
  for(const b of butir.baris || []) blok.push(susunBlok(ctx, b.teks, g[b.gaya] || g.tebal, lebar));
  return { blok, tinggi: blok.reduce((n, b) => n + b.tinggi, 0), s };
}

function gambarBlok(ctx, blok, cx, y){
  ctx.font = blok.g.font;
  ctx.textBaseline = 'alphabetic';
  for(const b of blok.baris){
    y += blok.g.tinggi;
    gambarBarisKaya(ctx, b, cx, y - blok.g.tinggi * 0.24, blok.lebarSpasi, blok.g.sekunder);
  }
  return y;
}

function gambarLatar(ctx){
  const { w, h } = TEMPLATE;
  const img = tpl.gambar;
  const r = Math.max(w / img.width, h / img.height);
  const lw = img.width * r, lh = img.height * r;
  ctx.drawImage(img, (w - lw) / 2, (h - lh) / 2, lw, lh);
}

function hitungArea(){
  const { w, h } = TEMPLATE;
  const a = tpl.area;
  const x0 = w * a.kiri / 100, x1 = w * (1 - a.kanan / 100);
  const y0 = h * a.atas / 100, y1 = h * a.bawah / 100;
  return { x0, x1, y0, y1, lebar: x1 - x0, tinggi: y1 - y0 };
}

const JARAK_DAFTAR = 44;   // jarak kalimat pembuka ke daftar
const JARAK_BUTIR = 30;    // jarak antarkelas di daftar

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

  // Ratakan jumlah kelas per gambar bila masih muat, supaya gambar terakhir
  // tidak hanya berisi satu kelas.
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
  di tab PR, tidak untuk gambar yang diunduh).
*/
export async function buatStory(konten, opsi = {}){
  if(!tpl.gambar) throw new Error('Belum ada template story. Upload dulu di tab PR.');
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
    y = gambarBlok(ctx, kepala.blok[0], cx, y);
    y += kepala.jarak;
    y = gambarBlok(ctx, kepala.blok[1], cx, y);
    if(butir.length) y += JARAK_DAFTAR * s;
    for(const b of butir){
      for(const blok of b.blok) y = gambarBlok(ctx, blok, cx, y);
      y += JARAK_BUTIR * s;
    }

    if(halaman.length > 1){
      ctx.font = `${ketebalan(tpl.font.sekunder, 600)} 26px ${css(tpl.font.sekunder)}`;
      ctx.fillStyle = tpl.warna.primer;
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
