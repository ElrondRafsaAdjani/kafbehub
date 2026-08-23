/*
  Pemeriksa susunan halaman HTML.

  KENAPA BERKAS INI ADA

  Sebuah penyuntingan massal pernah memotong satu kartu di beranda tepat di
  tengah: penanda penutup </div> milik kartu itu tertinggal, lalu menutup kisi
  kartunya lebih awal. Akibatnya dua kartu di bawahnya terlempar keluar kisi
  dan tampil melebar tanpa bingkai, sementara judul serta keterangan lama
  menggantung di antara kartu tanpa kotak sama sekali.

  Yang membuatnya lolos adalah cara memeriksanya: yang dihitung waktu itu
  cuma "apakah teks barunya ada", dan teks barunya memang ada. Susunannya yang
  rusak, bukan isinya.

  Berkas ini memeriksa hal yang tidak terlihat dari sekadar mencari teks:

    1. Jumlah <div> dan </div> harus sama persis. Satu penutup yang berlebih
       sudah cukup merusak seluruh tata letak di bawahnya.
    2. Satu kunci data-teks hanya boleh muncul sekali dalam satu halaman.
       Kunci kembar berarti panel admin akan menyimpan salah satunya saja
       tanpa ketahuan yang mana.
    3. Tiap halaman publik harus punya <script> pencatat kunjungan, lambang
       tab, dan penerap pengaturan situs.

  CARA MENJALANKAN SENDIRI:  node scripts/periksa-halaman.mjs
  Keluar dengan kode 1 kalau ada yang bermasalah, sehingga GitHub Actions
  menandai commit-nya gagal.
*/

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const AKAR = process.cwd();

// Halaman pengurus sengaja tidak mencatat kunjungan dan tidak perlu diperiksa
// untuk syarat itu.
const HALAMAN_PENGURUS = new Set(['adminkafbe.html', 'operasional.html']);

/*
  Halaman yang sengaja dinonaktifkan: tidak ditautkan dari mana pun, diberi
  noindex, dan menunggu ditinjau. Berkasnya sengaja tidak ikut dipasangi
  pencatat kunjungan maupun penerap pengaturan situs, jadi tidak perlu
  dilaporkan sebagai kekurangan.

  Kalau suatu hari halaman ini diaktifkan lagi, hapus barisnya dari sini, lalu
  jalankan ulang pemeriksa ini untuk tahu apa saja yang masih perlu dipasang.
*/
const SENGAJA_NONAKTIF = new Set(['mki-kelayakan.html']);

function semuaHtml(dir, keluar = []){
  for(const nama of readdirSync(dir)){
    if(nama === '.git' || nama === 'node_modules') continue;
    const jalur = join(dir, nama);
    if(statSync(jalur).isDirectory()) semuaHtml(jalur, keluar);
    else if(nama.endsWith('.html')) keluar.push(jalur);
  }
  return keluar;
}

const masalah = [];

for(const jalur of semuaHtml(AKAR)){
  const nama = relative(AKAR, jalur).replace(/\\/g, '/');
  const isi = readFileSync(jalur, 'utf8');
  const lapor = (pesan) => masalah.push(`${nama}: ${pesan}`);

  // 1. Keseimbangan <div>
  const buka  = (isi.match(/<div\b/g) || []).length;
  const tutup = (isi.match(/<\/div>/g) || []).length;
  if(buka !== tutup){
    lapor(`penanda div tidak seimbang, ${buka} pembuka dan ${tutup} penutup`);
  }

  // 2. Kunci data-teks kembar
  const hitung = {};
  for(const m of isi.matchAll(/data-teks="([^"]+)"/g)){
    hitung[m[1]] = (hitung[m[1]] || 0) + 1;
  }
  const kembar = Object.keys(hitung).filter(k => hitung[k] > 1);
  if(kembar.length) lapor(`kunci data-teks dipakai lebih dari sekali: ${kembar.join(', ')}`);

  // 3. Kelengkapan halaman publik
  const berkas = nama.split('/').pop();
  if(!HALAMAN_PENGURUS.has(berkas) && !SENGAJA_NONAKTIF.has(berkas)){
    if(!isi.includes('/shared/kunjungan.js')) lapor('pencatat kunjungan belum dipasang');
    if(!isi.includes('/shared/situs.js'))     lapor('penerap pengaturan situs belum dipasang');
  }
  if(!isi.includes('favicon.svg')) lapor('lambang tab belum dipasang');
}

if(masalah.length){
  console.error('Ada ' + masalah.length + ' hal yang perlu diperbaiki:\n');
  masalah.forEach(m => console.error('  - ' + m));
  process.exit(1);
}

console.log('Susunan seluruh halaman HTML sudah benar.');
