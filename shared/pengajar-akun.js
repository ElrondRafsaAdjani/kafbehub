/*
  Aturan bersama untuk akun pengajar.

  Dipakai dua halaman sekaligus: /pengajar-daftar yang membuat pengajuan, dan
  /pengajar yang memeriksanya lagi saat pengajuan perlu dilengkapi.

  KENAPA DIPISAH KE BERKAS SENDIRI

  Bentuk email dan NRP yang sah ditulis di tiga tempat: di sini, di
  firestore.rules, dan di panduan pengurus. Tiga salinan sudah cukup banyak.
  Jika halaman pendaftaran dan halaman pengajar masing-masing menyimpan
  salinannya sendiri lagi, jumlahnya jadi empat, dan yang tertinggal saat
  aturannya berubah biasanya justru yang jarang dibuka.

  Yang benar-benar menolak tetap firestore.rules, karena aturan itu berjalan di
  server. Pemeriksaan di berkas ini hanya supaya pendaftar tahu letak
  kesalahannya sebelum akun Firebase-nya terlanjur dibuat.
*/

/*
  Email student UBAYA dibentuk dari NRP-nya, misalnya NRP 130223001 menggunakan
  email s130223001@student.ubaya.ac.id.
*/
export const POLA_EMAIL = /^s\d{6,15}@student\.ubaya\.ac\.id$/i;
export const POLA_NRP   = /^\d{6,15}$/;

export function angkaEmail(email){
  const m = String(email || '').match(/^s(\d+)@/i);
  return m ? m[1] : '';
}

// Email yang seharusnya menurut NRP-nya. Menyebutkan bentuk yang benar jauh
// lebih berguna daripada sekadar memberi tahu bahwa keduanya berbeda.
export function emailSeharusnya(nrp){
  return 's' + String(nrp || '').trim() + '@student.ubaya.ac.id';
}

export function periksaPengajuan(nama, nrp, email){
  const salah = [];
  if(nama.length < 3) salah.push('Nama lengkap belum diisi.');
  if(nama.length > 80) salah.push('Nama lengkap terlalu panjang.');
  if(!POLA_NRP.test(nrp)) salah.push('NRP harus berupa angka saja, tanpa huruf dan tanpa spasi.');
  if(!POLA_EMAIL.test(email)){
    salah.push('Email harus email student UBAYA, bentuknya s130223203@student.ubaya.ac.id. '
      + 'Alamat pribadi seperti Gmail tidak bisa digunakan.');
  }
  return salah;
}

/*
  Pesan bawaan Firebase berbahasa Inggris dan sebagian membingungkan, jadi
  diterjemahkan ke kalimat yang bisa ditindaklanjuti pemakai.
*/
export function pesanAuth(kode){
  switch(kode){
    case 'auth/invalid-email':
      return 'Format email tidak benar.';
    case 'auth/user-disabled':
      return 'Akun ini dinonaktifkan. Hubungi pengurus operasional.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau kata sandi salah.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/network-request-failed':
      return 'Gagal menghubungi server. Periksa koneksi internet Anda.';
    case 'auth/configuration-not-found':
      return 'Metode masuk email dan kata sandi belum diaktifkan di Firebase Console.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah punya akun. Masuk saja menggunakan kata sandi yang dulu digunakan, '
           + 'atau hubungi pengurus operasional jika lupa.';
    case 'auth/weak-password':
      return 'Kata sandinya terlalu mudah ditebak. Gunakan paling sedikit delapan karakter.';
    case 'auth/operation-not-allowed':
      return 'Pendaftaran akun baru sedang dimatikan di Firebase Console.';
    default:
      return 'Tidak berhasil (' + kode + ').';
  }
}

/* ---------- Alat bantu tampilan yang digunakan kedua halaman ---------- */

export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

export function daftarKesalahan(judul, list){
  return `${esc(judul)}<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

export function pesan(el, teks, jenis){
  el.className = 'op-pesan tampil ' + (jenis || '');
  el.innerHTML = teks;
}

export function bersihkanPesan(el){
  el.className = 'op-pesan';
  el.innerHTML = '';
}

/*
  Mengantar pemakai ke isian yang bermasalah.

  Pesan galat saja tidak cukup ketika formulirnya lebih tinggi dari satu layar
  ponsel: pesannya tampil di bawah, sedangkan isian yang salah ada di atas, dan
  keduanya tidak pernah terlihat bersamaan. Isinya sekalian disorot supaya
  alamat yang telanjur terisi bisa langsung ditimpa tanpa dihapus dulu.
*/
export function antarKeIsian(el){
  if(!el) return;
  el.focus({ preventScroll: true });
  if(typeof el.select === 'function') el.select();
  el.scrollIntoView({ block: 'center' });
}

/*
  Menekan Enter di tengah formulir memindahkan kursor ke isian berikutnya,
  bukan mengirim formulirnya.

  Formulir pendaftaran panjang, dan sebagian papan ketik ponsel maupun
  pengelola kata sandi memperlakukan Enter sebagai "lanjut". Dengan perilaku
  bawaan peramban, Enter di isian pertama mana pun langsung mengirim seluruh
  formulir, dan yang dilihat pendaftar hanya penolakan atas sesuatu yang belum
  merasa dia kirim.

  Isian terakhir dikecualikan. Di situ Enter memang berarti selesai, dan
  menahannya justru akan terasa seperti tombolnya rusak.
*/
export function enterPindahIsian(form, idTerakhir){
  form.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    if(e.target.id === idTerakhir) return;

    e.preventDefault();
    const isian = [...form.querySelectorAll('input')];
    const berikut = isian[isian.indexOf(e.target) + 1];
    if(berikut) berikut.focus();
  });
}
