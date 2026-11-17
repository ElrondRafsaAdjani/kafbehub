/*
  Lambang kubu, ikon aksi, dan simbol nilai untuk Agenda Tersembunyi.

  Semuanya digambar sebagai SVG di berkas ini, bukan emoji, supaya tampil
  sama di semua perangkat, tetap tajam di layar proyektor, dan warnanya
  mengikuti warna kubu.

  Setiap lambang berbentuk segel lilin: lingkaran bergerigi berwarna kubu,
  cincin putus putus, lalu gambar kecil di tengahnya. Gambar tengah ditulis
  dalam kotak 48 x 48 dan berwarna krem.
*/

const KREM = '#f4ead3';

// Gambar tengah tiap kubu. Hanya bentuk sederhana supaya terbaca di ukuran kecil.
const GAMBAR = {
  // Berlian Mata Naga
  polisi: `<polygon points="24,9 28.4,19 39,19.6 30.8,26.4 33.5,37 24,31 14.5,37 17.2,26.4 9,19.6 19.6,19" fill="${KREM}"/>
    <circle cx="24" cy="24" r="4" fill="currentColor"/>`,
  kucing: `<path d="M12 36 L12 16 L18 22 Q24 19 30 22 L36 16 L36 36 Q24 42 12 36 Z" fill="${KREM}"/>
    <ellipse cx="19" cy="28" rx="2.2" ry="3" fill="currentColor"/><ellipse cx="29" cy="28" rx="2.2" ry="3" fill="currentColor"/>
    <path d="M22.5 33 L24 34.5 L25.5 33" stroke="currentColor" stroke-width="1.5" fill="none"/>`,
  fajar: `<rect x="10" y="12" width="28" height="24" rx="2" fill="${KREM}"/>
    <rect x="13" y="15" width="22" height="5" fill="currentColor"/>
    <rect x="13" y="23" width="10" height="9" fill="currentColor" opacity=".55"/>
    <path d="M26 24h9M26 27.5h9M26 31h9" stroke="currentColor" stroke-width="1.6"/>`,
  wira: `<polygon points="24,9 39,17 9,17" fill="${KREM}"/>
    <rect x="11" y="19" width="26" height="2.5" fill="${KREM}"/>
    <rect x="13" y="23" width="3.5" height="10" fill="${KREM}"/><rect x="19.5" y="23" width="3.5" height="10" fill="${KREM}"/>
    <rect x="25" y="23" width="3.5" height="10" fill="${KREM}"/><rect x="31.5" y="23" width="3.5" height="10" fill="${KREM}"/>
    <rect x="9" y="35" width="30" height="3.5" fill="${KREM}"/>`,
  asuransi: `<path d="M24 9 L37 14 V23 Q37 33 24 39 Q11 33 11 23 V14 Z" fill="${KREM}"/>
    <path d="M17.5 24 L22.5 29 L31 19.5" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Pulau Karang Sunyi
  medis: `<rect x="19" y="10" width="10" height="28" rx="2" fill="${KREM}"/><rect x="10" y="19" width="28" height="10" rx="2" fill="${KREM}"/>`,
  desa: `<polygon points="15,14 24,22 6,22" fill="${KREM}"/><rect x="8" y="22" width="14" height="13" fill="${KREM}"/>
    <polygon points="33,12 43,21 23,21" fill="${KREM}"/><rect x="25" y="21" width="16" height="14" fill="${KREM}"/>
    <rect x="13" y="27" width="4" height="8" fill="currentColor"/><rect x="31" y="26" width="5" height="9" fill="currentColor"/>`,
  biofarma: `<path d="M19 9 H29 V12 H27.5 V20 L37 35 Q38.5 39 34 39 H14 Q9.5 39 11 35 L20.5 20 V12 H19 Z" fill="${KREM}"/>
    <path d="M15.5 31 H32.5 L35 35.5 Q35.5 36.8 34 36.8 H14 Q12.5 36.8 13 35.5 Z" fill="currentColor"/>
    <circle cx="22" cy="27" r="1.8" fill="currentColor"/><circle cx="26.5" cy="24.5" r="1.3" fill="currentColor"/>`,
  nelayan: `<path d="M8 24 Q18 12 31 24 Q18 36 8 24 Z" fill="${KREM}"/><polygon points="30,24 41,15 41,33" fill="${KREM}"/>
    <circle cx="15" cy="22.5" r="1.8" fill="currentColor"/><path d="M21 19 Q24 24 21 29" stroke="currentColor" stroke-width="1.6" fill="none"/>`,
  penyelundup: `<rect x="10" y="12" width="28" height="25" rx="1.5" fill="${KREM}"/>
    <path d="M10 12 L38 37 M38 12 L10 37" stroke="currentColor" stroke-width="2.6"/>
    <rect x="10" y="12" width="28" height="25" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>`,

  // Arunika Gelap
  dinas: `<polygon points="27,7 13,27 22,27 19,41 35,19 26,19" fill="${KREM}"/>`,
  polsek: `<path d="M14 32 V24 Q14 14 24 14 Q34 14 34 24 V32 Z" fill="${KREM}"/>
    <rect x="10" y="32" width="28" height="5" rx="1.5" fill="${KREM}"/>
    <path d="M24 6 V10 M11 11 L14 14 M37 11 L34 14" stroke="${KREM}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M19 24 Q19 19 24 19" stroke="currentColor" stroke-width="2" fill="none"/>`,
  lentera: `<rect x="20" y="7" width="8" height="4" rx="1" fill="${KREM}"/>
    <ellipse cx="24" cy="25" rx="11" ry="13" fill="${KREM}"/>
    <path d="M14 21 H34 M13.5 28 H34.5" stroke="currentColor" stroke-width="1.6"/>
    <rect x="21" y="37" width="6" height="4" rx="1" fill="${KREM}"/>`,
  paguyuban: `<circle cx="14" cy="18" r="4.5" fill="${KREM}"/><circle cx="34" cy="18" r="4.5" fill="${KREM}"/>
    <circle cx="24" cy="15" r="5.5" fill="${KREM}"/>
    <path d="M6 36 Q7 25 14 25 Q19 25 20 29 M42 36 Q41 25 34 25 Q29 25 28 29" fill="${KREM}"/>
    <path d="M14 38 Q14 23 24 23 Q34 23 34 38 Z" fill="${KREM}"/>`,
  surya: `<rect x="11" y="15" width="24" height="18" rx="3" fill="${KREM}"/><rect x="35" y="20" width="3.5" height="8" rx="1" fill="${KREM}"/>
    <rect x="14" y="18" width="5" height="12" fill="currentColor"/><rect x="20.5" y="18" width="5" height="12" fill="currentColor" opacity=".6"/>`,

  // Samudra Biru Terdampar
  kru: `<circle cx="24" cy="12" r="3.5" fill="none" stroke="${KREM}" stroke-width="2.6"/>
    <path d="M24 15.5 V38 M16 21 H32" stroke="${KREM}" stroke-width="3" stroke-linecap="round"/>
    <path d="M11 28 Q12 38 24 38 Q36 38 37 28" stroke="${KREM}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M8 30 L11 26 L14 30 M34 30 L37 26 L40 30" stroke="${KREM}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`,
  vip: `<polygon points="15,12 33,12 40,20 24,39 8,20" fill="${KREM}"/>
    <path d="M8 20 H40 M19 12 L16 20 L24 39 L32 20 L29 12" stroke="currentColor" stroke-width="1.5" fill="none"/>`,
  dekbawah: `<rect x="9" y="17" width="30" height="20" rx="3" fill="${KREM}"/>
    <path d="M18 17 V13 Q18 11 20 11 H28 Q30 11 30 13 V17" stroke="${KREM}" stroke-width="2.6" fill="none"/>
    <path d="M9 25 H39" stroke="currentColor" stroke-width="2"/><rect x="21" y="23" width="6" height="5" rx="1" fill="currentColor"/>`,
  dokter: `<path d="M19 13 V10 Q19 8 21 8 H27 Q29 8 29 10 V13" stroke="${KREM}" stroke-width="2.6" fill="none"/>
    <rect x="9" y="13" width="30" height="24" rx="3" fill="${KREM}"/>
    <rect x="21.5" y="18" width="5" height="14" fill="currentColor"/><rect x="17" y="22.5" width="14" height="5" fill="currentColor"/>`,
  palka: `<circle cx="16" cy="24" r="7.5" fill="none" stroke="${KREM}" stroke-width="3.4"/>
    <path d="M23 24 H40 M34 24 V30 M39 24 V29" stroke="${KREM}" stroke-width="3.4" stroke-linecap="round"/>`,

  saksi: `<path d="M6 24 Q24 8 42 24 Q24 40 6 24 Z" fill="${KREM}"/>
    <circle cx="24" cy="24" r="7" fill="currentColor"/><circle cx="26" cy="22" r="2.2" fill="${KREM}"/>`,
};

function gerigi(warna){
  // Tepi segel bergerigi: 18 lekukan kecil di sekeliling lingkaran.
  const titik = [];
  for(let i = 0; i < 36; i++){
    const r = i % 2 ? 29 : 31.5;
    const a = (Math.PI * 2 * i) / 36;
    titik.push((32 + r * Math.cos(a)).toFixed(2) + ',' + (32 + r * Math.sin(a)).toFixed(2));
  }
  return `<polygon points="${titik.join(' ')}" fill="${warna}"/>`;
}

/*
  Segel lambang satu kubu. "warna" diambil dari skenario.js, "ukuran"
  dalam piksel. Teks alternatifnya nama kubu, jadi tetap terbaca pembaca layar.
*/
export function lambang(id, warna, ukuran = 48, judul = ''){
  const gambar = GAMBAR[id] || GAMBAR.saksi;
  return `<svg class="ag-segel" width="${ukuran}" height="${ukuran}" viewBox="0 0 64 64" role="img" aria-label="${judul}" style="color:${warna}">
    ${gerigi(warna)}
    <circle cx="32" cy="32" r="25" fill="${warna}" stroke="${KREM}" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="3 2.4"/>
    <circle cx="32" cy="32" r="21.5" fill="rgba(0,0,0,.18)"/>
    <g transform="translate(8 8)">${gambar}</g>
  </svg>`;
}

/* ---------- Ikon aksi ---------- */

const IKON_AKSI = {
  diam: `<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="3"/>
    <path d="M17 24 H31" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`,
  galang: `<ellipse cx="24" cy="33" rx="12" ry="4.5" fill="currentColor"/>
    <ellipse cx="24" cy="26" rx="12" ry="4.5" fill="currentColor" opacity=".8"/>
    <ellipse cx="24" cy="19" rx="12" ry="4.5" fill="currentColor" opacity=".6"/>
    <path d="M24 4 V12 M20 8 L24 4 L28 8" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  tameng: `<path d="M24 6 L39 12 V23 Q39 35 24 42 Q9 35 9 23 V12 Z" fill="currentColor"/>
    <path d="M24 12 V36 M15 21 H33" stroke="#f4ead3" stroke-width="2.4" opacity=".75"/>`,
  serang: `<path d="M10 38 L32 16 M28 12 L36 20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 16 L38 6 L42 10 Z" fill="currentColor"/>
    <path d="M38 38 L16 16 M20 12 L12 20" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  sekutu: `<circle cx="18" cy="24" r="10" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="30" cy="24" r="10" fill="none" stroke="currentColor" stroke-width="4" opacity=".75"/>
    <path d="M24 16 A10 10 0 0 1 24 32" stroke="currentColor" stroke-width="4" fill="none"/>`,
  selidiki: `<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M28 28 L41 41" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 18 Q16 13 21 13" stroke="currentColor" stroke-width="2" fill="none" opacity=".6"/>`,
  dukung: `<path d="M24 40 Q8 30 8 18 Q8 10 16 10 Q21 10 24 15 Q27 10 32 10 Q40 10 40 18 Q40 30 24 40 Z" fill="currentColor"/>`,
};

export function ikonAksi(id, ukuran = 40){
  return `<svg class="ag-ikon-aksi" width="${ukuran}" height="${ukuran}" viewBox="0 0 48 48" aria-hidden="true">${IKON_AKSI[id] || IKON_AKSI.diam}</svg>`;
}

/* ---------- Simbol nilai ---------- */

// Tameng kecil untuk Ketahanan.
export function ikonKT(ukuran = 14, isi = true){
  return `<svg class="ag-ikon-kt ${isi ? '' : 'kosong'}" width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 L21 5.5 V12 Q21 18.5 12 22 Q3 18.5 3 12 V5.5 Z"/></svg>`;
}

// Koin kecil untuk Pengaruh.
export function ikonPG(ukuran = 14){
  return `<svg class="ag-ikon-pg" width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6.5" fill="none" stroke-width="1.6"/>
    <path d="M12 8.5 L13.2 11 L15.8 11.3 L13.9 13 L14.4 15.6 L12 14.3 L9.6 15.6 L10.1 13 L8.2 11.3 L10.8 11 Z"/></svg>`;
}

/*
  Deret tameng Ketahanan, misalnya 4 dari 6 tampil sebagai 4 tameng penuh dan
  2 tameng kosong. Disertai teks tersembunyi untuk pembaca layar.
*/
export function deretKT(kt, maks = 6, ukuran = 14){
  let isi = '';
  for(let i = 0; i < maks; i++) isi += ikonKT(ukuran, i < kt);
  return `<span class="ag-deret-kt" title="Ketahanan ${kt} dari ${maks}">${isi}<span class="ag-sr">Ketahanan ${kt} dari ${maks}</span></span>`;
}

export function nilaiPG(pg, ukuran = 14){
  return `<span class="ag-nilai-pg" title="Pengaruh ${pg}">${ikonPG(ukuran)}<b>${pg}</b><span class="ag-sr">Pengaruh</span></span>`;
}
