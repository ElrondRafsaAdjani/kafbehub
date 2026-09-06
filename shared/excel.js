/*
  Pembaca dan penulis berkas Excel untuk halaman operasional.

  Berkas ini SENGAJA tidak menyentuh Firestore sama sekali. Isinya hanya
  mengubah bentuk: dari lembar Excel menjadi baris yang rapi, dan sebaliknya.
  Dengan begitu bagian yang paling rumit di sini, yaitu menebak isi lembar
  yang formatnya ditulis manusia, bisa diperiksa tanpa menyentuh basis data.

  Acuan formatnya adalah berkas "INFORMASI KELAS ASISTENSI" yang tiap semester
  disusun pengurus. Empat lembar dibaca, dan lembar "Rekap Jumlah Ngajar"
  sengaja dilewati karena isinya hitungan turunan, bukan data sumber.

  Yang membuat lembar itu tidak bisa dibaca lurus baris per baris:

    1. Kode dan nama mata kuliah hanya ditulis sekali, lalu selnya digabung
       ke bawah untuk semua KP-nya.
    2. Tiap KP memakan dua baris, yang kedua hanya sambungan dari yang pertama.
    3. Ada baris kosong penyekat antar mata kuliah, dan catatan kerja pengurus
       menyelip di kolom-kolom jauh seperti "ganti jadwal" dan "Y".
    4. Di tengah satu kelompok bisa muncul kode lain, misalnya kelas kampus
       West yang kodenya berbeda dari kelas kampus utama.
    5. Jam ditulis "13.00 - 14.40", bukan dua kolom jam mulai dan selesai.
    6. Ada kolom yang sengaja dikosongkan karena isinya sama dengan baris di
       atasnya, misalnya koordinator yang memegang beberapa kode sekaligus.

  Sel gabungan dibaca penuh, jadi nomor satu tidak perlu ditebak. Baris
  sambungan dikenali dari kolom penandanya dan dilewati. Kekosongan yang bukan
  sel gabungan, seperti nomor enam, diwariskan dari baris di atasnya.
*/

/*
  Membaca dan menulis .xlsx berarti membongkar berkas zip berisi XML, jadi
  pekerjaan itu diserahkan ke pustaka.

  DUA PUSTAKA, DAN INI DISENGAJA.

  SheetJS digunakan untuk MEMBACA. Pembacaannya cepat: berkas asli pengurus yang
  seribu baris selesai dalam sepersekian detik.

  ExcelJS digunakan untuk MENULIS. SheetJS versi bebas tidak bisa menulis warna,
  garis, dan sel gabungan, padahal justru itu yang membuat berkas unduhan
  terlihat sama dengan berkas yang biasa diedarkan pengurus.

  Kebalikannya sudah diukur dan tidak digunakan. ExcelJS memang bisa membaca,
  tetapi di peramban satu berkas yang sama memakan sekitar delapan belas detik,
  sedangkan menulis dengannya hanya sekitar satu detik. Jadi masing-masing
  digunakan untuk pekerjaan yang memang jadi kekuatannya.

  Keduanya disimpan di dalam repo, bukan diambil dari CDN. Halaman ini digunakan
  pengurus di ruang kelas dengan sambungan seadanya, dan sekali CDN-nya
  terhalang, seluruh tab Excel mati tanpa bisa diperbaiki dari sini. Menyimpan
  sendiri juga berarti tidak ada pihak ketiga yang perlu dipercaya setiap kali
  halaman dibuka.

  Versinya dikunci, diambil dari cdnjs, dan isinya sudah dicocokkan dengan
  sidik resmi yang diumumkan cdnjs:

    xlsx 0.18.5
    sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==

    exceljs 4.4.0
    sha512-dlPw+ytv/6JyepmelABrgeYgHI0O+frEwgfnPdXDTOIZz+eDgfW07QXG02/O8COfivBdGNINy+Vex+lYmJ5rxw==

  Jika suatu saat berkasnya diperbarui, cocokkan lagi sidiknya sebelum
  dimasukkan ke repo.

  Pemuatannya ditunda sampai tombolnya benar-benar digunakan, dan yang dimuat
  hanya yang dibutuhkan. Pengurus yang hanya mengunduh tidak ikut menunggu
  pustaka pembaca, begitu pula sebaliknya.
*/
function muatSkrip(berkas, namaGlobal, sebutan){
  if(window[namaGlobal]) return Promise.resolve(window[namaGlobal]);
  const alamat = new URL('./vendor/' + berkas, import.meta.url).href;

  return new Promise((selesai, gagal) => {
    const s = document.createElement('script');
    s.src = alamat;
    s.onload = () => window[namaGlobal]
      ? selesai(window[namaGlobal])
      : gagal(new Error(`Pustaka ${sebutan} termuat tetapi tidak bisa digunakan.`));
    s.onerror = () => gagal(new Error(
      `Pustaka ${sebutan} gagal dimuat. Muat ulang halaman ini, lalu coba lagi.`));
    document.head.appendChild(s);
  });
}

let janjiPembaca = null;
let janjiPenulis = null;

export function muatPembaca(){
  if(!janjiPembaca) janjiPembaca = muatSkrip('xlsx.full.min.js', 'XLSX', 'pembaca Excel')
    .catch(err => { janjiPembaca = null; throw err; });
  return janjiPembaca;
}

export function muatPenulis(){
  if(!janjiPenulis) janjiPenulis = muatSkrip('exceljs.min.js', 'ExcelJS', 'penulis Excel')
    .catch(err => { janjiPenulis = null; throw err; });
  return janjiPenulis;
}

/* ---------- nama lembar ---------- */

export const LEMBAR = {
  jadwal: 'Jadwal + Ruang Kelas',
  classroom: 'google classroom',
  koordinator: 'Contact Koor',
  pengajar: 'Tim Pengajar',
};

// Lembar ini tidak dibaca dan tidak ditulis. Isinya hitungan jumlah mengajar
// yang bisa diturunkan sendiri dari lembar Tim Pengajar.
export const LEMBAR_DILEWATI = 'Rekap Jumlah Ngajar';

const HARI_SAH = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

/* ---------- alat bantu ---------- */

// Dipakai untuk mencocokkan nama lembar dan nama kolom. Huruf besar kecil,
// spasi, dan tanda baca diabaikan supaya "WA / Line" dan "wa line" sama saja.
function kunci(s){
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teks(v){
  if(v == null) return '';
  let s = String(v).trim();
  // Angka yang dibaca dari Excel kadang terbawa ekornya, misalnya NRP
  // "130223203" menjadi "130223203.0" dan nomor urut "1" menjadi "1.0".
  if(/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

function kosong(baris){
  return !baris || baris.every(sel => teks(sel) === '');
}

const ALIAS = {
  kode:        ['kodematkul','kodemk','kodematakuliah','kode'],
  nama:        ['namamatkul','namamk','namamatakuliah','matakuliah','nama'],
  kp:          ['kp','kelasparalel'],
  hari:        ['hari'],
  jam:         ['jam','waktu','jamkuliah'],
  ruang:       ['ruangkelas','ruang','kelas'],
  classroom:   ['kodegoogleclassroom','googleclassroom','kodeclassroom','classroom'],
  pengajar:    ['pengajar','namapengajar','asisten'],
  nrp:         ['nrp','nrppengajar'],
  koordinator: ['namakoordinator','koordinator'],
  kontak:      ['waline','wa','line','kontak','nomorwa'],
};

/*
  Baris kepala dicari, tidak dianggap selalu ada di baris pertama.

  Lembar "Contact Koor" misalnya diawali judul besar "KOORDINATOR MATA KULIAH
  KAFBE 2025", sehingga nama kolomnya baru muncul di baris kedua. Lembar lain
  bisa saja diberi baris judul serupa di kemudian hari.
*/
function cariKepala(baris, wajib){
  for(let i = 0; i < Math.min(baris.length, 30); i++){
    const kolom = {};
    baris[i].forEach((sel, j) => {
      const k = kunci(sel);
      if(!k) return;
      for(const [nama, daftar] of Object.entries(ALIAS)){
        if(kolom[nama] === undefined && daftar.includes(k)) kolom[nama] = j;
      }
    });
    if(wajib.every(w => kolom[w] !== undefined)) return { indeks: i, kolom };
  }
  return null;
}

function ambil(baris, kolom, nama){
  const j = kolom[nama];
  return j === undefined ? '' : teks(baris[j]);
}

/*
  "13.00 - 14.40" dipecah menjadi dua jam terpisah dalam bentuk 24 jam.

  Tanda pemisahnya bisa berupa hubung biasa, tanda pisah panjang, atau tanda
  pisah pendek, dan pemisah jam dengan menitnya bisa titik atau titik dua.
  Semuanya diterima supaya pengurus tidak perlu menyeragamkan berkasnya dulu.
*/
export function pecahJam(nilai){
  const s = teks(nilai);
  const m = s.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
  if(!m) return null;
  const jamSah = (j, n) => Number(j) >= 0 && Number(j) <= 23 && Number(n) >= 0 && Number(n) <= 59;
  if(!jamSah(m[1], m[2]) || !jamSah(m[3], m[4])) return null;
  const p2 = n => String(Number(n)).padStart(2, '0');
  return { mulai: `${p2(m[1])}:${m[2]}`, selesai: `${p2(m[3])}:${m[4]}` };
}

// "13:00" menjadi "13.00", bentuk yang digunakan di dalam berkas Excel.
function jamTitik(jam){
  const m = String(jam || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${String(Number(m[1])).padStart(2, '0')}.${m[2]}` : String(jam || '');
}

export function rentangJamExcel(mulai, selesai){
  if(!mulai && !selesai) return '';
  return `${jamTitik(mulai)} - ${jamTitik(selesai)}`;
}

function samakanHari(nilai){
  const k = kunci(nilai);
  if(!k) return '';
  return HARI_SAH.find(h => kunci(h) === k) || '';
}

/* ============================================================
   Membaca berkas
   ============================================================ */

/*
  Satu lembar diambil dengan nama yang longgar.

  Pengurus sering mengganti nama lembar sedikit, misalnya menambah tahun
  ajaran di belakangnya. Selama kata-katanya masih mengandung nama yang
  dikenal, lembarnya tetap ketemu.
*/
function cariLembar(daftarNama, nama){
  const cari = kunci(nama);
  const persis = daftarNama.find(n => kunci(n) === cari);
  if(persis) return persis;
  return daftarNama.find(n => kunci(n).includes(cari) || cari.includes(kunci(n))) || null;
}

/*
  Satu lembar diubah menjadi larik baris, dengan nomor baris yang tetap sama
  seperti di Excel.

  Dua hal ditangani di sini, dan keduanya berasal dari sel gabungan.

  Pertama, nilai sel induk disalin ke seluruh sel gabungannya. Kode dan nama
  mata kuliah yang ditulis sekali lalu digabung ke bawah karena itu terbaca
  pada tiap barisnya, jadi tidak ada yang perlu ditebak.

  Kedua, tiap sel dicatat apakah ia sel induk atau sekadar sambungan. Di berkas
  aslinya tiap KP memakan dua baris, yang kedua hanya sambungan dari yang
  pertama, dan tanpa catatan ini tiap kelas terbaca dua kali.

  Penentuan "baris ini hanya sambungan" TIDAK bisa diambil dari seluruh
  barisnya. Pengurus terbiasa menaruh catatan kerja di kolom jauh, misalnya
  "ganti jadwal" di kolom L dan "Y" di kolom P, dan catatan itu sering jatuh
  pada baris sambungan. Jika keberadaan catatan dianggap tanda baris berisi,
  sepuluh kelas terbaca dua kali. Karena itu yang diperiksa adalah kolom
  penanda milik tiap lembar, lewat sambunganKe di bawah.

  Nomor barisnya sengaja dipertahankan, termasuk untuk baris yang dilewati,
  supaya laporan "Baris 116" menunjuk baris yang sama dengan yang dilihat
  pengurus saat membuka berkasnya di Excel.
*/
function bacaLembar(XLSX, wb, nama){
  const asli = cariLembar(wb.SheetNames, nama);
  if(!asli) return null;
  const ws = wb.Sheets[asli];
  const baris = XLSX.utils.sheet_to_json(ws, {
    header: 1, raw: false, defval: '', blankrows: true,
  });
  const lanjutan = baris.map(b => b.map(() => false));

  for(const rentang of (ws['!merges'] || [])){
    const { s: mulai, e: akhir } = rentang;
    const induk = ((baris[mulai.r] || [])[mulai.c]) ?? '';
    for(let r = mulai.r; r <= akhir.r; r++){
      if(!baris[r]) baris[r] = [];
      if(!lanjutan[r]) lanjutan[r] = [];
      for(let c = mulai.c; c <= akhir.c; c++){
        if(r === mulai.r && c === mulai.c) continue;
        baris[r][c] = induk;
        lanjutan[r][c] = true;
      }
    }
  }
  return { nama: asli, baris, lanjutan };
}

/*
  Benar jika sel penanda pada baris itu hanya sambungan dari baris di atasnya,
  sehingga barisnya tidak membawa data baru.
*/
function sambunganKe(lembar, indeks, kolom, nama){
  const j = kolom[nama];
  if(j === undefined) return false;
  const b = lembar.lanjutan[indeks];
  return !!(b && b[j]);
}

/*
  Lembar "Jadwal + Ruang Kelas" menjadi dua hal sekaligus: daftar mata kuliah
  dan daftar kelas. Keduanya memang satu tabel di Excel, tetapi di basis data
  dipisah supaya nama mata kuliah cukup ditulis satu kali.
*/
function bacaJadwal(lembar, masalah){
  const hasil = { matakuliah: new Map(), jadwal: [] };
  if(!lembar) return hasil;

  const kepala = cariKepala(lembar.baris, ['kode', 'kp']);
  if(!kepala){
    masalah.push(`Lembar "${lembar.nama}" tidak punya kolom "Kode Matkul" dan "KP", jadi dilewati.`);
    return hasil;
  }

  let kodeAkhir = '', namaAkhir = '';
  for(let i = kepala.indeks + 1; i < lembar.baris.length; i++){
    const baris = lembar.baris[i];
    if(kosong(baris)) continue;
    // Barisnya hanya sambungan sel gabungan milik KP di atasnya.
    if(sambunganKe(lembar, i, kepala.kolom, 'kp')) continue;

    const kode = ambil(baris, kepala.kolom, 'kode');
    const nama = ambil(baris, kepala.kolom, 'nama');
    const kp   = ambil(baris, kepala.kolom, 'kp');

    /*
      Kode baru memutus warisan dari baris di atasnya. Tanpa ini, kelas West
      yang kodenya sendiri akan tertulis sebagai kelas mata kuliah sebelumnya.

      Namanya lain cerita. Ada kode yang kolom namanya memang dibiarkan kosong
      karena mata kuliahnya sama dengan baris di atasnya, hanya beda kode
      kurikulum. Nama itu diwarisi, tetapi diberitahukan, supaya pengurus bisa
      membetulkan jika tebakannya keliru.
    */
    if(kode){
      kodeAkhir = kode.toUpperCase();
      if(nama) namaAkhir = nama;
      else if(namaAkhir){
        masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": kode ${kodeAkhir} tidak diberi nama mata kuliah, jadi digunakan nama dari baris di atasnya, "${namaAkhir}".`);
      }
    }
    else if(nama) namaAkhir = nama;

    if(!kp) continue;
    if(!kodeAkhir){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}" punya KP tetapi tidak punya kode mata kuliah.`);
      continue;
    }

    if(namaAkhir && !hasil.matakuliah.has(kodeAkhir)){
      hasil.matakuliah.set(kodeAkhir, namaAkhir);
    }

    const hariAsli = ambil(baris, kepala.kolom, 'hari');
    const hari = samakanHari(hariAsli);
    const jam = pecahJam(ambil(baris, kepala.kolom, 'jam'));

    if(hariAsli && !hari){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": hari "${hariAsli}" tidak dikenali.`);
    }
    if(ambil(baris, kepala.kolom, 'jam') && !jam){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": jam "${ambil(baris, kepala.kolom, 'jam')}" tidak terbaca. Tulis seperti "13.00 - 14.40".`);
    }

    hasil.jadwal.push({
      baris: i + 1,
      kode: kodeAkhir,
      nama: namaAkhir,
      kp: kp.toUpperCase(),
      hari,
      mulai: jam ? jam.mulai : '',
      selesai: jam ? jam.selesai : '',
      ruang: ambil(baris, kepala.kolom, 'ruang'),
    });
  }
  return hasil;
}

function bacaPengajar(lembar, masalah){
  const out = [];
  if(!lembar) return out;

  const kepala = cariKepala(lembar.baris, ['kode', 'pengajar']);
  if(!kepala){
    masalah.push(`Lembar "${lembar.nama}" tidak punya kolom "KODE MK" dan "PENGAJAR", jadi dilewati.`);
    return out;
  }

  let kodeAkhir = '', namaAkhir = '', kpAkhir = '';
  for(let i = kepala.indeks + 1; i < lembar.baris.length; i++){
    const baris = lembar.baris[i];
    if(kosong(baris)) continue;
    if(sambunganKe(lembar, i, kepala.kolom, 'pengajar')) continue;

    const kode = ambil(baris, kepala.kolom, 'kode');
    const nama = ambil(baris, kepala.kolom, 'nama');
    const kp   = ambil(baris, kepala.kolom, 'kp');
    if(kode){ kodeAkhir = kode.toUpperCase(); namaAkhir = nama; kpAkhir = ''; }
    else if(nama) namaAkhir = nama;
    if(kp) kpAkhir = kp.toUpperCase();

    const pengajar = ambil(baris, kepala.kolom, 'pengajar');
    if(!pengajar) continue;
    if(!kodeAkhir || !kpAkhir){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": pengajar "${pengajar}" belum jelas mengajar kelas mana.`);
      continue;
    }
    out.push({
      baris: i + 1,
      kode: kodeAkhir, nama: namaAkhir, kp: kpAkhir,
      pengajar, nrp: ambil(baris, kepala.kolom, 'nrp'),
    });
  }
  return out;
}

function bacaClassroom(lembar, masalah){
  const out = [];
  if(!lembar) return out;

  const kepala = cariKepala(lembar.baris, ['kode', 'kp', 'classroom']);
  if(!kepala){
    masalah.push(`Lembar "${lembar.nama}" tidak punya kolom "Kode google classroom", jadi dilewati.`);
    return out;
  }

  let kodeAkhir = '', namaAkhir = '';
  for(let i = kepala.indeks + 1; i < lembar.baris.length; i++){
    const baris = lembar.baris[i];
    if(kosong(baris)) continue;
    if(sambunganKe(lembar, i, kepala.kolom, 'kp')) continue;

    const kode = ambil(baris, kepala.kolom, 'kode');
    const nama = ambil(baris, kepala.kolom, 'nama');
    if(kode){ kodeAkhir = kode.toUpperCase(); namaAkhir = nama; }
    else if(nama) namaAkhir = nama;

    const kp = ambil(baris, kepala.kolom, 'kp');
    const kelas = ambil(baris, kepala.kolom, 'classroom');
    if(!kp && !kelas) continue;
    if(!kodeAkhir || !kp){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": kode kelas daring "${kelas}" belum jelas milik kelas mana.`);
      continue;
    }
    out.push({ baris: i + 1, kode: kodeAkhir, nama: namaAkhir, kp: kp.toUpperCase(), classroom: kelas });
  }
  return out;
}

/*
  Lembar "Contact Koor" punya kebiasaan sendiri: satu koordinator bisa
  memegang beberapa kode mata kuliah sekaligus, dan baris kode berikutnya
  dibiarkan kosong nama koordinatornya. Kekosongan itu berarti "sama dengan
  yang di atas", bukan "belum ada koordinator".
*/
function bacaKoordinator(lembar, masalah){
  const out = [];
  if(!lembar) return out;

  const kepala = cariKepala(lembar.baris, ['kode', 'koordinator']);
  if(!kepala){
    masalah.push(`Lembar "${lembar.nama}" tidak punya kolom "Kode Mata Kuliah" dan "Nama Koordinator", jadi dilewati.`);
    return out;
  }

  let koorAkhir = '', nrpAkhir = '', kontakAkhir = '';
  for(let i = kepala.indeks + 1; i < lembar.baris.length; i++){
    const baris = lembar.baris[i];
    if(kosong(baris)) continue;
    if(sambunganKe(lembar, i, kepala.kolom, 'kode')) continue;

    const kode = ambil(baris, kepala.kolom, 'kode');
    if(!kode) continue;

    const koor = ambil(baris, kepala.kolom, 'koordinator');
    const nrp = ambil(baris, kepala.kolom, 'nrp');
    const kontak = ambil(baris, kepala.kolom, 'kontak');
    if(koor){ koorAkhir = koor; nrpAkhir = nrp; kontakAkhir = kontak; }

    out.push({
      baris: i + 1,
      kode: kode.toUpperCase(),
      nama: ambil(baris, kepala.kolom, 'nama'),
      koordinator: koor || koorAkhir,
      nrp: koor ? nrp : (nrp || nrpAkhir),
      kontak: koor ? kontak : (kontak || kontakAkhir),
    });
  }
  return out;
}

/*
  Membaca satu berkas Excel menjadi kumpulan baris yang siap diperiksa.

  Yang dikembalikan sengaja masih apa adanya, belum dicocokkan dengan isi
  basis data. Pencocokan itu urusan halaman operasional, supaya berkas ini
  tetap bisa diuji sendiri tanpa Firestore.
*/
export async function bacaBerkas(file){
  const XLSX = await muatPembaca();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const masalah = [];
  const lembarJadwal = bacaLembar(XLSX, wb, LEMBAR.jadwal);
  const lembarPengajar = bacaLembar(XLSX, wb, LEMBAR.pengajar);
  const lembarClassroom = bacaLembar(XLSX, wb, LEMBAR.classroom);
  const lembarKoordinator = bacaLembar(XLSX, wb, LEMBAR.koordinator);

  for(const [nama, lembar] of [
    [LEMBAR.jadwal, lembarJadwal], [LEMBAR.pengajar, lembarPengajar],
    [LEMBAR.classroom, lembarClassroom], [LEMBAR.koordinator, lembarKoordinator],
  ]){
    if(!lembar) masalah.push(`Lembar "${nama}" tidak ditemukan di berkas ini, jadi bagian itu dilewati.`);
  }

  const jadwal = bacaJadwal(lembarJadwal, masalah);
  const pengajar = bacaPengajar(lembarPengajar, masalah);
  const classroom = bacaClassroom(lembarClassroom, masalah);
  const koordinator = bacaKoordinator(lembarKoordinator, masalah);

  /*
    Nama mata kuliah kadang dikosongkan di lembar jadwal, biasanya pada kelas
    kampus West yang kodenya sendiri. Namanya dicari ke lembar lain lebih dulu
    sebelum menyerah, karena lembar Tim Pengajar dan google classroom memuat
    nama yang sama untuk kode itu.
  */
  const cadanganNama = new Map();
  for(const r of [...pengajar, ...classroom, ...koordinator]){
    if(r.kode && r.nama && !cadanganNama.has(r.kode)) cadanganNama.set(r.kode, r.nama);
  }
  for(const j of jadwal.jadwal){
    if(!jadwal.matakuliah.has(j.kode) && cadanganNama.has(j.kode)){
      jadwal.matakuliah.set(j.kode, cadanganNama.get(j.kode));
    }
  }

  return {
    lembarTerbaca: [lembarJadwal, lembarPengajar, lembarClassroom, lembarKoordinator]
      .filter(Boolean).map(l => l.nama),
    lembarLain: wb.SheetNames.filter(n =>
      ![lembarJadwal, lembarPengajar, lembarClassroom, lembarKoordinator]
        .filter(Boolean).some(l => l.nama === n)),
    matakuliah: [...jadwal.matakuliah].map(([kode, nama]) => ({ kode, nama })),
    jadwal: jadwal.jadwal,
    pengajar,
    classroom,
    koordinator,
    masalah,
  };
}

/* ============================================================
   Menulis berkas
   ============================================================ */

/*
  Berkas hasil unduhan dibuat semirip mungkin dengan berkas yang biasa digunakan
  pengurus: kepala tabel berwarna, seluruh sel bergaris, dan kode serta nama
  mata kuliah digabung ke bawah untuk semua KP-nya.

  Kemiripan itu bukan sekadar enak dilihat. Berkas ini diedarkan ke asisten,
  ditempel ke grup, dan dicetak. Jika bentuknya berbeda jauh dari yang sudah
  dikenal, yang menerima akan mengira ini berkas lain, lalu kembali menggunakan
  Excel lama yang justru sudah tertinggal.

  Sel gabungannya tetap bisa dibaca ulang oleh halaman ini, karena pembacanya
  memang menerima bentuk itu.
*/

const MERAH = 'FFC00000';
const PUTIH = 'FFFFFFFF';
const ABU_GARIS = 'FF9AA5B1';

const garis = {
  top:    { style: 'thin', color: { argb: ABU_GARIS } },
  left:   { style: 'thin', color: { argb: ABU_GARIS } },
  bottom: { style: 'thin', color: { argb: ABU_GARIS } },
  right:  { style: 'thin', color: { argb: ABU_GARIS } },
};

function gayaKepala(baris){
  baris.height = 26;
  baris.eachCell(sel => {
    sel.font = { bold: true, color: { argb: PUTIH }, size: 11 };
    sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MERAH } };
    sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sel.border = garis;
  });
}

function gayaJudul(ws, teks, jumlahKolom){
  const baris = ws.getRow(1);
  baris.getCell(1).value = teks;
  baris.height = 28;
  ws.mergeCells(1, 1, 1, jumlahKolom);
  const sel = baris.getCell(1);
  sel.font = { bold: true, size: 12, color: { argb: PUTIH } };
  sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MERAH } };
  sel.alignment = { horizontal: 'center', vertical: 'middle' };
  sel.border = garis;
}

/*
  Kolom yang isinya panjang dibiarkan rata kiri, sisanya rata tengah.

  Nama mata kuliah dan nama orang jauh lebih mudah dipindai jika awalnya
  sejajar. Kode, KP, hari, dan jam pendek-pendek, jadi rata tengah membuat
  kolomnya terbaca sebagai satu barisan rapi.
*/
function gayaIsi(ws, barisAwal, kolomKiri){
  for(let r = barisAwal; r <= ws.rowCount; r++){
    const baris = ws.getRow(r);
    for(let c = 1; c <= ws.columnCount; c++){
      const sel = baris.getCell(c);
      sel.border = garis;
      sel.alignment = {
        horizontal: kolomKiri.includes(c) ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };
      sel.font = { size: 11 };
    }
  }
}

/*
  Menggabungkan sel pada kolom tertentu untuk baris berurutan yang nilainya
  sama, misalnya satu kode mata kuliah yang punya lima KP.

  Yang digunakan sebagai penentu kelompok bukan nilai kolom itu sendiri,
  melainkan kunci yang diberikan pemanggil. Dua mata kuliah berbeda yang
  kebetulan bernama sama karena itu tidak ikut tergabung.
*/
function gabungKelompok(ws, kunciBaris, barisAwal, kolom){
  let mulai = 0;
  for(let i = 0; i <= kunciBaris.length; i++){
    const sama = i < kunciBaris.length && kunciBaris[i] === kunciBaris[mulai];
    if(sama) continue;
    if(i - mulai > 1){
      for(const c of kolom) ws.mergeCells(barisAwal + mulai, c, barisAwal + i - 1, c);
    }
    mulai = i;
  }
}

function urutKelas(a, b){
  return String(a.nama || a.kode).localeCompare(String(b.nama || b.kode))
    || String(a.kp).localeCompare(String(b.kp));
}

/*
  Menyusun berkas Excel dari data yang sedang tersimpan.

  Parameter "isi" menggunakan bentuk yang sama dengan yang digunakan halaman
  operasional: matakuliah, jadwal, pengajar, classroom, dan koordinator.
*/
export async function susunBerkas(isi){
  const ExcelJS = await muatPenulis();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KAFBE Hub';
  wb.created = new Date();

  const namaDari = kode => {
    const m = (isi.matakuliah || []).find(x => x.kode === kode);
    return m ? m.nama : '';
  };

  const buatLembar = (nama, kepala, lebar, barisJudul) => {
    const ws = wb.addWorksheet(nama, {
      views: [{ state: 'frozen', ySplit: barisJudul ? 2 : 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    if(barisJudul){
      ws.addRow([]);
      gayaJudul(ws, barisJudul, kepala.length);
    }
    const barisKepala = ws.addRow(kepala);
    gayaKepala(barisKepala);
    ws.columns.forEach((kol, i) => { kol.width = lebar[i]; });
    return ws;
  };

  // ---------- Jadwal + Ruang Kelas ----------
  const jadwal = [...(isi.jadwal || [])]
    .map(j => ({ ...j, nama: namaDari(j.kode) }))
    .sort(urutKelas);

  const wsJadwal = buatLembar(LEMBAR.jadwal,
    ['No', 'Kode Matkul', 'Nama Matkul', 'KP', 'Hari', 'Jam', 'Ruang Kelas'],
    [6, 14, 42, 7, 10, 16, 14]);

  let nomor = 0, kodeSebelum = null;
  const kunciJadwal = [];
  for(const j of jadwal){
    if(j.kode !== kodeSebelum){ nomor++; kodeSebelum = j.kode; }
    kunciJadwal.push(j.kode);
    wsJadwal.addRow([nomor, j.kode, j.nama, j.kp, j.hari,
      rentangJamExcel(j.mulai, j.selesai), j.ruang || '']);
  }
  gayaIsi(wsJadwal, 2, [3]);
  gabungKelompok(wsJadwal, kunciJadwal, 2, [1, 2, 3]);

  // ---------- google classroom ----------
  const classroom = [...(isi.classroom || [])]
    .map(c => ({ ...c, nama: c.nama || namaDari(c.kode) }))
    .sort(urutKelas);

  const wsGc = buatLembar(LEMBAR.classroom,
    ['No', 'Kode Matkul', 'Nama Matkul', 'KP', 'Kode google classroom'],
    [6, 14, 42, 7, 24]);

  nomor = 0; kodeSebelum = null;
  const kunciGc = [];
  for(const c of classroom){
    if(c.kode !== kodeSebelum){ nomor++; kodeSebelum = c.kode; }
    kunciGc.push(c.kode);
    wsGc.addRow([nomor, c.kode, c.nama, c.kp, c.classroom || '']);
  }
  gayaIsi(wsGc, 2, [3]);
  gabungKelompok(wsGc, kunciGc, 2, [1, 2, 3]);

  // ---------- Contact Koor ----------
  const koordinator = [...(isi.koordinator || [])]
    .sort((a, b) => String(a.nama || a.kode).localeCompare(String(b.nama || b.kode)));

  const wsKoor = buatLembar(LEMBAR.koordinator,
    ['Kode Mata Kuliah', 'Mata Kuliah', 'Nama Koordinator', 'NRP', 'WA / Line'],
    [20, 42, 32, 16, 26], 'KOORDINATOR MATA KULIAH KAFBE');

  for(const k of koordinator){
    wsKoor.addRow([k.kode, k.nama || namaDari(k.kode), k.koordinator || '', k.nrp || '', k.kontak || '']);
  }
  gayaIsi(wsKoor, 3, [2, 3]);

  // ---------- Tim Pengajar ----------
  const pengajar = [...(isi.pengajar || [])]
    .map(p => ({ ...p, nama: namaDari(p.kode), pengajar: p.pengajar || p.namaPengajar || '' }))
    .sort((a, b) => urutKelas(a, b) || String(a.pengajar).localeCompare(String(b.pengajar)));

  const wsPengajar = buatLembar(LEMBAR.pengajar,
    ['KODE MK', 'NAMA MK', 'KP', 'PENGAJAR', 'NRP'],
    [14, 42, 7, 34, 16], 'TIM MATA KULIAH');

  const kunciMk = [], kunciKp = [];
  for(const p of pengajar){
    kunciMk.push(p.kode);
    kunciKp.push(p.kode + '|' + p.kp);
    wsPengajar.addRow([p.kode, p.nama, p.kp, p.pengajar, p.nrp || '']);
  }
  gayaIsi(wsPengajar, 3, [2, 4]);
  // Satu KP bisa dipegang beberapa pengajar, jadi kolom KP-nya ikut digabung
  // supaya terbaca bahwa nama-nama itu mengajar kelas yang sama.
  gabungKelompok(wsPengajar, kunciMk, 3, [1, 2]);
  gabungKelompok(wsPengajar, kunciKp, 3, [3]);

  return new Blob([await wb.xlsx.writeBuffer()],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function unduhBlob(blob, namaBerkas){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaBerkas;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Ditunda sebentar supaya unduhan sempat dimulai sebelum tautannya dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
