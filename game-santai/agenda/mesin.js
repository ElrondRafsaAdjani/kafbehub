/*
  Mesin aturan game Agenda Tersembunyi.

  Berkas ini sengaja tidak menyentuh Firebase maupun halaman. Isinya hanya
  fungsi murni: menerima keadaan permainan, mengembalikan keadaan baru. Dengan
  begitu aturannya bisa diuji langsung di Node tanpa membuka peramban, dan
  peramban host cukup memanggil selesaikanRonde() saat voting berakhir.

  ENAM AKSI DAN KENAPA EFEKNYA BERUBAH UBAH

  Setiap kubu memilih satu dari enam aksi. Hasil sebuah aksi bergantung pada
  pilihan kubu yang menjadi targetnya, dan semua kubu memilih bersamaan tanpa
  tahu pilihan lawan. Inilah unsur game theory-nya:

    Serang ke kubu yang Bertahan   : serangan memantul, penyerang yang rugi.
    Serang ke kubu yang Galang     : hasil galangnya dirampas penyerang.
    Serang ke kubu yang mengajakmu : pengkhianatan, untung besar bagi penyerang.
    Saling serang                  : perang terbuka, keduanya rugi.
    Saling bersekutu               : keduanya untung besar.
    Bersekutu tetapi tidak dibalas : target mendapat hadiah kecil darimu.
    Selidiki kubu yang Bertahan    : intel yang diterima palsu.
    Bertahan tanpa diserang        : tameng sia sia, Pengaruh terpakai.

  URUTAN PENYELESAIAN SATU RONDE

    1. Penyelidikan.
    2. Serangan.
    3. Persekutuan.
    4. Galang Kekuatan dan biaya Bertahan.
    5. Dukungan Saksi.
    6. Pemeriksaan eliminasi.
*/

import { TUJUAN, TITIK, targetTujuan } from './skenario.js';

export const KT_AWAL = 6;
export const KT_MAKS = 6;
export const PG_AWAL = 3;
export const MIN_PEMAIN = 5;
export const MAKS_PEMAIN = 90;

// Pengaturan yang bisa diubah host di lobi, beserta batasnya (detik).
export const ATURAN_AWAL = { ronde: 5, briefing: 60, bicara: 60 };
export const BATAS_ATURAN = {
  ronde: { min: 3, maks: 10, langkah: 1 },
  briefing: { min: 30, maks: 300, langkah: 30 },
  bicara: { min: 30, maks: 300, langkah: 30 },
};

// Lama fase yang tidak diatur host, dalam detik.
export const DURASI = { kartu: 45, voting: 60, laporan: 20, bebas: 30 };

export const AKSI = [
  {
    id: 'diam', nama: 'Diam', sifat: 'Netral', target: false,
    ket: 'Kubu tidak melakukan apa pun pada ronde ini.',
    interaksi: [
      'Dipilih otomatis jika voting seri atau tidak ada yang memilih.',
      'Kubu yang diam tetap bisa diserang dan diselidiki seperti biasa.',
    ],
  },
  {
    id: 'galang', nama: 'Galang Kekuatan', sifat: 'Membangun', target: false,
    ket: 'PG kubumu naik 2.',
    interaksi: [
      'Jika ada yang menyerang kubumu pada ronde yang sama, hasil galang dirampas penyerang.',
    ],
  },
  {
    id: 'tameng', nama: 'Bertahan', sifat: 'Bertahan', target: false,
    ket: 'Menangkis semua serangan pada ronde ini.',
    interaksi: [
      'Penyerang yang menabrak tameng kehilangan 1 KT dan 1 PG.',
      'Kubu yang menyelidikimu menerima intel palsu.',
      'Jika tidak ada yang menyerang, tameng memakan 1 PG.',
    ],
  },
  {
    id: 'serang', nama: 'Serang', sifat: 'Menyerang', target: true,
    ket: 'KT target turun 2 dan PG kubumu naik 1.',
    interaksi: [
      'Target Bertahan: serangan memantul, KT dan PG kubumu turun 1.',
      'Target sedang Galang: kubumu merampas hasil galangnya dan PG naik 2.',
      'Target mengajakmu bersekutu: pengkhianatan, KT target turun 3 dan PG kubumu naik 3.',
      'Target juga menyerangmu: perang terbuka, KT kedua kubu turun tanpa tambahan PG.',
    ],
  },
  {
    id: 'sekutu', nama: 'Ajak Bersekutu', sifat: 'Kerja sama', target: true,
    ket: 'Mengajak kubu target bekerja sama.',
    interaksi: [
      'Saling mengajak: PG kedua kubu naik 3 dan KT naik 1.',
      'Tidak dibalas: kubu target mendapat 1 PG dari niat baikmu.',
      'Target Bertahan: ajakan ditolak dan tidak ada efek.',
      'Target menyerangmu: kubumu dikhianati.',
    ],
  },
  {
    id: 'selidiki', nama: 'Selidiki', sifat: 'Intel', target: true,
    ket: 'Kubumu menerima satu laporan intel tentang target.',
    interaksi: [
      'Target Bertahan: intel yang kamu terima palsu.',
      'Target juga menyelidikimu: kedua kubu tahu sedang saling mengintai.',
      'Setiap penyelidikan menambah hitungan Terbongkar target.',
    ],
  },
];

const AKSI_PER_ID = Object.fromEntries(AKSI.map(a => [a.id, a]));

export function infoAksi(idAksi){
  return AKSI_PER_ID[idAksi] || AKSI_PER_ID.diam;
}

export function butuhTarget(idAksi){
  return !!infoAksi(idAksi).target;
}

function keunggulan(sk, idKubu){
  return TUJUAN[sk.kubu[idKubu].tujuan].keunggulan.efek;
}

/* ============================================================
   Alat acak
   ============================================================ */

export function acak(daftar, rng = Math.random){
  const a = daftar.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pilihSatu(daftar, rng){
  return daftar[Math.floor(rng() * daftar.length)];
}

/* ============================================================
   Awal permainan
   ============================================================ */

/*
  Membagi pemain ke kubu secara bergiliran setelah diacak, sehingga selisih
  jumlah anggota antar kubu paling banyak satu orang. Manusia dibagi lebih
  dulu, baru bot, supaya peserta manusia tersebar ke sebanyak mungkin kubu.
*/
export function bagiKubu(daftarUid, daftarKubu, rng = Math.random, daftarBot = []){
  const pemain = acak(daftarUid, rng).concat(acak(daftarBot, rng));
  const kubu = acak(daftarKubu, rng);
  const hasil = {};
  pemain.forEach((uid, i) => { hasil[uid] = kubu[i % kubu.length]; });
  return hasil;
}

export function keadaanAwal(sk, ronde = ATURAN_AWAL.ronde){
  const kubu = {};
  const intel = {};
  const catatan = {};
  for(const id of Object.keys(sk.kubu)){
    kubu[id] = {
      kt: KT_AWAL, pg: PG_AWAL, hidup: true, sebab: '', rondeKeluar: 0,
      diselidiki: 0, diamBeruntun: 0, sekutu: 0,
    };
    intel[id] = [];
    catatan[id] = [];
  }
  return { kubu, intel, catatan, laporan: [], riwayat: [], hasil: {}, target: targetTujuan(ronde) };
}

/* ============================================================
   Rekap voting satu kubu
   ============================================================ */

function gabungNama(daftar){
  if(daftar.length <= 1) return daftar.join('');
  if(daftar.length === 2) return daftar[0] + ' dan ' + daftar[1];
  return daftar.slice(0, -1).join(', ') + ', dan ' + daftar[daftar.length - 1];
}

/*
  Aturannya:
    1. Aksi dengan suara terbanyak yang dijalankan.
    2. Target ditentukan dari suara terbanyak di antara pemilih aksi itu.
    3. Seri pada aksi atau target, atau tidak ada suara, berarti Diam.
*/
export function rekapSuara(sk, idKubu, suara){
  const sah = suara.filter(s => s && AKSI_PER_ID[s.aksi]);
  if(!sah.length){
    return { aksi: 'diam', target: '', alasan: 'Tidak ada anggota yang memilih, jadi kubu otomatis Diam.' };
  }

  const hitung = {};
  for(const s of sah) hitung[s.aksi] = (hitung[s.aksi] || 0) + 1;
  const terbanyak = Math.max(...Object.values(hitung));
  const juara = Object.keys(hitung).filter(a => hitung[a] === terbanyak);
  const nama = a => infoAksi(a).nama;

  if(juara.length > 1){
    const lawan = juara.map(() => terbanyak).join(' lawan ');
    return {
      aksi: 'diam', target: '',
      alasan: `Seri ${lawan} antara ${gabungNama(juara.map(nama))}, jadi kubu otomatis Diam.`,
    };
  }

  const aksi = juara[0];
  if(!butuhTarget(aksi)){
    return { aksi, target: '', alasan: `${nama(aksi)} dipilih dengan ${terbanyak} suara.` };
  }

  const hitungTarget = {};
  for(const s of sah){
    if(s.aksi === aksi && s.target && sk.kubu[s.target] && s.target !== idKubu){
      hitungTarget[s.target] = (hitungTarget[s.target] || 0) + 1;
    }
  }
  const nilai = Object.values(hitungTarget);
  if(!nilai.length){
    return { aksi: 'diam', target: '', alasan: `${nama(aksi)} menang, tetapi targetnya belum dipilih. Kubu otomatis Diam.` };
  }
  const tTerbanyak = Math.max(...nilai);
  const tJuara = Object.keys(hitungTarget).filter(t => hitungTarget[t] === tTerbanyak);
  if(tJuara.length > 1){
    return {
      aksi: 'diam', target: '',
      alasan: `${nama(aksi)} menang, tetapi targetnya seri antara ${gabungNama(tJuara.map(t => sk.kubu[t].nama))}. Kubu otomatis Diam.`,
    };
  }
  return {
    aksi, target: tJuara[0],
    alasan: `${nama(aksi)} terhadap ${sk.kubu[tJuara[0]].nama} dipilih dengan ${terbanyak} suara.`,
  };
}

// Suara Saksi: kubu dengan dukungan terbanyak mendapat 1 PG. Seri berarti
// tidak ada yang mendapat dukungan.
export function rekapSaksi(sk, keadaan, suara){
  const hitung = {};
  for(const s of suara){
    if(s && sk.kubu[s.target] && keadaan.kubu[s.target].hidup){
      hitung[s.target] = (hitung[s.target] || 0) + 1;
    }
  }
  const nilai = Object.values(hitung);
  if(!nilai.length) return '';
  const maks = Math.max(...nilai);
  const juara = Object.keys(hitung).filter(k => hitung[k] === maks);
  return juara.length === 1 ? juara[0] : '';
}

/*
  Pilihan aksi untuk kubu yang seluruh anggotanya bot.

  Bot sengaja dibuat sederhana: memilih acak dengan bobot yang masuk akal
  menurut keadaan dan tipe tujuannya. Bot tidak membaca intel dan tidak
  menyusun strategi panjang. Gunanya hanya supaya permainan tetap bisa dicoba
  walaupun peserta manusia kurang dari lima orang.
*/
export function suaraBot(sk, p, idKubu, rng = Math.random){
  const k = p.kubu[idKubu];
  const d = sk.kubu[idKubu];
  const lawan = Object.keys(sk.kubu).filter(id => id !== idKubu && p.kubu[id].hidup);
  const bobot = [
    ['galang', d.tujuan === 'ambisius' || d.tujuan === 'bayangan' ? 4 : 3],
    ['tameng', k.kt <= 3 ? 3 : 1.2],
    ['diam', k.diamBeruntun ? 0 : 0.2],
  ];
  if(lawan.length){
    bobot.push(['serang', d.tujuan === 'rival' ? 2.2 : 1.3]);
    bobot.push(['sekutu', d.tujuan === 'diplomat' ? 4 : 2]);
    bobot.push(['selidiki', 1.5]);
  }

  const total = bobot.reduce((n, [, b]) => n + b, 0);
  let titik = rng() * total;
  let aksi = 'galang';
  for(const [a, b] of bobot){
    titik -= b;
    if(b > 0 && titik <= 0){ aksi = a; break; }
  }

  let target = '';
  if(butuhTarget(aksi)){
    const sasaran = d.sasaran && p.kubu[d.sasaran] && p.kubu[d.sasaran].hidup ? d.sasaran : '';
    target = sasaran && aksi === 'serang' && rng() < 0.6 ? sasaran : pilihSatu(lawan, rng);
  }
  return { aksi, target };
}

/* ============================================================
   Laporan intel
   ============================================================ */

function teksAksi(sk, aksi, target){
  const nama = infoAksi(aksi).nama;
  return target && sk.kubu[target] ? `${nama} terhadap ${sk.kubu[target].nama}` : nama;
}

/*
  Satu laporan intel tentang kubu "tentang". Jika palsu, isinya dibuat keliru
  dengan bentuk kalimat yang sama persis, sehingga peserta tidak bisa
  membedakan dari tampilannya dan harus menimbangnya sendiri.
*/
function buatIntel(sk, keadaan, A, tentang, palsu, rng){
  const k = sk.kubu[tentang];
  const nama = k.nama;
  const jenis = pilihSatu(['aksi', 'tujuan', 'titik'], rng);

  if(jenis === 'aksi'){
    let aksi = A[tentang] ? A[tentang].aksi : 'diam';
    let target = A[tentang] ? A[tentang].target : '';
    if(palsu){
      aksi = pilihSatu(AKSI.filter(a => a.id !== aksi && a.id !== 'diam').map(a => a.id), rng);
      const calon = Object.keys(sk.kubu).filter(id => id !== tentang && keadaan.kubu[id].hidup);
      target = butuhTarget(aksi) && calon.length ? pilihSatu(calon, rng) : '';
    }
    return `${nama} memilih ${teksAksi(sk, aksi, target)} pada ronde ini.`;
  }

  if(jenis === 'tujuan'){
    let tipe = k.tujuan;
    if(palsu) tipe = pilihSatu(Object.keys(TUJUAN).filter(t => t !== tipe), rng);
    return `Tujuan ${nama} berkaitan dengan ${TUJUAN[tipe].kategori}.`;
  }

  let titik = k.titik;
  if(palsu) titik = pilihSatu(Object.keys(TITIK).filter(t => t !== titik), rng);
  return `Titik lemah ${nama} adalah ${TITIK[titik].nama}.`;
}

/* ============================================================
   Penyelesaian satu ronde
   ============================================================ */

/*
  p          : keadaan permainan (kubu, intel, catatan, laporan, riwayat)
  sk         : skenario dari skenario.js
  keputusan  : { idKubu: { aksi, target, alasan } } hasil rekapSuara
  ronde      : nomor ronde yang sedang diselesaikan
  saksiKubu  : kubu yang didukung Saksi, atau string kosong
  rng        : pembangkit angka acak, bisa diganti saat pengujian

  Mengembalikan keadaan baru tanpa mengubah p.
*/
export function selesaikanRonde(p, sk, keputusan, ronde, saksiKubu = '', rng = Math.random){
  const S = JSON.parse(JSON.stringify({
    kubu: p.kubu, intel: p.intel, catatan: p.catatan,
    laporan: p.laporan || [], riwayat: p.riwayat || [],
  }));
  const ids = Object.keys(sk.kubu);
  const hidup = ids.filter(id => S.kubu[id].hidup);
  const nama = id => sk.kubu[id].nama;

  const catat = (id, teks) => S.catatan[id].push({ ronde, teks });
  const peristiwa = {};
  const kabar = (id, teks) => { (peristiwa[id] = peristiwa[id] || []).push(teks); };

  // ---------- Keputusan akhir tiap kubu ----------
  const A = {};
  const hasil = {};
  for(const id of hidup){
    let { aksi = 'diam', target = '', alasan = '' } = keputusan[id] || {};
    if(!AKSI_PER_ID[aksi]) aksi = 'diam';
    if(butuhTarget(aksi)){
      if(!target || target === id || !S.kubu[target] || !S.kubu[target].hidup){
        aksi = 'diam'; target = '';
        alasan = 'Target yang dipilih sudah tidak bisa dijangkau. Kubu otomatis Diam.';
      }
    } else {
      target = '';
    }
    A[id] = { aksi, target };
    hasil[id] = { aksi, target, alasan };
  }
  const memilih = (id, aksi, target) => A[id] && A[id].aksi === aksi && (target === undefined || A[id].target === target);

  const tameng = new Set(hidup.filter(id => A[id].aksi === 'tameng'));
  const tamengKena = new Set();
  const dirampas = new Set();
  const dikhianati = new Set();
  const diserangOleh = Object.fromEntries(hidup.map(id => [id, new Set()]));
  const pgTambah = Object.fromEntries(hidup.map(id => [id, 0]));
  const pgKurang = Object.fromEntries(hidup.map(id => [id, 0]));
  const awal = Object.fromEntries(hidup.map(id => [id, { kt: S.kubu[id].kt, pg: S.kubu[id].pg }]));

  // ---------- 1. Penyelidikan ----------
  for(const id of hidup){
    if(!memilih(id, 'selidiki')) continue;
    const t = A[id].target;
    S.kubu[t].diselidiki += 1;
    const palsu = tameng.has(t) || (keunggulan(sk, t) === 'licin' && rng() < 0.5);
    S.intel[id].push({ ronde, tentang: t, palsu, teks: buatIntel(sk, S, A, t, palsu, rng) });
    catat(id, `Penyelidikan terhadap ${nama(t)} selesai. Laporan intel baru masuk.`);
    if(memilih(t, 'selidiki', id)) catat(id, `${nama(t)} ternyata juga sedang menyelidiki kubu kalian.`);
  }

  // ---------- 2. Serangan ----------
  for(const id of hidup){
    if(!memilih(id, 'serang')) continue;
    const t = A[id].target;

    if(tameng.has(t)){
      S.kubu[id].kt -= 1;
      pgKurang[id] += 1;
      tamengKena.add(t);
      catat(id, `Serangan kalian ke ${nama(t)} memantul karena mereka Bertahan. KT dan PG kalian turun 1.`);
      catat(t, 'Tameng kalian menangkis sebuah serangan.');
      kabar(t, 'Menangkis serangan');
      kabar(id, 'Terluka oleh serangan yang memantul');
      continue;
    }

    let kekuatan = 2;
    if(keunggulan(sk, id) === 'dendam' && sk.kubu[id].sasaran === t) kekuatan += 1;

    if(memilih(t, 'sekutu', id)){
      kekuatan += 1;
      pgTambah[id] += 3;
      dikhianati.add(t);
      catat(id, `Kalian mengkhianati ${nama(t)} yang mengajak bersekutu. PG kalian naik 3.`);
      catat(t, `${nama(id)} yang kalian ajak bersekutu justru menyerang kalian.`);
      kabar(t, 'Dikhianati');
    } else if(memilih(t, 'serang', id)){
      catat(id, `Perang terbuka dengan ${nama(t)}. Kedua kubu saling melukai tanpa keuntungan.`);
    } else if(memilih(t, 'galang')){
      pgTambah[id] += 2;
      dirampas.add(t);
      catat(id, `Kalian merampas hasil galang ${nama(t)}. PG kalian naik 2.`);
      kabar(t, 'Hasil galangnya dirampas');
    } else {
      pgTambah[id] += 1;
      catat(id, `Serangan kalian ke ${nama(t)} berhasil.`);
    }
    S.kubu[t].kt -= kekuatan;
    diserangOleh[t].add(id);
    kabar(t, 'Terkena serangan');
  }

  // ---------- 3. Persekutuan ----------
  for(const id of hidup){
    if(!memilih(id, 'sekutu')) continue;
    const t = A[id].target;
    if(memilih(t, 'sekutu', id)){
      pgTambah[id] += 3 + (keunggulan(sk, id) === 'runding' ? 1 : 0);
      S.kubu[id].kt += 1;
      S.kubu[id].sekutu += 1;
      catat(id, `Persekutuan dengan ${nama(t)} berhasil. PG kalian naik dan KT pulih 1.`);
      kabar(id, `Bersekutu dengan ${nama(t)}`);
    } else if(memilih(t, 'serang', id)){
      // Sudah dicatat sebagai pengkhianatan pada langkah serangan.
    } else if(tameng.has(t)){
      catat(id, `${nama(t)} sedang Bertahan dan menolak ajakan kalian.`);
    } else {
      pgTambah[t] += 1;
      catat(id, `Ajakan kalian kepada ${nama(t)} tidak dibalas. Mereka tetap mendapat 1 PG dari niat baik kalian.`);
      catat(t, `${nama(id)} mengajak kalian bersekutu. Kalian mendapat 1 PG dari niat baik mereka.`);
      kabar(t, 'Menerima niat baik');
    }
  }

  // ---------- 4. Galang dan biaya Bertahan ----------
  for(const id of hidup){
    if(memilih(id, 'galang')){
      if(dirampas.has(id)) catat(id, 'Hasil galang kalian dirampas oleh kubu yang menyerang.');
      else pgTambah[id] += keunggulan(sk, id) === 'galangPlus' ? 3 : 2;
    }
    if(tameng.has(id) && !tamengKena.has(id) && keunggulan(sk, id) !== 'tamengHemat'){
      pgKurang[id] += 1;
      catat(id, 'Tidak ada yang menyerang, jadi tameng kalian memakan 1 PG.');
    }
  }

  // ---------- 5. Dukungan Saksi ----------
  if(saksiKubu && S.kubu[saksiKubu] && S.kubu[saksiKubu].hidup){
    pgTambah[saksiKubu] += 1;
    kabar(saksiKubu, 'Mendapat dukungan Saksi');
  }

  // ---------- Terapkan nilai ----------
  for(const id of hidup){
    const k = S.kubu[id];
    k.pg = Math.max(0, k.pg + pgTambah[id] - pgKurang[id]);
    k.kt = Math.max(0, Math.min(KT_MAKS, k.kt));
    k.diamBeruntun = A[id].aksi === 'diam' ? k.diamBeruntun + 1 : 0;
  }

  // ---------- 6. Eliminasi ----------
  for(const id of hidup){
    const k = S.kubu[id];
    let sebab = '';
    if(k.kt <= 0) sebab = 'Ketahanan habis';
    else {
      switch(sk.kubu[id].titik){
        case 'T1': if(diserangOleh[id].size >= 2) sebab = TITIK.T1.nama; break;
        case 'T2': if(k.diselidiki >= 3) sebab = TITIK.T2.nama; break;
        case 'T3': if(ronde >= 2 && k.pg === 0) sebab = TITIK.T3.nama; break;
        case 'T4': if(dikhianati.has(id)) sebab = TITIK.T4.nama; break;
        case 'T5': if(k.diamBeruntun >= 2) sebab = TITIK.T5.nama; break;
      }
    }
    if(sebab){
      k.hidup = false;
      k.sebab = sebab;
      k.rondeKeluar = ronde;
      catat(id, `Kubu kalian tereliminasi karena ${sebab}.`);
    }
  }

  // ---------- Laporan publik: akibat tanpa pelaku ----------
  const baris = hidup.map(id => ({
    kubu: id,
    ktDari: awal[id].kt, ktJadi: S.kubu[id].kt,
    pgDari: awal[id].pg, pgJadi: S.kubu[id].pg,
    peristiwa: peristiwa[id] || [],
    keluar: S.kubu[id].hidup ? '' : S.kubu[id].sebab,
  }));
  S.laporan.push({ ronde, baris, umum: [] });
  S.riwayat.push({ ronde, aksi: A });

  return { ...S, hasil };
}

/* ============================================================
   Akhir permainan
   ============================================================ */

export function jumlahHidup(p){
  return Object.values(p.kubu).filter(k => k.hidup).length;
}

export function nilaiAkhir(p, sk){
  const t = p.target || targetTujuan(ATURAN_AWAL.ronde);
  const tersingkir = Object.values(p.kubu).filter(k => !k.hidup).length;
  const hasil = {};
  for(const id of Object.keys(sk.kubu)){
    const k = p.kubu[id];
    const d = sk.kubu[id];
    let berhasil = false;
    let alasan = '';
    if(!k.hidup){
      alasan = `Tereliminasi pada ronde ${k.rondeKeluar} karena ${k.sebab}.`;
    } else {
      switch(d.tujuan){
        case 'ambisius':
          berhasil = k.pg >= t.ambisius;
          alasan = `Pengaruh akhir ${k.pg} dari target ${t.ambisius}.`;
          break;
        case 'penjaga':
          berhasil = tersingkir <= t.penjaga;
          alasan = `${tersingkir} kubu tereliminasi, batasnya ${t.penjaga} kubu.`;
          break;
        case 'rival': {
          const s = p.kubu[d.sasaran];
          berhasil = !s.hidup || s.pg < k.pg;
          alasan = !s.hidup
            ? `${sk.kubu[d.sasaran].nama} tereliminasi.`
            : `Pengaruh kalian ${k.pg}, Pengaruh ${sk.kubu[d.sasaran].nama} ${s.pg}.`;
          break;
        }
        case 'diplomat':
          berhasil = k.sekutu >= t.diplomat;
          alasan = `Berhasil bersekutu ${k.sekutu} kali dari target ${t.diplomat} kali.`;
          break;
        case 'bayangan':
          berhasil = k.pg >= t.bayangan;
          alasan = `Pengaruh akhir ${k.pg} dari target ${t.bayangan}.`;
          break;
      }
    }
    hasil[id] = { berhasil, alasan };
  }
  return hasil;
}
