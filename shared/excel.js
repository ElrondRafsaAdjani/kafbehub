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
       ke bawah untuk KP berikutnya. Sel di bawahnya terbaca kosong.
    2. Ada baris kosong penyekat antar mata kuliah.
    3. Di tengah satu kelompok bisa muncul kode lain, misalnya kelas kampus
       West yang kodenya berbeda dari kelas kampus utama.
    4. Jam ditulis "13.00 - 14.40", bukan dua kolom jam mulai dan selesai.

  Karena itu nilai yang kosong diwariskan dari baris di atasnya, kecuali kalau
  barisnya memang membawa kode baru.
*/

/*
  Membaca dan menulis .xlsx berarti membongkar berkas zip berisi XML, jadi
  pekerjaan itu diserahkan ke pustaka SheetJS.

  Berkasnya disimpan di dalam repo, bukan diambil dari CDN. Halaman ini dipakai
  pengurus di ruang kelas dengan sambungan seadanya, dan sekali CDN-nya
  terhalang, seluruh tab Excel mati tanpa bisa diperbaiki dari sini. Menyimpan
  sendiri juga berarti tidak ada pihak ketiga yang perlu dipercaya setiap kali
  halaman dibuka.

  Versinya dikunci di 0.18.5, diambil dari cdnjs, dan isinya sudah dicocokkan
  dengan sidik resmi yang diumumkan cdnjs:

    sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==

  Kalau suatu saat berkasnya diperbarui, cocokkan lagi sidiknya sebelum
  dimasukkan ke repo.

  Pemuatannya ditunda sampai tombolnya benar-benar dipakai. Ukurannya sekitar
  900 kB, dan pengurus yang cuma membetulkan satu jadwal tidak perlu menunggu.
*/
const PUSTAKA = new URL('./vendor/xlsx.full.min.js', import.meta.url).href;

let janjiPustaka = null;

export function muatPustaka(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(janjiPustaka) return janjiPustaka;

  janjiPustaka = new Promise((selesai, gagal) => {
    const s = document.createElement('script');
    s.src = PUSTAKA;
    s.onload = () => window.XLSX
      ? selesai(window.XLSX)
      : gagal(new Error('Pustaka Excel termuat tapi tidak bisa dipakai.'));
    s.onerror = () => {
      janjiPustaka = null;
      gagal(new Error('Pustaka pembaca Excel gagal dimuat. Muat ulang halaman ini, lalu coba lagi.'));
    };
    document.head.appendChild(s);
  });
  return janjiPustaka;
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

// "13:00" menjadi "13.00", bentuk yang dipakai di dalam berkas Excel.
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
function cariLembar(wb, nama){
  const cari = kunci(nama);
  const persis = wb.SheetNames.find(n => kunci(n) === cari);
  if(persis) return persis;
  return wb.SheetNames.find(n => kunci(n).includes(cari) || cari.includes(kunci(n))) || null;
}

function bacaLembar(XLSX, wb, nama){
  const asli = cariLembar(wb, nama);
  if(!asli) return null;
  const baris = XLSX.utils.sheet_to_json(wb.Sheets[asli], {
    header: 1, raw: false, defval: '', blankrows: true,
  });
  return { nama: asli, baris };
}

/*
  Lembar "Jadwal + Ruang Kelas" menjadi dua hal sekaligus: daftar mata kuliah
  dan daftar kelas. Keduanya memang satu tabel di Excel, tapi di basis data
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

    const kode = ambil(baris, kepala.kolom, 'kode');
    const nama = ambil(baris, kepala.kolom, 'nama');
    const kp   = ambil(baris, kepala.kolom, 'kp');

    /*
      Kode baru memutus warisan dari baris di atasnya. Tanpa ini, kelas West
      yang kodenya sendiri akan tertulis sebagai kelas mata kuliah sebelumnya.

      Namanya lain cerita. Ada kode yang kolom namanya memang dibiarkan kosong
      karena mata kuliahnya sama dengan baris di atasnya, hanya beda kode
      kurikulum. Nama itu diwarisi, tapi diberitahukan, supaya pengurus bisa
      membetulkan kalau tebakannya keliru.
    */
    if(kode){
      kodeAkhir = kode.toUpperCase();
      if(nama) namaAkhir = nama;
      else if(namaAkhir){
        masalah.push(`Baris ${i + 1} lembar "${lembar.nama}": kode ${kodeAkhir} tidak diberi nama mata kuliah, jadi dipakai nama dari baris di atasnya, "${namaAkhir}".`);
      }
    }
    else if(nama) namaAkhir = nama;

    if(!kp) continue;
    if(!kodeAkhir){
      masalah.push(`Baris ${i + 1} lembar "${lembar.nama}" punya KP tapi tidak punya kode mata kuliah.`);
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
  const XLSX = await muatPustaka();
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
  Berkas hasil unduhan sengaja mengisi kode dan nama mata kuliah di SETIAP
  baris, tidak digabung ke bawah seperti berkas aslinya.

  Sel gabungan enak dilihat tapi menyulitkan penyaringan dan pengurutan di
  Excel, dan gampang rusak begitu ada baris disisipkan. Berkas ini tetap bisa
  diunggah kembali ke halaman operasional, karena pembacanya menerima kedua
  bentuk itu.
*/
function lembarDari(XLSX, kepala, baris, lebar){
  const ws = XLSX.utils.aoa_to_sheet([kepala, ...baris]);
  ws['!cols'] = lebar.map(w => ({ wch: w }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function urutKelas(a, b){
  return String(a.nama || a.kode).localeCompare(String(b.nama || b.kode))
    || String(a.kp).localeCompare(String(b.kp));
}

/*
  Menyusun berkas Excel dari data yang sedang tersimpan.

  Parameter "isi" memakai bentuk yang sama dengan yang dipakai halaman
  operasional: matakuliah, jadwal, pengajar, classroom, dan koordinator.
*/
export async function susunBerkas(isi){
  const XLSX = await muatPustaka();
  const wb = XLSX.utils.book_new();

  const namaDari = kode => {
    const m = (isi.matakuliah || []).find(x => x.kode === kode);
    return m ? m.nama : '';
  };

  // ---------- Jadwal + Ruang Kelas ----------
  const jadwal = [...(isi.jadwal || [])]
    .map(j => ({ ...j, nama: namaDari(j.kode) }))
    .sort(urutKelas);

  let nomor = 0, kodeSebelum = '';
  const barisJadwal = jadwal.map(j => {
    const baru = j.kode !== kodeSebelum;
    if(baru){ nomor++; kodeSebelum = j.kode; }
    return [
      baru ? nomor : '', j.kode, j.nama, j.kp, j.hari,
      rentangJamExcel(j.mulai, j.selesai), j.ruang || '',
    ];
  });
  XLSX.utils.book_append_sheet(wb, lembarDari(XLSX,
    ['No', 'Kode Matkul', 'Nama Matkul', 'KP', 'Hari', 'Jam', 'Ruang Kelas'],
    barisJadwal, [5, 12, 40, 6, 8, 16, 12]), LEMBAR.jadwal);

  // ---------- google classroom ----------
  const classroom = [...(isi.classroom || [])].sort(urutKelas);
  nomor = 0; kodeSebelum = '';
  const barisClassroom = classroom.map(c => {
    const baru = c.kode !== kodeSebelum;
    if(baru){ nomor++; kodeSebelum = c.kode; }
    return [baru ? nomor : '', c.kode, c.nama || namaDari(c.kode), c.kp, c.classroom || ''];
  });
  XLSX.utils.book_append_sheet(wb, lembarDari(XLSX,
    ['No', 'Kode Matkul', 'Nama Matkul', 'KP', 'Kode google classroom'],
    barisClassroom, [5, 12, 40, 6, 22]), LEMBAR.classroom);

  // ---------- Contact Koor ----------
  const koordinator = [...(isi.koordinator || [])]
    .sort((a, b) => String(a.nama || a.kode).localeCompare(String(b.nama || b.kode)));
  XLSX.utils.book_append_sheet(wb, lembarDari(XLSX,
    ['Kode Mata Kuliah', 'Mata Kuliah', 'Nama Koordinator', 'NRP', 'WA / Line'],
    koordinator.map(k => [k.kode, k.nama || namaDari(k.kode), k.koordinator || '', k.nrp || '', k.kontak || '']),
    [18, 40, 30, 14, 24]), LEMBAR.koordinator);

  // ---------- Tim Pengajar ----------
  const pengajar = [...(isi.pengajar || [])]
    .map(p => ({ ...p, nama: namaDari(p.kode) }))
    .sort((a, b) => urutKelas(a, b) || String(a.pengajar || a.namaPengajar).localeCompare(String(b.pengajar || b.namaPengajar)));
  XLSX.utils.book_append_sheet(wb, lembarDari(XLSX,
    ['KODE MK', 'NAMA MK', 'KP', 'PENGAJAR', 'NRP'],
    pengajar.map(p => [p.kode, p.nama, p.kp, p.pengajar || p.namaPengajar || '', p.nrp || '']),
    [12, 40, 6, 32, 14]), LEMBAR.pengajar);

  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
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
