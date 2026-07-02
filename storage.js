/*
  KafbeStorage — abstraksi penyimpanan skor.

  SAAT INI: pakai localStorage bawaan browser.
    - "Skor terbaik" tersimpan PER BROWSER/PER PERANGKAT, dan tetap ada
      setelah refresh, tutup tab, atau deploy ke GitHub Pages / Vercel.
    - "Papan peringkat" versi ini juga hanya tersimpan lokal di perangkat
      masing-masing pengunjung — BUKAN dibagikan ke semua orang, karena
      GitHub Pages / Vercel (static hosting) tidak punya database bawaan.

  KALAU MAU PAPAN PERINGKAT BENERAN GLOBAL (semua pengunjung lihat nama
  yang sama), ganti isi 4 fungsi di bawah ini dengan pemanggilan ke
  Firebase Firestore (gratis, tanpa perlu server sendiri). Kode game di
  flappy-owl.html TIDAK perlu diubah sama sekali selama nama & signature
  fungsi (getBest, setBest, getLeaderboard, setLeaderboard) tetap sama.
*/
window.KafbeStorage = (function(){
  const BEST_KEY = 'kafbe_flappy_best';
  const BOARD_KEY = 'kafbe_flappy_leaderboard';

  async function getBest(){
    try{
      const v = localStorage.getItem(BEST_KEY);
      return v ? (parseInt(v, 10) || 0) : 0;
    }catch(e){ return 0; }
  }

  async function setBest(n){
    try{ localStorage.setItem(BEST_KEY, String(n)); }catch(e){}
  }

  async function getLeaderboard(){
    try{
      const v = localStorage.getItem(BOARD_KEY);
      return v ? JSON.parse(v) : [];
    }catch(e){ return []; }
  }

  async function setLeaderboard(arr){
    try{ localStorage.setItem(BOARD_KEY, JSON.stringify(arr)); }catch(e){}
  }

  return { getBest, setBest, getLeaderboard, setLeaderboard };
})();
