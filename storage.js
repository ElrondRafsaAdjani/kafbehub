/*
  KafbeStorage — abstraksi penyimpanan skor untuk SEMUA game di hub ini.

  - "Skor terbaik" (getBest/setBest) tetap disimpan per perangkat lewat
    localStorage — cukup untuk statistik pribadi "skor terbaikmu di HP/laptop ini".
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

  // ---------- Public: leaderboard global ----------
  async function getLeaderboard(gameId, limitN){
    limitN = limitN || 10;
    const conn = await getDb();
    if(!conn){
      return getLocalLeaderboard(gameId).slice(0, limitN);
    }
    try{
      const { db, firestore } = conn;
      const q = firestore.query(
        firestore.collection(db, 'scores'),
        firestore.where('game', '==', gameId),
        firestore.orderBy('score', 'desc'),
        firestore.limit(limitN)
      );
      const snap = await firestore.getDocs(q);
      const out = [];
      snap.forEach(doc => {
        const d = doc.data();
        out.push({ name: d.name, score: d.score });
      });
      return out;
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
