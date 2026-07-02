/*
  Isi object di bawah ini dengan konfigurasi project Firebase kamu sendiri.

  Cara dapatnya (gratis):
  1. Buka https://console.firebase.google.com → "Add project" → ikuti wizard-nya.
  2. Di dalam project, buka "Build" → "Firestore Database" → "Create database"
     → pilih mode "Start in production mode" (kita atur rule-nya sendiri, lihat
     catatan rules di bawah).
  3. Buka "Project settings" (ikon gerigi) → scroll ke "Your apps" → klik ikon
     web "</>" → daftarkan app (nama bebas, tidak perlu centang Hosting).
  4. Firebase akan menampilkan object `firebaseConfig` — copy semua isinya
     ke bawah ini, menggantikan nilai placeholder.

  Field-field ini AMAN untuk ditaruh di kode publik/GitHub — ini bukan
  password, hanya alamat project. Yang benar-benar menjaga keamanan data
  adalah Firestore Security Rules (lihat catatan di storage.js).
*/
window.KAFBE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcG7Y2scP9TQJ3funbqFO5o1uXRi7FRx0",
  authDomain: "kafbe-hub.firebaseapp.com",
  projectId: "kafbe-hub",
  storageBucket: "kafbe-hub.firebasestorage.app",
  messagingSenderId: "547534377422",
  appId: "1:547534377422:web:02d7f2eb350b043b451b9f"
};
