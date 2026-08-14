/*
  sync-jadwal.mjs — ambil jadwal kelas dari Google Sheets, tulis ke data/jadwal.json.

  Dijalankan otomatis tiap 3 jam oleh .github/workflows/sync-jadwal.yml,
  dan bisa dijalankan manual:

    SHEET_ID=xxxxx node scripts/sync-jadwal.mjs

  Sheet yang dibaca adalah tab bernama "per hari" (lihat SHEET_TAB), karena
  tab itu sudah rapi: satu baris = satu kelas, sudah terurut per jam, dan
  nama mata kuliahnya terisi penuh (tidak ada merged cell seperti di tab
  master "Jadwal + Ruang Kelas").

  Bentuk tab "per hari" yang diharapkan:

    JADWAL MATA KULIAH PER HARI
    Senin
    Kode Matkul,Nama Matkul,KP,Jam,Ruangan
    1303FW33,Akuntansi Keuangan Menengah I,A,13.00 - 14.40,FG 06.02
    ...
    Selasa
    Kode Matkul,Nama Matkul,KP,Jam,Ruangan
    ...

  SYARAT: sheet harus bisa dibaca tanpa login — Share → "Anyone with the
  link" → Viewer. Script ini sengaja tidak memakai kredensial apa pun.
*/

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = process.env.SHEET_TAB || 'per hari';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'data', 'jadwal.json');

/* ---------- CSV parser ----------
   Menangani field ber-tanda kutip yang isinya mengandung koma/newline,
   misal: 1302M13B,"Sistem Informasi Manajemen, Jur. Manajemen",A1,...   */
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

/* Ubah baris-baris CSV jadi struktur { day, classes[] } per hari. */
function rowsToDays(rows) {
  const days = [];
  let current = null;

  for (const row of rows) {
    const cells = row.map(c => c.trim());
    const first = cells[0];

    // Baris kosong / baris judul besar → lewati.
    if (!first) continue;
    if (/^JADWAL/i.test(first)) continue;

    // Baris nama hari (kolom lain kosong) → mulai kelompok hari baru.
    const hari = HARI.find(h => h.toLowerCase() === first.toLowerCase());
    if (hari && cells.slice(1).every(c => !c)) {
      current = { day: hari, classes: [] };
      days.push(current);
      continue;
    }

    // Baris header tabel → lewati.
    if (/^kode\s*matkul$/i.test(first)) continue;

    // Selain itu: baris kelas. Butuh minimal kode + nama + jam.
    if (!current) continue;
    const [kode, nama, kp, jam, ruang] = cells;
    if (!nama || !jam) {
      console.warn(`  ! baris dilewati (data tidak lengkap): ${cells.join(' | ')}`);
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

/* Rapikan format jam: "10.40-12.30" → "10.40 - 12.30", buang spasi ganda. */
function normalizeJam(jam) {
  return jam
    .replace(/\s*[-–—]\s*/, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Ambil CSV — dari Google, atau dari file lokal kalau CSV_FILE diisi
   (dipakai untuk menguji parser tanpa perlu menyentuh sheet aslinya). */
async function ambilCsv() {
  if (process.env.CSV_FILE) {
    console.log(`Membaca CSV lokal: ${process.env.CSV_FILE}`);
    return readFile(process.env.CSV_FILE, 'utf8');
  }

  if (!SHEET_ID) {
    throw new Error(
      'environment variable SHEET_ID belum diisi. '
      + 'Jalankan dengan: SHEET_ID=<id-google-sheet> node scripts/sync-jadwal.mjs'
    );
  }

  // Endpoint gviz bisa memilih tab BERDASARKAN NAMA, jadi kita tidak perlu
  // tahu "gid" numeriknya (yang berubah kalau tab dibuat ulang).
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`
    + `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;

  console.log(`Mengambil tab "${SHEET_TAB}" dari sheet ${SHEET_ID} ...`);
  const res = await fetch(url, { redirect: 'follow' });

  if (!res.ok) {
    throw new Error(
      `Gagal mengambil sheet (HTTP ${res.status}). `
      + 'Pastikan sheet sudah di-share "Anyone with the link → Viewer" '
      + 'dan SHEET_ID-nya benar.'
    );
  }

  const csv = await res.text();

  // Kalau sheet tidak publik, Google membalas halaman login berformat HTML
  // dengan status 200 — jadi status OK saja tidak cukup untuk dipercaya.
  if (csv.trimStart().startsWith('<')) {
    throw new Error(
      'Google membalas HTML, bukan CSV — sheet kemungkinan belum publik. '
      + 'Buka sheet → Share → "Anyone with the link" → Viewer.'
    );
  }

  return csv;
}

async function main() {
  const days = rowsToDays(parseCsv(await ambilCsv()));
  const total = days.reduce((n, d) => n + d.classes.length, 0);

  if (total === 0) {
    throw new Error(
      `Tidak ada satu pun baris kelas yang terbaca dari tab "${SHEET_TAB}". `
      + 'Struktur sheet mungkin berubah — data lama sengaja tidak ditimpa.'
    );
  }

  console.log(`Terbaca ${total} kelas dalam ${days.length} hari:`);
  for (const d of days) console.log(`  ${d.day}: ${d.classes.length} kelas`);

  const payload = {
    updatedAt: new Date().toISOString(),
    note: 'Digenerate otomatis oleh scripts/sync-jadwal.mjs. Jangan diedit manual — perubahan akan tertimpa saat sinkronisasi berikutnya.',
    days,
  };

  // Bandingkan tanpa updatedAt, supaya workflow tidak membuat commit kosong
  // tiap 3 jam kalau jadwalnya sebenarnya tidak berubah.
  const next = JSON.stringify(payload.days);
  let prev = null;
  try {
    prev = JSON.stringify(JSON.parse(await readFile(OUT_FILE, 'utf8')).days);
  } catch { /* file belum ada — anggap berubah */ }

  if (prev === next) {
    console.log('Jadwal tidak berubah — file tidak ditulis ulang.');
    return;
  }

  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Jadwal berubah — ${OUT_FILE} diperbarui.`);
}

main().catch(err => {
  console.error('Sinkronisasi gagal:', err.message);
  process.exit(1);
});
