/*
  Pembuat gambar Story Instagram (SG) untuk pengumuman perubahan jadwal.

  Cara kerjanya meniru Canva: di atas template story yang diunggah tim ada
  TIGA kotak teks yang berdiri sendiri, masing-masing bisa digeser, dilebarkan,
  dan disunting tulisannya:

    header : judul, misalnya JADWAL PERPINDAHAN SEMENTARA
    body   : kalimat pembuka lalu daftar kelas yang berubah
    footer : misalnya TERIMA KASIH (boleh kosong bila sudah ada di template)

  Isi awalnya disusun dari data jadwal oleh operasional.js. Dulu jadwal
  pengganti ditempel sebagai tangkapan layar tabel Excel; kini ditulis
  langsung sebagai teks, jadi tetap terbaca di layar ponsel.

  Tidak ada yang dikirim ke Instagram dari sini. Gambar diunduh, disalin, atau
  dibagikan lewat menu bagikan ponsel, lalu diunggah sendiri oleh pengurus.

  ATURAN PENULISAN
    - *kata*          ditulis dengan warna sekunder
    - baris kosong    memisahkan paragraf di body. Paragraf pertama adalah
                      kalimat pembuka; paragraf berikutnya adalah daftar kelas,
                      ditulis sedikit lebih kecil dan (bila diaktifkan) diberi
                      kotak berwarna di belakangnya

  TEMPLATE DAN PENGATURAN

  Latarnya selalu template yang diunggah tim di tab PR (disimpan di
  Firestore, koleksi templateig). Template diunggah sekali dan dipakai
  sepanjang satu periode kepengurusan; periode berikutnya cukup mengunggah
  template baru. Batik, logo, pita PENGUMUMAN, kartu putih, ornamen, dan
  slogan sudah ada di gambar template, jadi yang digambar di sini hanya teks
  dan kotak daftar kelas.

  Di tab PR diatur posisi awal ketiga kotak teks, ukuran hurufnya, font
  primer (header dan footer) dan sekunder (body) dari Google Fonts
  (lihat shared/daftar-font.js), warna primer dan sekunder, warna kotak, dan
  teks footer bawaan. Posisi yang digeser di jendela story hanya berlaku
  untuk story itu.
*/

export const TEMPLATE = {
  w: 1080,
  h: 1920,

  // Posisi dan lebar dalam persen dari ukuran gambar; ukuran huruf dalam
  // piksel pada gambar 1080 x 1920. Body punya tinggi sendiri (h): bila
  // isinya melebihi tinggi itu, hurufnya diperkecil, lalu bila masih belum
  // muat, daftar kelasnya dibagi ke beberapa gambar.
  elemenBawaan: {
    header: { x: 15, y: 20.5, w: 70, ukuran: 88 },
    body:   { x: 12, y: 33,   w: 76, h: 44, ukuran: 44 },
    footer: { x: 15, y: 80,   w: 70, ukuran: 66 },
  },
  fontBawaan:   { primer: 'Lilita One', sekunder: 'Fredoka' },
  warnaBawaan:  { primer: '#13192f', sekunder: '#be8f41' },
  kotakBawaan:  { aktif: true, warna: '#F7F1E4' },
  footerTeksBawaan: '',
};

export const NAMA_ELEMEN = ['header', 'body', 'footer'];

/* ============================================================
   Keadaan template yang sedang dipakai
   ============================================================ */

let tpl = susunTpl({});

// Mengisi nilai kosong dengan bawaannya, supaya kolom yang dikosongkan di
// tab PR tidak membuat teks hilang.
function lengkapi(nilai, bawaan){
  const out = { ...bawaan };
  for(const [k, v] of Object.entries(nilai || {})){
    if(v !== '' && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

export function lengkapiElemen(elemen){
  const out = {};
  for(const n of NAMA_ELEMEN) out[n] = lengkapi(elemen?.[n], TEMPLATE.elemenBawaan[n]);
  return out;
}

function susunTpl(isi){
  return {
    gambar: isi.gambar || null,
    elemen: lengkapiElemen(isi.elemen),
    font:   lengkapi(isi.font, TEMPLATE.fontBawaan),
    warna:  lengkapi(isi.warna, TEMPLATE.warnaBawaan),
    kotak:  lengkapi(isi.kotak, TEMPLATE.kotakBawaan),
    footerTeks: typeof isi.footerTeks === 'string' ? isi.footerTeks : TEMPLATE.footerTeksBawaan,
  };
}

/*
  Dipanggil oleh operasional.js setelah template dari Firestore dimuat, dan
  setiap kali isian di tab PR berubah (untuk pratinjau).
  isi: { gambar, elemen, font, warna, kotak, footerTeks }
*/
export function aturTemplate(isi = {}){
  tpl = susunTpl(isi);
}

export const adaTemplate = () => !!tpl.gambar;
export const elemenTemplate = () => lengkapiElemen(tpl.elemen);

/* ============================================================
   Font dari Google Fonts
   ============================================================

   Lembar gaya font dipasang saat dibutuhkan. Ketebalan yang tersedia
   berbeda-beda (Lilita One hanya punya satu), sedangkan Google Fonts menolak
   permintaan ketebalan yang tidak ada. Karena itu ketebalannya diambil dari
   shared/daftar-font.js; untuk nama yang tidak ada di daftar, dicoba dengan
   beberapa ketebalan lalu tanpa ketebalan.
*/

let janjiDaftarFont = null;
export function muatDaftarFont(){
  if(!janjiDaftarFont) janjiDaftarFont = import('./daftar-font.js').then(m => m.DAFTAR_FONT);
  return janjiDaftarFont;
}

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

export function pasangFontGoogle(nama){
  if(!fontDipasang.has(nama)){
    const f = encodeURIComponent(nama).replace(/%20/g, '+');
    fontDipasang.set(nama, (async () => {
      const baris = (await muatDaftarFont()).find(r => r[0] === nama);
      const berat = baris
        ? baris[2].split('').map(d => d + '00').filter(w => w >= 300 && w <= 800)
        : ['400', '500', '600', '700'];
      return (berat.length > 1
          && await pasangLink(`https://fonts.googleapis.com/css2?family=${f}:wght@${berat.join(';')}&display=swap`))
        || await pasangLink(`https://fonts.googleapis.com/css2?family=${f}&display=swap`);
    })());
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

function gambarBarisKaya(ctx, b, cx, y, lebarSpasi){
  let x = cx - b.lebar / 2;
  for(const k of b.kata){
    if(k.spasi) x += lebarSpasi;
    ctx.fillStyle = k.sorot ? tpl.warna.sekunder : tpl.warna.primer;
    ctx.fillText(k.k, x, y);
    x += k.w;
  }
}

/* ============================================================
   Susunan ketiga kotak teks
   ============================================================ */

// Satu blok = beberapa baris dengan font dan ukuran yang sama.
function susunBlok(ctx, teks, font, px, lh, lebar){
  ctx.font = font;
  const { baris, lebarSpasi } = barisKaya(ctx, teks, lebar);
  const tinggiBaris = px * lh;
  return { baris, lebarSpasi, font, tinggiBaris, tinggi: baris.length * tinggiBaris };
}

function gambarBlok(ctx, blok, cx, y){
  ctx.font = blok.font;
  ctx.textBaseline = 'alphabetic';
  for(const b of blok.baris){
    y += blok.tinggiBaris;
    gambarBarisKaya(ctx, b, cx, y - blok.tinggiBaris * 0.24, blok.lebarSpasi);
  }
  return y;
}

function persenKePx(el){
  const { w, h } = TEMPLATE;
  return { x: w * el.x / 100, y: h * el.y / 100, w: w * el.w / 100, h: el.h != null ? h * el.h / 100 : null };
}

function susunSatuBaris(ctx, teks, el, fontNama, bobot){
  const px = Number(el.ukuran) || 40;
  const r = persenKePx(el);
  const blok = susunBlok(ctx, teks, `${ketebalan(fontNama, bobot)} ${px}px ${css(fontNama)}`, px, 1.1, r.w);
  return { blok, r };
}

// Paragraf body: yang pertama kalimat pembuka, sisanya daftar kelas.
function pecahParagraf(teks){
  return String(teks || '').split(/\n[ \t]*\n+/).map(p => p.replace(/^\n+|\n+$/g, '')).filter(p => p.trim());
}

function susunBody(ctx, paragraf, el, s){
  const r = persenKePx(el);
  const px = (Number(el.ukuran) || 44) * s;
  const pxDaftar = px * 0.8;
  const f = tpl.font.sekunder;
  const kotak = tpl.kotak.aktif;
  const pad = kotak ? 22 * s : 0;
  const bagian = paragraf.map((p, i) => {
    if(i === 0){
      const blok = susunBlok(ctx, p, `${ketebalan(f, 600)} ${px}px ${css(f)}`, px, 1.3, r.w);
      return { blok, pad: 0, tinggi: blok.tinggi, kotak: false };
    }
    const blok = susunBlok(ctx, p, `${ketebalan(f, 600)} ${pxDaftar}px ${css(f)}`, pxDaftar, 1.3, r.w - pad * 2);
    return { blok, pad, tinggi: blok.tinggi + pad * 2, kotak };
  });
  return { bagian, jarakPembuka: px * 0.8, jarakDaftar: kotak ? 16 * s : px * 0.55, r, s };
}

function tinggiBody(susun, bagian){
  if(!bagian.length) return 0;
  let t = bagian[0].tinggi;
  for(let i = 1; i < bagian.length; i++){
    t += (i === 1 ? susun.jarakPembuka : susun.jarakDaftar) + bagian[i].tinggi;
  }
  return t;
}

/*
  Diutamakan seluruh body muat dalam satu gambar, bila perlu dengan huruf
  diperkecil. Bila tetap tidak muat, daftar kelas dibagi ke beberapa gambar,
  dengan kalimat pembuka, header, dan footer yang sama di tiap gambar.
*/
function bagiBody(ctx, teks, el){
  const paragraf = pecahParagraf(teks);
  const batas = persenKePx(el).h;
  for(const s of [1, 0.92, 0.85, 0.78, 0.72, 0.66]){
    const susun = susunBody(ctx, paragraf, el, s);
    if(tinggiBody(susun, susun.bagian) <= batas) return { susun, halaman: [susun.bagian] };
  }
  const susun = susunBody(ctx, paragraf, el, 0.72);
  const [pembuka, ...daftar] = susun.bagian;
  if(!daftar.length) return { susun, halaman: [susun.bagian] };
  const halaman = [];
  let kini = [pembuka];
  for(const b of daftar){
    if(kini.length > 1 && tinggiBody(susun, [...kini, b]) > batas){ halaman.push(kini); kini = [pembuka]; }
    kini.push(b);
  }
  halaman.push(kini);

  // Ratakan jumlah kelas per gambar bila masih muat, supaya gambar terakhir
  // tidak hanya berisi satu kelas.
  const per = Math.ceil(daftar.length / halaman.length);
  const rata = [];
  for(let i = 0; i < daftar.length; i += per) rata.push([pembuka, ...daftar.slice(i, i + per)]);
  const pakai = rata.length === halaman.length && rata.every(h => tinggiBody(susun, h) <= batas) ? rata : halaman;
  return { susun, halaman: pakai };
}

function gambarBody(ctx, susun, bagian){
  const { r } = susun;
  const cx = r.x + r.w / 2;
  let y = r.y;
  bagian.forEach((b, i) => {
    if(i > 0) y += i === 1 ? susun.jarakPembuka : susun.jarakDaftar;
    if(b.kotak){
      ctx.fillStyle = tpl.kotak.warna;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(r.x, y, r.w, b.tinggi, 24 * susun.s);
      else ctx.rect(r.x, y, r.w, b.tinggi);
      ctx.fill();
    }
    gambarBlok(ctx, b.blok, cx, y + b.pad);
    y += b.tinggi;
  });
}

function gambarLatar(ctx){
  const { w, h } = TEMPLATE;
  const img = tpl.gambar;
  const r = Math.max(w / img.width, h / img.height);
  const lw = img.width * r, lh = img.height * r;
  ctx.drawImage(img, (w - lw) / 2, (h - lh) / 2, lw, lh);
}

/*
  Menghasilkan daftar kanvas story.

  teks   : { header, body, footer }
  elemen : posisi ketiga kotak (bawaan: posisi dari tab PR)

  Tiap kanvas membawa kanvas.tataLetak, yaitu kotak yang benar-benar dipakai
  tiap elemen dalam piksel, untuk menempatkan penanda seret di pratinjau.
*/
export async function buatStory(teks, elemen = tpl.elemen){
  if(!tpl.gambar) throw new Error('Belum ada template story. Upload dulu di tab PR.');
  await siapkanFont();
  const el = lengkapiElemen(elemen);
  const ukur = document.createElement('canvas').getContext('2d');

  const header = susunSatuBaris(ukur, teks.header, el.header, tpl.font.primer, 700);
  const footer = susunSatuBaris(ukur, teks.footer, el.footer, tpl.font.primer, 700);
  const { susun, halaman } = bagiBody(ukur, teks.body, el.body);

  const tataLetak = {
    header: { ...header.r, h: Math.max(header.blok.tinggi, el.header.ukuran * 1.1) },
    body:   { ...susun.r },
    footer: { ...footer.r, h: Math.max(footer.blok.tinggi, el.footer.ukuran * 1.1), kosong: !String(teks.footer || '').trim() },
  };

  return halaman.map((bagian, i) => {
    const kanvas = document.createElement('canvas');
    kanvas.width = TEMPLATE.w; kanvas.height = TEMPLATE.h;
    const ctx = kanvas.getContext('2d');
    gambarLatar(ctx);
    gambarBlok(ctx, header.blok, header.r.x + header.r.w / 2, header.r.y);
    gambarBody(ctx, susun, bagian);
    gambarBlok(ctx, footer.blok, footer.r.x + footer.r.w / 2, footer.r.y);

    if(halaman.length > 1){
      const f = tpl.font.sekunder;
      ctx.font = `${ketebalan(f, 600)} 26px ${css(f)}`;
      ctx.fillStyle = tpl.warna.primer;
      ctx.textAlign = 'right';
      ctx.fillText(`${i + 1}/${halaman.length}`, susun.r.x + susun.r.w, susun.r.y + susun.r.h + 34);
      ctx.textAlign = 'left';
    }
    kanvas.tataLetak = tataLetak;
    return kanvas;
  });
}

/*
  Mengubah isi pengumuman yang disusun operasional.js menjadi teks ketiga
  kotak. konten = { judul, isi, daftar: [{ judul, baris: [{ teks }] }] }
*/
export function keTeksStory(konten){
  const daftar = (konten.daftar || []).map(b => [
    b.judul ? `*${b.judul}*` : '',
    ...(b.baris || []).map(x => x.teks),
  ].filter(Boolean).join('\n'));
  return {
    header: String(konten.judul || '').toUpperCase(),
    body: [konten.isi || '', ...daftar].filter(Boolean).join('\n\n'),
    footer: tpl.footerTeks,
  };
}

/* ============================================================
   Penyunting posisi (seperti Canva)
   ============================================================

   Dipasang di atas gambar pratinjau, baik di tab PR maupun di jendela story.
   Ketiga kotak teks tampil sebagai bingkai: seret bagian dalamnya untuk
   memindahkan, seret pegangan kiri/kanan untuk mengubah lebar, dan pegangan
   bawah body untuk mengubah tingginya. Mengeklik bingkai memilih elemen itu
   (misalnya untuk memusatkan kotak isiannya).

   opsi = {
     ambil()          : posisi elemen saat ini (persen)
     ubah(elemen)     : dipanggil selama diseret, dengan posisi baru
     selesai()        : dipanggil saat seretan dilepas (gambar ulang)
     pilih(nama)      : dipanggil saat bingkai diklik
   }
*/
const LABEL_ELEMEN = { header: 'Header', body: 'Body', footer: 'Footer' };

export function pasangPenyunting(bingkai, opsi){
  bingkai.classList.add('op-penyunting');
  const kotak = {};
  let tataLetak = null;
  let terpilih = null;

  for(const nama of NAMA_ELEMEN){
    const el = document.createElement('div');
    el.className = `op-el op-el-${nama}`;
    el.innerHTML = `<span class="op-el-label">${LABEL_ELEMEN[nama]}</span>
      <span class="op-el-sisi kiri" data-sisi="kiri"></span>
      <span class="op-el-sisi kanan" data-sisi="kanan"></span>
      ${nama === 'body' ? '<span class="op-el-sisi bawah" data-sisi="bawah"></span>' : ''}`;
    el.hidden = true;
    bingkai.appendChild(el);
    kotak[nama] = el;
    el.addEventListener('pointerdown', e => mulai(e, nama, e.target.dataset.sisi || 'geser'));
  }

  function tandai(nama){
    terpilih = nama;
    for(const n of NAMA_ELEMEN) kotak[n].classList.toggle('terpilih', n === nama);
  }

  // Tinggi header dan footer mengikuti isi teksnya, jadi diambil dari hasil
  // penggambaran terakhir; posisinya diambil dari nilai persen terkini.
  function tempatkan(elemen){
    if(!tataLetak) return;
    const { w, h } = TEMPLATE;
    for(const n of NAMA_ELEMEN){
      const k = kotak[n], e = elemen[n], t = tataLetak[n];
      k.hidden = n === 'footer' && t.kosong;
      k.style.left = e.x + '%';
      k.style.top = e.y + '%';
      k.style.width = e.w + '%';
      k.style.height = (n === 'body' ? e.h : t.h / h * 100) + '%';
    }
  }

  function mulai(e, nama, jenis){
    if(e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    tandai(nama);
    opsi.pilih?.(nama);
    const rect = bingkai.getBoundingClientRect();
    const awal = lengkapiElemen(opsi.ambil());
    const x0 = e.clientX, y0 = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let bergerak = false;

    const gerak = ev => {
      const dx = (ev.clientX - x0) / rect.width * 100;
      const dy = (ev.clientY - y0) / rect.height * 100;
      if(Math.abs(dx) + Math.abs(dy) > 0.2) bergerak = true;
      const baru = lengkapiElemen(awal);
      const a = { ...awal[nama] };
      const bulat = n => Math.round(n * 10) / 10;
      const batasi = (n, min, max) => Math.min(max, Math.max(min, n));
      if(jenis === 'geser'){
        a.x = bulat(batasi(awal[nama].x + dx, -a.w / 2, 100 - a.w / 2));
        a.y = bulat(batasi(awal[nama].y + dy, 0, 98));
      }else if(jenis === 'kiri'){
        const kanan = awal[nama].x + awal[nama].w;
        a.x = bulat(batasi(awal[nama].x + dx, 0, kanan - 15));
        a.w = bulat(kanan - a.x);
      }else if(jenis === 'kanan'){
        a.w = bulat(batasi(awal[nama].w + dx, 15, 100 - a.x));
      }else if(jenis === 'bawah'){
        a.h = bulat(batasi(awal[nama].h + dy, 8, 100 - a.y));
      }
      baru[nama] = a;
      opsi.ubah(baru);
      tempatkan(baru);
    };
    const lepas = () => {
      target.removeEventListener('pointermove', gerak);
      target.removeEventListener('pointerup', lepas);
      target.removeEventListener('pointercancel', lepas);
      if(bergerak) opsi.selesai();
    };
    target.addEventListener('pointermove', gerak);
    target.addEventListener('pointerup', lepas);
    target.addEventListener('pointercancel', lepas);
  }

  return {
    // Dipanggil setiap kali pratinjau selesai digambar ulang.
    perbarui(baru){ tataLetak = baru; tempatkan(lengkapiElemen(opsi.ambil())); },
    pilih(nama){ tandai(nama); },
    get terpilih(){ return terpilih; },
  };
}

/* ============================================================
   Jendela story: sunting teks, geser posisi, unduh, salin, bagikan
   ============================================================ */

const $ = id => document.getElementById(id);
const keBlob = kanvas => new Promise(res => kanvas.toBlob(res, 'image/png'));

const ID_TEKS = { header: 'igTeksHeader', body: 'igTeksBody', footer: 'igTeksFooter' };

let kini = { elemen: null, kanvas: [], namaDasar: 'kafbe-story' };
let jedaGambar = null;
let penyuntingDialog = null;
let nomorGambar = 0;

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

const teksDialog = () => ({
  header: $(ID_TEKS.header).value, body: $(ID_TEKS.body).value, footer: $(ID_TEKS.footer).value,
});

function tombolAksi(i, banyak, bagi){
  const aksi = document.createElement('div');
  aksi.className = 'op-tombol-baris op-ig-aksi';
  aksi.innerHTML = `
    ${banyak ? `<span class="op-samar">${i + 1}/${kini.kanvas.length}</span>` : ''}
    <button type="button" class="op-mini" data-ig="unduh">Unduh</button>
    <button type="button" class="op-mini" data-ig="salin">Salin</button>
    ${bagi ? '<button type="button" class="op-mini" data-ig="bagikan">Bagikan</button>' : ''}`;
  aksi.querySelector('[data-ig="unduh"]').addEventListener('click', () => unduh(i));
  aksi.querySelector('[data-ig="salin"]').addEventListener('click', () => salin(i));
  aksi.querySelector('[data-ig="bagikan"]')?.addEventListener('click', () => bagikan(i));
  return aksi;
}

async function gambarUlang(){
  const nomor = ++nomorGambar;
  let kanvas;
  try{
    kanvas = await buatStory(teksDialog(), kini.elemen);
  }catch(err){
    console.error(err);
    pesanIg('Gagal menyusun gambar: ' + err.message, 'salah');
    return;
  }
  if(nomor !== nomorGambar) return;
  kini.kanvas = kanvas;

  const bagi = bisaBagikanBerkas();
  const banyak = kanvas.length > 1;
  $('igRingkas').textContent = `${kanvas.length} gambar story 1080 × 1920`
    + (banyak ? ' · daftar kelas terlalu panjang untuk satu gambar, jadi dibagi' : '');
  $('igUnduhSemua').hidden = !banyak;
  $('igBagikanSemua').hidden = !(banyak && bagi);

  // Gambar pertama memakai bingkai yang sama sepanjang jendela terbuka,
  // supaya penanda seretnya tidak ikut dibuat ulang.
  $('igUtama').src = kanvas[0].toDataURL('image/png');
  $('igUtamaAksi').replaceChildren(tombolAksi(0, banyak, bagi));
  penyuntingDialog.perbarui(kanvas[0].tataLetak);

  const lain = $('igLainnya');
  lain.innerHTML = '';
  kanvas.slice(1).forEach((k, n) => {
    const fig = document.createElement('figure');
    fig.className = 'op-ig-hasil';
    const img = document.createElement('img');
    img.src = k.toDataURL('image/png');
    img.alt = `Pratinjau story ${n + 2}`;
    fig.append(img, tombolAksi(n + 1, banyak, bagi));
    lain.appendChild(fig);
  });
}

function jadwalkanGambar(){
  clearTimeout(jedaGambar);
  jedaGambar = setTimeout(gambarUlang, 300);
}

let terpasang = false;
function pasang(){
  if(terpasang) return;
  terpasang = true;
  for(const id of Object.values(ID_TEKS)) $(id).addEventListener('input', jadwalkanGambar);
  for(const [nama, id] of Object.entries(ID_TEKS)){
    $(id).addEventListener('focus', () => penyuntingDialog.pilih(nama));
  }
  $('igTutup').addEventListener('click', () => $('dialogIg').close());
  $('dialogIg').addEventListener('click', e => { if(e.target === $('dialogIg')) $('dialogIg').close(); });
  $('igPosisiAwal').addEventListener('click', () => { kini.elemen = elemenTemplate(); gambarUlang(); });
  $('igUnduhSemua').addEventListener('click', async () => {
    for(let i = 0; i < kini.kanvas.length; i++){
      await unduh(i);
      // Jeda singkat, sebab sebagian peramban menolak banyak unduhan serentak.
      await new Promise(r => setTimeout(r, 350));
    }
  });
  $('igBagikanSemua').addEventListener('click', () => bagikan('semua'));

  penyuntingDialog = pasangPenyunting($('igBingkai'), {
    ambil: () => kini.elemen,
    ubah: e => { kini.elemen = e; },
    selesai: gambarUlang,
    pilih: nama => {
      const el = $(ID_TEKS[nama]);
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
}

/*
  Membuka jendela story. konten disusun operasional.js (lihat keTeksStory).
  Ketiga teks bisa disunting dan posisinya digeser sebelum gambar diunduh;
  perubahan posisi di sini hanya berlaku untuk story ini.
*/
export function bukaStory(konten, namaDasar){
  pasang();
  kini = { elemen: elemenTemplate(), kanvas: [], namaDasar: namaDasar || 'kafbe-story' };
  const teks = keTeksStory(konten);
  for(const n of NAMA_ELEMEN) $(ID_TEKS[n]).value = teks[n];
  $('igLainnya').innerHTML = '';
  pesanIg('');
  $('dialogIg').showModal();
  gambarUlang();
}
