/*
  sync-jadwal.mjs — ambil jadwal kelas dari Google Sheets, tulis ke data/jadwal.json.

  Dijalankan otomatis oleh .github/workflows/sync-jadwal.yml, dan bisa
  dijalankan manual:

    SHEET_ID=xxxxx node scripts/sync-jadwal.mjs

  Membaca DUA tab:

  1. "per hari"  — jadwal tetap mingguan. Satu baris = satu kelas, sudah
     terurut per jam, nama matkul terisi penuh (tidak ada merged cell
     seperti di tab master "Jadwal + Ruang Kelas").

  2. "perubahan" — perubahan sementara (tanggal merah, acara kampus, dll).
     Formatnya sengaja mengikuti file "Jadwal Kelas Pengganti" yang biasa
     dibuat pengurus, supaya isinya bisa langsung di-copy-paste. Boleh berisi
     beberapa blok sekaligus; tiap blok diawali baris judul yang memuat
     tanggal liburnya:

       JADWAL PENGGANTI KELAS ASISTENSI - Senin, 17 Agustus 2026 (MINGGU KE-2)
       Kode MK,Nama MK,KP,Jadwal Asal,Jadwal Pengganti,Ruang Kelas Pengganti
       1300M03B,Statistika II,A,"Senin, 18.30-20.10 EC 04.04","Rabu, 19 Agustus, 18.30 - 20.10",EA 04.03

     Satu baris menghasilkan DUA kejadian: kelas asal ditiadakan pada tanggal
     libur, dan kelas pengganti muncul pada tanggal penggantinya.

  Tab "perubahan" boleh belum ada — jadwal tetap akan tetap tersinkron.

  SYARAT: sheet harus bisa dibaca tanpa login — Share → "Anyone with the
  link" → Viewer. Script ini sengaja tidak memakai kredensial apa pun.
*/

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHEET_ID = process.env.SHEET_ID;
const TAB_JADWAL = process.env.SHEET_TAB || 'per hari';
const TAB_PERUBAHAN = process.env.SHEET_TAB_PERUBAHAN || 'perubahan';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_KERJA = HARI.slice(1, 6);

const BULAN = {
  januari: 1, jan: 1,
  februari: 2, pebruari: 2, feb: 2, peb: 2,
  maret: 3, mar: 3, mrt: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, ags: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, okto: 10,
  november: 11, nov: 11, nop: 11,
  desember: 12, des: 12, dec: 12,
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'data', 'jadwal.json');

/* Dua tingkat peringatan, dan bedanya penting:

   warn()     — catatan kualitas data untuk pengurus (mis. jam di dua sheet
                tidak sama). Barisnya TETAP tampil, jadi mahasiswa tidak perlu
                diberi tahu apa-apa; cukup muncul di log GitHub Actions.

   warnSkip() — baris benar-benar TIDAK bisa ditampilkan. Ini yang membuat
                halaman jadwal memasang catatan "ada perubahan yang belum
                tampil", supaya mahasiswa tahu ada info yang terlewat.

   Kalau keduanya dicampur, halaman akan memberi alarm palsu setiap kali ada
   selisih kecil di spreadsheet — dan peringatan yang terlalu sering muncul
   justru berhenti dibaca. */
const warnings = [];
const skipped = [];

function warn(msg) {
  warnings.push(msg);
  console.warn('  ! ' + msg);
}

function warnSkip(msg) {
  skipped.push(msg);
  warnings.push(msg);
  console.warn('  !! ' + msg);
}

/* ---------- CSV parser ----------
   Menangani field ber-tanda kutip yang isinya mengandung koma/newline,
   misal: 1300M03B,"Senin, 18.30-20.10 EC 04.04",...   */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // "" = kutip literal
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') { field += ch; }
  }
  row.push(field);
  rows.push(row);

  return rows;
}

/* ---------- Util tanggal & jam ---------- */

/* "19 Agustus 2026" / "19 Agustus" / "Rabu, 19 Agt 2026, 18.30 - 20.10"
   → { iso:'2026-08-19', hari:'Rabu' }. Tahun boleh kosong → pakai tahunFallback. */
function parseTanggalIndo(teks, tahunFallback) {
  if (!teks) return null;

  // Cari "<angka> <nama-bulan> [tahun]" pertama yang nama bulannya dikenal.
  const re = /(\d{1,2})\s+([A-Za-z]+)\.?(?:\s+(\d{4}))?/g;
  let m;
  while ((m = re.exec(teks)) !== null) {
    const bulan = BULAN[m[2].toLowerCase()];
    if (!bulan) continue;

    const tgl = parseInt(m[1], 10);
    const tahun = m[3] ? parseInt(m[3], 10) : tahunFallback;
    if (!tahun) return null;

    // Konstruksi UTC supaya tidak tergeser zona waktu runner GitHub.
    const d = new Date(Date.UTC(tahun, bulan - 1, tgl));
    if (d.getUTCDate() !== tgl || d.getUTCMonth() !== bulan - 1) return null;  // mis. 31 Februari

    return { iso: d.toISOString().slice(0, 10), hari: HARI[d.getUTCDay()] };
  }
  return null;
}

/* Ambil nama hari yang ditulis manual di teks, kalau ada. */
function cariNamaHari(teks) {
  const m = String(teks).match(/\b(Senin|Selasa|Rabu|Kamis|Jum'?at|Jumat|Sabtu|Minggu)\b/i);
  if (!m) return null;
  const s = m[1].toLowerCase().replace("'", '');
  return s === 'jumat' ? 'Jumat' : s.charAt(0).toUpperCase() + s.slice(1);
}

/* "18.30-20.10" / "18.30 - 20.10" / "18:30 — 20:10" → "18.30 - 20.10" */
function parseJam(teks) {
  const m = String(teks).match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  const p = n => String(n).padStart(2, '0');
  return `${p(m[1])}.${m[2]} - ${p(m[3])}.${m[4]}`;
}

/* Rapikan format jam bebas: "10.40-12.30" → "10.40 - 12.30". */
function normalizeJam(jam) {
  return parseJam(jam) || String(jam).replace(/\s*[-–—]\s*/, ' - ').replace(/\s+/g, ' ').trim();
}

function durasiMenit(jam) {
  const m = String(jam).match(/(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  return (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
}

/* ---------- Tab "per hari" → jadwal tetap ---------- */
function rowsToDays(rows) {
  const days = [];
  let current = null;

  for (const row of rows) {
    const cells = row.map(c => c.trim());
    const first = cells[0];

    if (!first) continue;
    if (/^JADWAL/i.test(first)) continue;              // baris judul besar

    // Baris nama hari (kolom lain kosong) → mulai kelompok hari baru.
    const hari = HARI_KERJA.find(h => h.toLowerCase() === first.toLowerCase())
      || HARI.find(h => h.toLowerCase() === first.toLowerCase());
    if (hari && cells.slice(1).every(c => !c)) {
      current = { day: hari, classes: [] };
      days.push(current);
      continue;
    }

    if (/^kode\s*matkul$/i.test(first)) continue;      // header tabel

    if (!current) continue;
    const [kode, nama, kp, jam, ruang] = cells;
    if (!nama || !jam) {
      warnSkip(`Baris jadwal dilewati (data tidak lengkap): ${cells.join(' | ')}`);
      continue;
    }

    current.classes.push({
      kode: kode || '',
      nama,
      kp: kp || '',
      jam: normalizeJam(jam),
      ruang: ruang || '',
    });
  }

  return days;
}

/* Apakah isi tab ini benar-benar berbentuk tabel perubahan?

   PENTING: kalau nama tab tidak ditemukan, gviz TIDAK memberi error — ia diam-
   diam mengembalikan tab PERTAMA (master jadwal). Tanpa pemeriksaan ini, isi
   tab yang sama sekali lain akan dibaca sebagai data perubahan dan menghasilkan
   puluhan peringatan palsu di halaman jadwal. */
function bentuknyaTabPerubahan(rows) {
  return rows.some(row => {
    const cells = row.map(c => c.trim());
    return /jadwal\s+pengganti/i.test(cells.filter(Boolean).join(' '))
      || /^kode\s*mk$/i.test(cells[0] || '');
  });
}

/* ---------- Tanggal mulai perkuliahan ---------- */

async function bacaKonfigMulai() {
  const file = join(ROOT, 'data', 'mulai.json');
  try {
    const cfg = JSON.parse(await readFile(file, 'utf8'));
    return {
      default: cfg.default || null,
      perMatkul: cfg.perMatkul || {},
    };
  } catch (e) {
    console.log(`  data/mulai.json tidak terbaca (${e.message}) — semua kelas dianggap sudah berjalan.`);
    return { default: null, perMatkul: {} };
  }
}

function mulaiUntuk(kode, cfg) {
  return cfg.perMatkul[kode] || cfg.default || null;
}

/* Apakah kelas ini sudah berjalan pada tanggal tertentu? */
function sudahMulai(kode, tanggalIso, cfg) {
  const m = mulaiUntuk(kode, cfg);
  return !m || tanggalIso >= m;
}

/* ---------- Tab "perubahan" → daftar perubahan bertanggal ---------- */
function rowsToChanges(rows, days, mulaiCfg = { default: null, perMatkul: {} }) {
  const changes = [];
  let blok = null;   // { iso, hari, label } dari baris judul terakhir

  // Indeks kelas tetap berdasarkan "KODE|KP" untuk pencocokan.
  const indeks = new Map();
  for (const d of days) {
    for (const k of d.classes) {
      const key = `${k.kode}|${k.kp}`.toUpperCase();
      if (!indeks.has(key)) indeks.set(key, []);
      indeks.get(key).push({ ...k, day: d.day });
    }
  }

  for (const row of rows) {
    const cells = row.map(c => c.trim());
    const first = cells[0];
    if (!first) continue;

    // Baris header tabel.
    if (/^kode\s*mk$/i.test(first) || /^kode\s*matkul$/i.test(first)) continue;

    // Judulnya sendiri mengandung koma ("... - Senin, 17 Agustus 2026"), jadi
    // kalau selnya tidak dibungkus tanda kutip ia terpecah ke beberapa kolom.
    // Karena itu tanggal dicari dari seluruh isi baris, bukan kolom pertama.
    const teksBaris = cells.filter(Boolean).join(', ');

    // Baris judul blok → ambil tanggal liburnya.
    const barisJudul = /jadwal\s+pengganti/i.test(teksBaris)
      || /tanggal\s+merah|hari\s+libur/i.test(teksBaris)
      || cells.filter(Boolean).length === 1;

    if (barisJudul) {
      const t = parseTanggalIndo(teksBaris);
      if (t) {
        blok = { ...t, label: teksBaris };
        console.log(`  blok: ${formatTanggalPanjang(t.iso)}`);
      } else {
        warnSkip(`Baris judul tanpa tanggal yang bisa dibaca, blok dilewati: "${teksBaris}"`);
        blok = null;
      }
      continue;
    }

    // Baris data.
    const [kode, nama, kp, jadwalAsal, jadwalPengganti, ruangPengganti] = cells;

    if (!blok) {
      warnSkip(`Baris perubahan tanpa baris judul bertanggal di atasnya, dilewati: ${kode} ${kp}`);
      continue;
    }

    const key = `${kode}|${kp}`.toUpperCase();
    const kandidat = indeks.get(key) || [];
    if (kandidat.length === 0) {
      warnSkip(`Kelas ${kode} KP ${kp} tidak ada di jadwal tetap — baris dilewati.`);
      continue;
    }

    // Kelas yang ditiadakan harus jatuh pada hari yang sama dengan tanggal libur.
    const asal = kandidat.find(k => k.day === blok.hari);
    if (!asal) {
      warnSkip(
        `Kelas ${kode} KP ${kp} terjadwal hari ${kandidat.map(k => k.day).join('/')}, `
        + `bukan ${blok.hari} (${blok.iso}) — baris dilewati.`
      );
      continue;
    }

    // Cross-check kolom "Jadwal Asal" terhadap jadwal tetap. Jadwal tetap yang
    // dipakai; ketidakcocokan hanya dilaporkan supaya sheet bisa dibetulkan.
    const jamAsalDitulis = parseJam(jadwalAsal);
    if (jamAsalDitulis && jamAsalDitulis !== asal.jam) {
      warn(
        `${kode} KP ${kp}: "Jadwal Asal" tertulis ${jamAsalDitulis}, `
        + `jadwal tetap ${asal.jam}. Yang dipakai: ${asal.jam}.`
      );
    }

    const tglPengganti = parseTanggalIndo(jadwalPengganti, +blok.iso.slice(0, 4));
    const jamPengganti = parseJam(jadwalPengganti);

    if (!tglPengganti || !jamPengganti) {
      warnSkip(
        `${kode} KP ${kp}: kolom "Jadwal Pengganti" tidak terbaca `
        + `("${jadwalPengganti}") — baris dilewati.`
      );
      continue;
    }

    // Nama hari yang diketik harus cocok dengan tanggalnya. Kalau bentrok kita
    // tidak menebak mana yang benar — lebih baik dilewati daripada salah info.
    const hariDitulis = cariNamaHari(jadwalPengganti);
    if (hariDitulis && hariDitulis !== tglPengganti.hari) {
      warnSkip(
        `${kode} KP ${kp}: tertulis "${hariDitulis}" tapi ${tglPengganti.iso} `
        + `jatuh pada ${tglPengganti.hari} — baris dilewati.`
      );
      continue;
    }

    // Durasi kelas pengganti biasanya sama dengan aslinya; selisih besar
    // hampir selalu salah ketik (mis. 14.00 yang mestinya 14.40).
    const dAsal = durasiMenit(asal.jam);
    const dGanti = durasiMenit(jamPengganti);
    if (dAsal && dGanti && Math.abs(dAsal - dGanti) > 10) {
      warn(
        `${kode} KP ${kp}: durasi pengganti ${dGanti} menit, aslinya ${dAsal} menit `
        + `(${jamPengganti} vs ${asal.jam}) — cek kemungkinan salah ketik.`
      );
    }

    const namaKelas = asal.nama || nama || '';
    const tglLiburTeks = formatTanggalPanjang(blok.iso);
    const tglGantiTeks = formatTanggalPanjang(tglPengganti.iso);

    changes.push({
      tanggal: blok.iso,
      tipe: 'libur',
      kode, kp,
      nama: namaKelas,
      jam: asal.jam,
      ruang: asal.ruang,
      catatan: `Ditiadakan — diganti ${tglGantiTeks}, ${jamPengganti} di ${ruangPengganti || '(ruang belum ditentukan)'}`,
    });

    changes.push({
      tanggal: tglPengganti.iso,
      tipe: 'pengganti',
      kode, kp,
      nama: namaKelas,
      jam: jamPengganti,
      ruang: ruangPengganti || '',
      catatan: `Kelas pengganti dari ${tglLiburTeks}`,
    });
  }

  changes.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jam.localeCompare(b.jam));

  // Kalau sebuah tanggal meniadakan sebagian besar (tapi tidak semua) kelas di
  // hari itu, biasanya itu tanggal merah dan ada kelas yang lupa didaftarkan.
  // Hanya dicatat di log — memindahkan satu-dua kelas saja juga hal biasa.
  const perTanggal = new Map();
  for (const c of changes.filter(c => c.tipe === 'libur')) {
    if (!perTanggal.has(c.tanggal)) perTanggal.set(c.tanggal, []);
    perTanggal.get(c.tanggal).push(c);
  }
  for (const [tanggal, libur] of perTanggal) {
    const hari = HARI[new Date(tanggal + 'T00:00:00Z').getUTCDay()];
    const semua = days.find(d => d.day === hari)?.classes || [];
    if (semua.length === 0) continue;

    const ditiadakan = new Set(libur.map(c => `${c.kode}|${c.kp}`.toUpperCase()));
    // Kelas yang perkuliahannya belum dimulai memang tidak perlu ditiadakan.
    const tersisa = semua.filter(k =>
      !ditiadakan.has(`${k.kode}|${k.kp}`.toUpperCase())
      && sudahMulai(k.kode, tanggal, mulaiCfg)
    );

    if (tersisa.length > 0 && ditiadakan.size >= semua.length - 2) {
      console.log(
        `  catatan: ${tanggal} (${hari}) meniadakan ${ditiadakan.size} dari ${semua.length} kelas. `
        + `Belum disebut: ${tersisa.map(k => `${k.kode} KP ${k.kp}`).join(', ')}. `
        + 'Kalau ini tanggal merah, cek apakah ada yang terlewat.'
      );
    }
  }

  return changes;
}

function formatTanggalPanjang(iso) {
  const nama = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                'Agustus','September','Oktober','November','Desember'];
  const [y, m, d] = iso.split('-').map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${d} ${nama[m - 1]} ${y}`;
}

/* ---------- Pengambilan data ---------- */

async function ambilTab(tab, { wajib }) {
  if (process.env.CSV_FILE && wajib) {
    console.log(`Membaca CSV lokal: ${process.env.CSV_FILE}`);
    return readFile(process.env.CSV_FILE, 'utf8');
  }
  if (process.env.CSV_FILE_PERUBAHAN && !wajib) {
    console.log(`Membaca CSV perubahan lokal: ${process.env.CSV_FILE_PERUBAHAN}`);
    return readFile(process.env.CSV_FILE_PERUBAHAN, 'utf8');
  }
  if (process.env.CSV_FILE && !wajib) return null;   // mode uji tanpa tab perubahan

  if (!SHEET_ID) {
    throw new Error(
      'environment variable SHEET_ID belum diisi. '
      + 'Jalankan dengan: SHEET_ID=<id-google-sheet> node scripts/sync-jadwal.mjs'
    );
  }

  // Endpoint gviz bisa memilih tab BERDASARKAN NAMA, jadi kita tidak perlu
  // tahu "gid" numeriknya (yang berubah kalau tab dibuat ulang).
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`
    + `?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

  console.log(`Mengambil tab "${tab}" ...`);
  const res = await fetch(url, { redirect: 'follow' });
  const body = res.ok ? await res.text() : '';

  // gviz membalas payload JS berisi status:error kalau nama tab tidak ada.
  const tabTidakAda = !res.ok || body.startsWith('/*O_o*/') || /"status"\s*:\s*"error"/.test(body);

  if (tabTidakAda) {
    if (wajib) {
      throw new Error(
        `Gagal mengambil tab "${tab}" (HTTP ${res.status}). Pastikan nama tab benar, `
        + 'sheet sudah di-share "Anyone with the link → Viewer", dan SHEET_ID-nya tepat.'
      );
    }
    console.log(`  tab "${tab}" tidak ada / belum bisa dibaca — dilewati.`);
    return null;
  }

  // Kalau sheet tidak publik, Google membalas halaman login berformat HTML
  // dengan status 200 — jadi status OK saja tidak cukup untuk dipercaya.
  if (body.trimStart().startsWith('<')) {
    throw new Error(
      'Google membalas HTML, bukan CSV — sheet kemungkinan belum publik. '
      + 'Buka sheet → Share → "Anyone with the link" → Viewer.'
    );
  }

  return body;
}

async function main() {
  const csvJadwal = await ambilTab(TAB_JADWAL, { wajib: true });
  const days = rowsToDays(parseCsv(csvJadwal));
  const total = days.reduce((n, d) => n + d.classes.length, 0);

  if (total === 0) {
    throw new Error(
      `Tidak ada satu pun baris kelas yang terbaca dari tab "${TAB_JADWAL}". `
      + 'Struktur sheet mungkin berubah — data lama sengaja tidak ditimpa.'
    );
  }

  console.log(`Jadwal tetap: ${total} kelas dalam ${days.length} hari`);
  for (const d of days) console.log(`  ${d.day}: ${d.classes.length} kelas`);

  // Tanggal mulai perkuliahan (lihat data/mulai.json).
  const mulai = await bacaKonfigMulai();
  console.log(
    `Mulai kuliah: ${mulai.default} (default)`
    + (Object.keys(mulai.perMatkul).length
      ? `, ${Object.keys(mulai.perMatkul).length} matkul dikecualikan`
      : '')
  );

  const csvPerubahan = await ambilTab(TAB_PERUBAHAN, { wajib: false });
  let changes = [];
  if (csvPerubahan) {
    const rows = parseCsv(csvPerubahan);
    if (bentuknyaTabPerubahan(rows)) {
      changes = rowsToChanges(rows, days, mulai);
    } else {
      // gviz mengembalikan tab pertama saat nama tab tidak ketemu — jangan
      // dibaca sebagai perubahan, dan jangan bikin peringatan palsu.
      console.log(
        `  isi tab "${TAB_PERUBAHAN}" tidak berbentuk tabel perubahan `
        + '(kemungkinan tabnya belum dibuat) — dilewati.'
      );
    }
  }

  const nLibur = changes.filter(c => c.tipe === 'libur').length;
  console.log(`Perubahan: ${nLibur} kelas ditiadakan, ${changes.length - nLibur} kelas pengganti`);

  const payload = {
    updatedAt: new Date().toISOString(),
    note: 'Digenerate otomatis oleh scripts/sync-jadwal.mjs. Jangan diedit manual — perubahan akan tertimpa saat sinkronisasi berikutnya.',
    mulai,
    days,
    changes,
    warnings,
    skipped,
  };

  // Bandingkan tanpa updatedAt, supaya workflow tidak membuat commit kosong
  // tiap siklus kalau isinya sebenarnya tidak berubah.
  const next = JSON.stringify({ mulai, days, changes, warnings, skipped });
  let prev = null;
  try {
    const lama = JSON.parse(await readFile(OUT_FILE, 'utf8'));
    prev = JSON.stringify({
      mulai: lama.mulai || { default: null, perMatkul: {} },
      days: lama.days,
      changes: lama.changes || [],
      warnings: lama.warnings || [],
      skipped: lama.skipped || [],
    });
  } catch { /* file belum ada — anggap berubah */ }

  if (prev === next) {
    console.log('Tidak ada perubahan — file tidak ditulis ulang.');
    return;
  }

  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Data berubah — ${OUT_FILE} diperbarui.`);

  if (skipped.length) {
    console.log(
      `\n${skipped.length} baris TIDAK bisa ditampilkan (tanda !!). `
      + 'Halaman jadwal akan memberi tahu mahasiswa ada info yang terlewat — '
      + 'perbaiki barisnya di spreadsheet.'
    );
  }
  const infoSaja = warnings.length - skipped.length;
  if (infoSaja > 0) {
    console.log(
      `${infoSaja} catatan kualitas data (tanda !) — barisnya tetap tampil, `
      + 'tapi ada yang perlu diseragamkan di spreadsheet.'
    );
  }
}

main().catch(err => {
  console.error('Sinkronisasi gagal:', err.message);
  process.exit(1);
});
