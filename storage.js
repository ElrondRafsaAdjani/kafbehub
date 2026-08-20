/*
  KafbeStorage: abstraksi penyimpanan skor untuk SEMUA game di hub ini.

  - "Skor terbaik" (getBest/setBest) tetap disimpan per perangkat lewat
    localStorage, cukup untuk statistik pribadi "skor terbaikmu di HP/laptop ini".
  - "Papan peringkat" (getLeaderboard/addScore) sekarang memakai Firebase
    Firestore, jadi BENERAN dibagikan ke semua pengunjung situs, bukan cuma
    lokal di satu browser.
  - Setiap game punya papan peringkatnya sendiri lewat parameter `gameId`
    (contoh: 'flappy-owl'). Game baru nanti tinggal panggil fungsi yang sama
    dengan gameId yang beda, tidak perlu ubah file ini.

  SEBELUM DIISI KONFIGURASI FIREBASE (lihat firebase-config.js):
  kode ini otomatis jatuh ke localStorage per-perangkat supaya situs tetap
  jalan, tapi papan peringkat belum benar-benar global sampai kamu isi
  konfigurasinya.

  CATATAN KEAMANAN (Firestore Security Rules):
  Supaya orang tidak bisa asal menimpa/menghapus skor orang lain, pakai rules
  seperti ini di Firestore ("Build" → "Firestore Database" → "Rules"):

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /scores/{scoreId} {
          allow read: if true;
          allow create: if request.resource.data.game is string
                        && request.resource.data.name is string
                        && request.resource.data.name.size() <= 14
                        && request.resource.data.score is int
                        && request.resource.data.score >= 0
                        && request.resource.data.score <= 100000;
          allow update, delete: if false;
        }
      }
    }

  Ini membatasi entri baru harus punya bentuk yang wajar, dan tidak ada yang
  bisa mengubah/menghapus skor yang sudah tersimpan. Tidak sempurna (orang
  tetap bisa spam entri baru lewat console browser), tapi cukup untuk hub
  internal seperti ini.
*/
window.KafbeStorage = (function(){
  const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.13.0";
  let dbPromise = null;

  function isConfigured(){
    const c = window.KAFBE_FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== "ISI_API_KEY_DI_SINI");
  }

  async function getDb(){
    if(!isConfigured()) return null;
    if(dbPromise) return dbPromise;
    dbPromise = (async () => {
      const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
      const firestore = await import(`${FIREBASE_SDK}/firebase-firestore.js`);
      const app = initializeApp(window.KAFBE_FIREBASE_CONFIG);
      const db = firestore.getFirestore(app);
      return { db, firestore };
    })();
    return dbPromise;
  }

  // ---------- Personal best (selalu lokal per perangkat) ----------
  async function getBest(gameId){
    try{
      const v = localStorage.getItem('kafbe_best_' + gameId);
      return v ? (parseInt(v, 10) || 0) : 0;
    }catch(e){ return 0; }
  }
  async function setBest(gameId, n){
    try{ localStorage.setItem('kafbe_best_' + gameId, String(n)); }catch(e){}
  }

  // ---------- Local fallback leaderboard (dipakai kalau Firebase belum di-setup) ----------
  function localKey(gameId){ return 'kafbe_leaderboard_' + gameId; }
  function getLocalLeaderboard(gameId){
    try{
      const v = localStorage.getItem(localKey(gameId));
      return v ? JSON.parse(v) : [];
    }catch(e){ return []; }
  }
  function setLocalLeaderboard(gameId, arr){
    try{ localStorage.setItem(localKey(gameId), JSON.stringify(arr)); }catch(e){}
  }

  // ---------- Cache papan peringkat ----------
  /*
    Firestore menagih per DOKUMEN yang dibaca, bukan per permintaan. Game
    memanggil getLeaderboard setiap kali pemain mati (untuk mengecek apakah
    skornya masuk 10 besar), jadi tanpa cache satu sesi 20 ronde memicu 20
    pembacaan penuh seluruh koleksi.

    Papan peringkat tidak perlu real-time sampai ke detik, jadi hasilnya
    disimpan sebentar di memori. Cache ini hanya ada selama tab terbuka dan
    tidak menyentuh data di server sama sekali.
  */
  const CACHE_TTL_MS = 60 * 1000;
  const cache = new Map();   // gameId -> { waktu, data, limitN }

  function dariCache(gameId, limitN){
    const c = cache.get(gameId);
    if(!c) return null;
    if(Date.now() - c.waktu > CACHE_TTL_MS){ cache.delete(gameId); return null; }
    // Cache yang isinya lebih pendek dari yang diminta tidak bisa dipakai.
    if(c.limitN < limitN) return null;
    return c.data;
  }

  function simpanCache(gameId, data, limitN){
    cache.set(gameId, { waktu: Date.now(), data, limitN });
  }

  /*
    Cara hemat: minta Firestore yang mengurutkan dan memotong, sehingga yang
    terbaca hanya 10 dokumen berapa pun banyaknya skor tersimpan.

    Ini butuh "composite index" (game menaik, score menurun) yang dibuat sekali
    di console Firebase. Selama index itu belum ada, Firestore menolak query-nya
    dan kita turun otomatis ke cara lama: ambil semua lalu urutkan di peramban.
    Jadi situs tetap jalan tanpa setup apa pun, dan langsung lebih hemat begitu
    index-nya dibuat, tanpa perlu ubah kode lagi.
  */
  let indexTersedia = null;   // null = belum dicoba, false = index belum ada

  function bacaSnapshot(snap){
    const out = [];
    snap.forEach(doc => {
      const d = doc.data();
      out.push({ name: d.name, score: d.score });
    });
    return out;
  }

  async function ambilDariFirestore(conn, gameId, limitN){
    const { db, firestore } = conn;
    const koleksi = firestore.collection(db, 'scores');

    if(indexTersedia !== false && typeof firestore.orderBy === 'function'){
      try{
        const q = firestore.query(
          koleksi,
          firestore.where('game', '==', gameId),
          firestore.orderBy('score', 'desc'),
          firestore.limit(limitN)
        );
        const snap = await firestore.getDocs(q);
        indexTersedia = true;
        return bacaSnapshot(snap);
      }catch(e){
        indexTersedia = false;
        console.info(
          'KafbeStorage: composite index belum ada, sementara memakai cara lama '
          + '(membaca semua skor). Buat index lewat tautan pada pesan error di '
          + 'bawah ini supaya pembacaan turun jadi ' + limitN + ' dokumen saja.',
          e && e.message
        );
      }
    }

    const q = firestore.query(
      koleksi,
      firestore.where('game', '==', gameId),
      firestore.limit(200)
    );
    const snap = await firestore.getDocs(q);
    const out = bacaSnapshot(snap);
    out.sort((a,b) => b.score - a.score);
    return out.slice(0, limitN);
  }

  // ---------- Public: leaderboard global ----------
  async function getLeaderboard(gameId, limitN){
    limitN = limitN || 10;
    const conn = await getDb();
    if(!conn){
      return getLocalLeaderboard(gameId).slice(0, limitN);
    }

    const tersimpan = dariCache(gameId, limitN);
    if(tersimpan) return tersimpan.slice(0, limitN);

    try{
      const out = await ambilDariFirestore(conn, gameId, limitN);
      simpanCache(gameId, out, limitN);
      return out.slice(0, limitN);
    }catch(e){
      console.error('KafbeStorage: gagal ambil leaderboard dari Firebase, pakai fallback lokal.', e);
      return getLocalLeaderboard(gameId).slice(0, limitN);
    }
  }

  async function addScore(gameId, name, score){
    const conn = await getDb();
    if(!conn){
      const board = getLocalLeaderboard(gameId);
      board.push({ name, score });
      board.sort((a,b) => b.score - a.score);
      setLocalLeaderboard(gameId, board.slice(0, 10));
      return;
    }
    try{
      const { db, firestore } = conn;
      await firestore.addDoc(firestore.collection(db, 'scores'), {
        game: gameId,
        name,
        score,
        ts: firestore.serverTimestamp()
      });
      // Papan peringkat berubah, jadi cache lama harus dibuang supaya skor
      // yang baru saja dikirim langsung kelihatan.
      cache.delete(gameId);
    }catch(e){
      console.error('KafbeStorage: gagal simpan skor ke Firebase, simpan ke lokal saja.', e);
      const board = getLocalLeaderboard(gameId);
      board.push({ name, score });
      board.sort((a,b) => b.score - a.score);
      setLocalLeaderboard(gameId, board.slice(0, 10));
    }
  }

  return { getBest, setBest, getLeaderboard, addScore, isConfigured };
})();
