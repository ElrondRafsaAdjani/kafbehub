/*
  Mesin aturan game Agenda Tersembunyi.

  Berkas ini sengaja tidak menyentuh Firebase maupun halaman. Isinya hanya
  fungsi murni: menerima keadaan permainan, mengembalikan keadaan baru. Dengan
  begitu aturannya bisa diuji langsung di Node tanpa membuka peramban, dan
  peramban host cukup memanggil selesaikanRonde() saat voting berakhir.

  YANG MENJALANKAN BERKAS INI

  Hanya peramban host. Situs ini tidak punya server sendiri, jadi host yang
  menghitung hasil ronde lalu menuliskannya ke Firestore untuk dibaca semua
  peserta. Peserta lain memakai berkas ini sebatas untuk daftar aksi dan nama.

  URUTAN PENYELESAIAN SATU RONDE (semua aksi terjadi bersamaan)

    1. Pemulihan: Pulihkan Diri dan aksi khas yang menambah KT.
    2. Intel: Selidiki dan Sebar Rumor.
    3. Serangan: Serang, Sabotase, dan aksi khas yang menyerang.
    4. Persekutuan.
    5. Penambahan Pengaruh dan aksi khas lainnya.
    6. Pemeriksaan eliminasi.
*/

import { TUJUAN, TITIK } from './skenario.js';

export const KT_AWAL = 6;
export const KT_MAKS = 6;
export const PG_AWAL = 3;
export const JUMLAH_RONDE = 5;
export const MIN_PEMAIN = 5;
export const MAKS_PEMAIN = 90;

// Lama tiap fase dalam detik.
export const DURASI = {
  kartu: 60,
  briefing: 60,
  bicara: 60,
  bebas: 30,
  voting: 60,
  laporan: 20,
};

export const AKSI = [
  { id: 'diam',     nama: 'Diam',            sifat: 'Netral',     target: false,
    ket: 'Tidak ada efek. Aksi ini juga dipilih otomatis jika voting seri atau tidak ada yang memilih.' },
  { id: 'galang',   nama: 'Galang Kekuatan', sifat: 'Netral',     target: false,
    ket: 'PG naik 2.' },
  { id: 'tameng',   nama: 'Pasang Tameng',   sifat: 'Bertahan',   target: false,
    ket: 'Kebal terhadap Serang dan Sabotase pada ronde ini. Tidak bisa dipilih dua ronde beruntun.' },
  { id: 'pulih',    nama: 'Pulihkan Diri',   sifat: 'Bertahan',   target: false,
    ket: 'KT naik 2 dengan batas maksimal 6.' },
  { id: 'serang',   nama: 'Serang',          sifat: 'Menyerang',  target: true,
    ket: 'KT target turun 2 dan PG kubumu naik 1. Jika target memasang tameng, serangan gagal dan PG kubumu turun 1.' },
  { id: 'sabotase', nama: 'Sabotase',        sifat: 'Menyerang',  target: true,
    ket: 'PG target turun 2. Gagal jika target memasang tameng.' },
  { id: 'selidiki', nama: 'Selidiki',        sifat: 'Intel',      target: true,
    ket: 'Kubumu menerima satu laporan intel yang benar tentang target. Target tidak tahu siapa yang menyelidikinya.' },
  { id: 'rumor',    nama: 'Sebar Rumor',     sifat: 'Intel',      target: true,
    ket: 'PG target turun 1 dan target menerima satu laporan intel palsu yang tampilannya sama persis dengan laporan asli.' },
  { id: 'sekutu',   nama: 'Ajak Bersekutu',  sifat: 'Kerja sama', target: true,
    ket: 'Jika target juga mengajak kubumu, PG kedua kubu naik 3. Jika target justru menyerang, kerugian kubumu bertambah 1 dan penyerang mendapat tambahan 1 PG.' },
  { id: 'khas',     nama: 'Aksi Khas',       sifat: 'Khusus',     target: false,
    ket: 'Berbeda untuk tiap kubu dan hanya bisa dipakai sekali dalam satu permainan.' },
];

const AKSI_PER_ID = Object.fromEntries(AKSI.map(a => [a.id, a]));

// Aksi khas yang dihitung sebagai serangan, termasuk untuk titik lemah
// Dikeroyok dan untuk memicu Mogok Massal.
const KHAS_MENYERANG = new Set(['pasarGelap', 'razia']);

export function infoAksi(sk, idKubu, idAksi){
  if(idAksi === 'khas'){
    const k = sk.kubu[idKubu].khas;
    return { id: 'khas', nama: k.nama, sifat: 'Aksi khas', target: k.target, ket: k.ket };
  }
  return AKSI_PER_ID[idAksi] || AKSI_PER_ID.diam;
}

export function butuhTarget(sk, idKubu, idAksi){
  return !!infoAksi(sk, idKubu, idAksi).target;
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
  jumlah anggota antar kubu paling banyak satu orang. Urutan kubunya ikut
  diacak supaya kubu yang kebagian anggota lebih banyak tidak selalu sama.
*/
export function bagiKubu(daftarUid, daftarKubu, rng = Math.random, daftarBot = []){
  // Manusia dibagi lebih dulu, baru bot. Dengan begitu peserta manusia
  // tersebar ke sebanyak mungkin kubu dan bot hanya mengisi sisanya.
  const pemain = acak(daftarUid, rng).concat(acak(daftarBot, rng));
  const kubu = acak(daftarKubu, rng);
  const hasil = {};
  pemain.forEach((uid, i) => { hasil[uid] = kubu[i % kubu.length]; });
  return hasil;
}

export function keadaanAwal(sk){
  const kubu = {};
  for(const id of Object.keys(sk.kubu)){
    kubu[id] = {
      kt: KT_AWAL, pg: PG_AWAL, hidup: true, sebab: '', rondeKeluar: 0,
      diselidiki: 0, diamBeruntun: 0, sekutu: 0,
      khas: false, tamengLalu: false, karantina: 0, larangan: [],
    };
  }
  const intel = {};
  const catatan = {};
  for(const id of Object.keys(sk.kubu)){ intel[id] = []; catatan[id] = []; }
  return { kubu, intel, catatan, laporan: [], riwayat: [], hasil: {} };
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
  const nama = a => infoAksi(sk, idKubu, a).nama;

  if(juara.length > 1){
    const lawan = juara.map(() => terbanyak).join(' lawan ');
    return {
      aksi: 'diam', target: '',
      alasan: `Seri ${lawan} antara ${gabungNama(juara.map(nama))}, jadi kubu otomatis Diam.`,
    };
  }

  const aksi = juara[0];
  if(!butuhTarget(sk, idKubu, aksi)){
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
  const bobot = [];
  const tambah = (aksi, nilai) => {
    if(nilai <= 0 || aksiTerkunci(p, idKubu, aksi)) return;
    if(butuhTarget(sk, idKubu, aksi) && !lawan.length) return;
    bobot.push([aksi, nilai]);
  };
  tambah('galang', d.tujuan === 'ambisius' || d.tujuan === 'bayangan' ? 4 : 3);
  tambah('pulih', k.kt <= 3 ? 4 : 0.5);
  tambah('tameng', k.kt <= 4 ? 2 : 1);
  tambah('sekutu', d.tujuan === 'diplomat' ? 4 : 2);
  tambah('selidiki', 1.5);
  tambah('serang', d.tujuan === 'rival' ? 2 : 1);
  tambah('sabotase', d.tujuan === 'rival' ? 2 : 1);
  tambah('rumor', 0.7);
  tambah('khas', 1);

  const total = bobot.reduce((n, [, b]) => n + b, 0);
  let titik = rng() * total;
  let aksi = 'galang';
  for(const [a, b] of bobot){
    titik -= b;
    if(titik <= 0){ aksi = a; break; }
  }

  let target = '';
  if(butuhTarget(sk, idKubu, aksi)){
    const sasaran = d.sasaran && p.kubu[d.sasaran] && p.kubu[d.sasaran].hidup ? d.sasaran : '';
    const menyerang = ['serang', 'sabotase', 'rumor'].includes(aksi);
    target = sasaran && menyerang && rng() < 0.6 ? sasaran : pilihSatu(lawan, rng);
  }
  return { aksi, target };
}

/*
  Aksi yang boleh dipilih kubu pada ronde ini. Dipakai halaman voting untuk
  mematikan pilihan, dan dipakai lagi oleh selesaikanRonde() supaya suara yang
  lolos dari halaman tetap tidak dijalankan.
*/
export function aksiTerkunci(keadaan, idKubu, idAksi){
  const k = keadaan.kubu[idKubu];
  if(idAksi === 'tameng' && k.tamengLalu) return 'Tameng tidak bisa dipakai dua ronde beruntun.';
  if(idAksi === 'khas' && k.khas) return 'Aksi khas sudah dipakai.';
  return '';
}

/* ============================================================
   Laporan intel
   ============================================================ */

function teksAksi(sk, idKubu, aksi, target){
  const nama = infoAksi(sk, idKubu, aksi).nama;
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
      const pilihan = AKSI.filter(a => a.id !== aksi && a.id !== 'khas' && a.id !== 'diam').map(a => a.id);
      aksi = pilihSatu(pilihan, rng);
      const calon = Object.keys(sk.kubu).filter(id => id !== tentang && keadaan.kubu[id].hidup);
      target = AKSI_PER_ID[aksi].target && calon.length ? pilihSatu(calon, rng) : '';
    }
    return `${nama} memilih ${teksAksi(sk, tentang, aksi, target)} pada ronde ini.`;
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
  const intelUntuk = (id, tentang, palsu) => {
    S.intel[id].push({ ronde, tentang, palsu, teks: buatIntel(sk, S, A, tentang, palsu, rng) });
  };

  // ---------- Keputusan akhir tiap kubu ----------
  const A = {};
  const hasil = {};
  for(const id of hidup){
    const k = S.kubu[id];
    let { aksi = 'diam', target = '', alasan = '' } = keputusan[id] || {};
    if(!AKSI_PER_ID[aksi]) aksi = 'diam';

    if(k.karantina === ronde){
      aksi = 'diam'; target = '';
      alasan = 'Kubu sedang dikarantina, jadi otomatis Diam pada ronde ini.';
    } else {
      const kunci = aksiTerkunci(S, id, aksi);
      if(kunci){ aksi = 'diam'; target = ''; alasan = kunci + ' Kubu otomatis Diam.'; }
    }
    if(butuhTarget(sk, id, aksi)){
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

  const efekKhas = id => (A[id] && A[id].aksi === 'khas') ? sk.kubu[id].khas.efek : '';

  // ---------- Penanda yang berlaku sepanjang ronde ----------
  const tameng = new Set();
  const kebal = new Set();      // Kamar Pribadi: tidak tersentuh aksi kubu lain
  const lindung = new Set();    // Garis Polisi: serangan ke kubu ini batal
  const bungkam = new Set();    // Rapat Desa: kubu ini tidak bisa berbuat jahat
  const blokade = new Set();    // Blokade Dermaga: kenaikan PG dibatalkan
  const hapusJejak = new Set();
  const mogok = new Set();
  let siaga = false;

  for(const id of hidup){
    const a = A[id];
    if(a.aksi === 'tameng') tameng.add(id);
    switch(efekKhas(id)){
      case 'ronda': tameng.add(id); tameng.add(a.target); break;
      case 'kebal': kebal.add(id); break;
      case 'garis': lindung.add(a.target); break;
      case 'rapat': bungkam.add(a.target); break;
      case 'blokade': blokade.add(a.target); break;
      case 'hapusJejak': hapusJejak.add(id); break;
      case 'mogok': mogok.add(id); break;
      case 'siaga': siaga = true; break;
    }
  }

  // Aksi bermusuhan dari "pelaku" ke "sasaran" yang dibatalkan.
  const dicegah = (pelaku, sasaran) => {
    if(kebal.has(sasaran)) return `${nama(sasaran)} tidak bisa dijangkau pada ronde ini.`;
    if(bungkam.has(pelaku)) return 'Kubu kalian tidak bisa berbuat apa pun terhadap kubu lain karena Rapat Desa.';
    if(S.kubu[pelaku].larangan.some(l => l.dari === sasaran && l.ronde === ronde)){
      return `Kubu kalian sudah menerima uang tutup mulut dari ${nama(sasaran)}.`;
    }
    return '';
  };

  const pgTambah = Object.fromEntries(hidup.map(id => [id, 0]));
  const pgKurang = Object.fromEntries(hidup.map(id => [id, 0]));
  const rusak = Object.fromEntries(hidup.map(id => [id, 0]));
  const diserangOleh = Object.fromEntries(hidup.map(id => [id, new Set()]));
  const dikhianati = new Set();
  const awal = Object.fromEntries(hidup.map(id => [id, { kt: S.kubu[id].kt, pg: S.kubu[id].pg }]));
  const tambahKT = (id, n) => { S.kubu[id].kt = Math.min(KT_MAKS, S.kubu[id].kt + n); };

  // ---------- 1. Pemulihan ----------
  for(const id of hidup){
    const a = A[id];
    if(a.aksi === 'pulih') tambahKT(id, 2);
    const e = efekKhas(id);
    if(e === 'triase'){
      tambahKT(id, 2);
      if(kebal.has(a.target)) catat(id, `${nama(a.target)} tidak bisa dijangkau, jadi hanya kubu kalian yang pulih.`);
      else { tambahKT(a.target, 2); kabar(a.target, 'Mendapat bantuan pemulihan'); }
    }
    if(e === 'jaringan'){
      for(const lain of hidup) if(!kebal.has(lain) || lain === id) tambahKT(lain, 1);
      kabar(id, 'Memulihkan jaringan untuk semua kubu');
    }
    if(e === 'genset' && !kebal.has(a.target)) tambahKT(a.target, 1);
  }

  // ---------- 2. Intel ----------
  for(const id of hidup){
    const a = A[id];
    const e = efekKhas(id);
    if(a.aksi === 'selidiki' || e === 'razia'){
      const t = a.target;
      if(kebal.has(t)){
        catat(id, `Penyelidikan terhadap ${nama(t)} gagal karena target tidak bisa dijangkau.`);
      } else {
        S.kubu[t].diselidiki += 1;
        intelUntuk(id, t, hapusJejak.has(t));
        catat(id, `Penyelidikan terhadap ${nama(t)} selesai. Laporan intel baru masuk.`);
      }
    }
    if(a.aksi === 'rumor'){
      const t = a.target;
      const cegah = dicegah(id, t);
      if(cegah){ catat(id, 'Rumor kalian tidak beredar. ' + cegah); continue; }
      pgKurang[t] += 1;
      const calon = hidup.filter(x => x !== t);
      intelUntuk(t, calon.length ? pilihSatu(calon, rng) : t, true);
      catat(id, `Rumor kalian tentang ${nama(t)} sudah beredar.`);
      kabar(t, 'Diterpa rumor');
    }
  }

  // ---------- 3. Serangan ----------
  for(const id of hidup){
    const a = A[id];
    const e = efekKhas(id);
    const jenis = ['serang', 'sabotase'].includes(a.aksi) ? a.aksi : (KHAS_MENYERANG.has(e) ? e : '');
    if(!jenis) continue;
    const t = a.target;

    const cegah = dicegah(id, t);
    if(cegah){ catat(id, 'Aksi kalian batal. ' + cegah); continue; }

    if(mogok.has(t)){
      S.kubu[id].kt -= 2; rusak[id] += 2;
      catat(id, `Penumpang yang mogok membalas. KT kalian turun 2.`);
      kabar(id, 'Terkena dampak mogok massal');
    }
    if(lindung.has(t)){
      catat(id, `Aksi kalian terhadap ${nama(t)} batal karena target dilindungi Garis Polisi.`);
      kabar(t, 'Terlindungi dari serangan');
      continue;
    }
    if(tameng.has(t)){
      if(jenis === 'serang'){
        pgKurang[id] += 1;
        catat(id, `Serangan kalian ke ${nama(t)} ditangkis tameng. PG kalian turun 1.`);
      } else {
        catat(id, `Aksi kalian terhadap ${nama(t)} ditangkis tameng.`);
      }
      kabar(t, 'Menangkis serangan');
      continue;
    }

    const khianat = A[t].aksi === 'sekutu' && A[t].target === id;
    const tambahan = khianat ? 1 : 0;
    if(khianat){
      pgTambah[id] += 1;
      dikhianati.add(t);
      catat(t, `${nama(id)} yang kalian ajak bersekutu justru menyerang kalian.`);
    }

    if(jenis === 'serang'){
      const kekuatan = (siaga ? 1 : 2) + tambahan;
      S.kubu[t].kt -= kekuatan; rusak[t] += kekuatan;
      pgTambah[id] += 1;
      catat(id, `Serangan kalian ke ${nama(t)} berhasil.`);
      kabar(t, 'Terkena serangan');
    } else if(jenis === 'pasarGelap'){
      pgKurang[t] += 2 + tambahan;
      pgTambah[id] += 2;
      catat(id, `Kalian berhasil mengambil Pengaruh dari ${nama(t)}.`);
      kabar(t, 'Kehilangan Pengaruh');
    } else {
      pgKurang[t] += 2 + tambahan;
      catat(id, `Sabotase kalian terhadap ${nama(t)} berhasil.`);
      kabar(t, 'Disabotase');
    }
    diserangOleh[t].add(id);
  }

  // ---------- 4. Persekutuan ----------
  for(const id of hidup){
    const a = A[id];
    if(a.aksi !== 'sekutu') continue;
    const t = a.target;
    if(kebal.has(t)){ catat(id, `Ajakan kalian tidak sampai karena ${nama(t)} tidak bisa dijangkau.`); continue; }
    if(A[t].aksi === 'sekutu' && A[t].target === id){
      pgTambah[id] += 3;
      S.kubu[id].sekutu += 1;
      catat(id, `Persekutuan dengan ${nama(t)} berhasil. PG kalian naik 3.`);
      kabar(id, `Bersekutu dengan ${nama(t)}`);
    } else if(!dikhianati.has(id)){
      catat(id, `Ajakan kalian kepada ${nama(t)} tidak dibalas.`);
    }
  }

  // ---------- 5. Pengaruh dan aksi khas lainnya ----------
  const umum = [];
  for(const id of hidup){
    const a = A[id];
    if(a.aksi === 'galang') pgTambah[id] += 2;
    switch(efekKhas(id)){
      case 'tajuk': {
        pgTambah[id] += 3;
        const terakhir = S.intel[id][S.intel[id].length - 1];
        umum.push(terakhir
          ? `Tajuk Utama ${nama(id)}: "${terakhir.teks}"`
          : `${nama(id)} menerbitkan Tajuk Utama, tetapi belum punya bahan berita.`);
        break;
      }
      case 'ujiRahasia':
        pgTambah[id] += 4;
        S.kubu[id].kt -= 1;
        break;
      case 'genset':
        pgTambah[id] += 3;
        break;
      case 'tutupMulut':
        if(kebal.has(a.target)){ catat(id, `${nama(a.target)} tidak bisa dijangkau. Uang tutup mulut batal.`); break; }
        pgKurang[id] += 2;
        pgTambah[a.target] += 2;
        S.kubu[a.target].larangan.push({ dari: id, ronde: ronde + 1 });
        catat(a.target, `Kalian menerima uang tutup mulut dari ${nama(id)}. Pada ronde berikutnya kalian tidak bisa menyerang, menyabotase, atau menyebar rumor tentang mereka.`);
        break;
      case 'kebal':
        pgKurang[id] += 2;
        kabar(id, 'Mengunci diri di kamar pribadi');
        break;
      case 'karantina':
        if(kebal.has(a.target)){ catat(id, `${nama(a.target)} tidak bisa dijangkau. Karantina batal.`); break; }
        S.kubu[a.target].karantina = ronde + 1;
        catat(a.target, 'Kubu kalian dikarantina. Pada ronde berikutnya kubu kalian otomatis Diam.');
        kabar(a.target, 'Dikarantina');
        break;
      case 'klaim': {
        let dibantu = 0;
        for(const lain of hidup){
          if(lain !== id && rusak[lain] > 0 && !kebal.has(lain)){ tambahKT(lain, 1); dibantu += 1; }
        }
        pgTambah[id] += dibantu;
        catat(id, `Klaim ganti rugi membantu ${dibantu} kubu.`);
        break;
      }
    }
  }

  if(saksiKubu && S.kubu[saksiKubu] && S.kubu[saksiKubu].hidup){
    pgTambah[saksiKubu] += 1;
    kabar(saksiKubu, 'Mendapat dukungan Saksi');
  }

  // ---------- Terapkan Pengaruh ----------
  for(const id of hidup){
    const k = S.kubu[id];
    let tambah = pgTambah[id];
    if(blokade.has(id) && tambah > 0){
      catat(id, 'Kenaikan Pengaruh kalian pada ronde ini dibatalkan oleh blokade.');
      kabar(id, 'Terkena blokade');
      tambah = 0;
    }
    k.pg = Math.max(0, k.pg + tambah - pgKurang[id]);
    k.kt = Math.max(0, Math.min(KT_MAKS, k.kt));

    if(efekKhas(id) === 'identitas') k.diselidiki = 0;
    if(A[id].aksi === 'khas') k.khas = true;
    k.tamengLalu = A[id].aksi === 'tameng';
    k.diamBeruntun = A[id].aksi === 'diam' ? k.diamBeruntun + 1 : 0;
    k.larangan = k.larangan.filter(l => l.ronde > ronde);
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
  S.laporan.push({ ronde, baris, umum });
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
          berhasil = k.pg >= 12;
          alasan = `Pengaruh akhir ${k.pg} dari target 12.`;
          break;
        case 'penjaga':
          berhasil = tersingkir <= 1;
          alasan = `${tersingkir} kubu tereliminasi, batasnya satu kubu.`;
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
          berhasil = k.sekutu >= 2;
          alasan = `Berhasil bersekutu ${k.sekutu} kali dari target 2 kali.`;
          break;
        case 'bayangan':
          berhasil = k.pg >= 8;
          alasan = `Pengaruh akhir ${k.pg} dari target 8.`;
          break;
      }
    }
    hasil[id] = { berhasil, alasan };
  }
  return hasil;
}
