# ES Keuangan

Aplikasi pencatat keuangan pribadi (pemasukan & pengeluaran) yang berjalan **100% offline** dan bisa diinstal di HP sebagai PWA.

- HTML, CSS, JavaScript murni — tanpa framework, tanpa build step
- Semua library disimpan lokal (`lib/chart.umd.min.js`, Chart.js v4.4.6), tidak ada CDN
- Data disimpan di **IndexedDB** di HP Anda — tidak ada server, login, atau database online

## Isi folder

```
es-keuangan/
├── index.html              ← halaman utama
├── manifest.webmanifest    ← data instal PWA (nama, ikon, warna)
├── sw.js                   ← service worker (cache semua file untuk offline)
├── _headers                ← pengaturan header untuk Netlify
├── css/style.css
├── js/db.js                ← penyimpanan IndexedDB
├── js/app.js               ← logika aplikasi
├── lib/chart.umd.min.js    ← Chart.js (lokal)
└── icons/                  ← ikon 192, 512, maskable, apple-touch-icon
```

## Fitur

1. Tambah transaksi (tanggal default hari ini, jenis, kategori, jumlah, catatan)
2. Ringkasan Total Pemasukan, Total Pengeluaran, Saldo per bulan
3. Daftar transaksi per tanggal — ketuk untuk ubah/hapus (dengan konfirmasi + tombol Urungkan)
4. Filter per bulan (tombol ‹ › di atas), jenis, dan kategori
5. Grafik pengeluaran per kategori & tren 6 bulan
6. Kelola kategori (tambah/ubah/hapus; transaksi bisa dipindah ke kategori lain saat menghapus)
7. Format Rupiah `Rp 1.250.000`
8. Ekspor CSV (bulan terpilih / semua) — pemisah `;`, siap dibuka di Excel
9. Backup & Restore JSON + pengingat jika lebih dari 7 hari belum backup
10. **Dua buku: Pribadi & Usaha** — pilih di bagian atas layar, masing-masing punya saldo, daftar, grafik sendiri
11. **Teks WhatsApp otomatis (buku Usaha)** — setiap uang masuk/keluar langsung dibuatkan teks saldo berjalan:
    `993,845 + 35,000 = 1,028,845` atau `1,028,845 - 4,306,000 = -3,277,155 (Semen & seng ASIM)`
    — keterangan dalam kurung hanya muncul jika kolom Catatan diisi. Teks bisa langsung dikirim otomatis saat menyimpan (atur di Pengaturan)
    lalu tinggal ketuk *Kirim ke WhatsApp*. Koreksi dan pembatalan transaksi juga dibuatkan teksnya.

### Memakai buku Usaha
1. Ketuk **🏪 Usaha** di atas.
2. Pertama kali, isi **Pengaturan → 💰 Saldo Awal** untuk Pribadi dan Usaha (terpisah; boleh minus dengan tanda `-`). Saldo yang tampil di Beranda = saldo awal + pemasukan − pengeluaran.
3. (Opsional) Di **Pengaturan → WhatsApp untuk Buku Usaha**, tambahkan satu atau beberapa nomor tujuan (nama + nomor). Saat teks muncul, setiap nomor punya tombol **Kirim ke …** sendiri; untuk grup pakai **Pilih kontak / grup lain**.
4. Untuk mengirim ulang teks transaksi lama: ketuk transaksinya → **💬 Kirim Laporan ke WhatsApp**.

---

## 1. Upload ke Netlify Drop

1. Buka **https://app.netlify.com/drop** di komputer (lebih mudah daripada di HP).
2. Login/daftar akun Netlify gratis (pakai email atau akun GitHub/Google) — supaya situs tidak terhapus otomatis.
3. Seret (drag & drop) **folder `es-keuangan`** (folder yang berisi `index.html`) ke kotak bertuliskan *"Drag and drop your site output folder here"*.
   - Yang diseret adalah folder yang **langsung** berisi `index.html`, bukan folder di atasnya.
4. Tunggu beberapa detik sampai muncul alamat seperti `https://nama-acak-123.netlify.app`.
5. (Opsional) Klik **Site configuration → Change site name** untuk mengganti nama, mis. `es-keuangan-saya.netlify.app`.

**Memperbarui aplikasi nanti:** ubah file, naikkan `VERSI` di `sw.js` (mis. `v1.0.1`), lalu di Netlify buka situs Anda → tab **Deploys** → seret lagi foldernya ke kotak upload. HP akan menampilkan "Versi baru tersedia → MUAT ULANG". Data Anda tidak ikut terhapus.

> Netlify hanya tempat mengunduh aplikasi. Data keuangan **tidak pernah dikirim** ke Netlify; semuanya tersimpan di HP.

## 2. Buka & instal di HP

### Android (Chrome)
1. Buka alamat `https://....netlify.app` di **Chrome**.
2. Ketuk tombol **⬇ Instal** di pojok kanan atas aplikasi (atau di menu Pengaturan → *Instal Aplikasi*), lalu ketuk **Instal**.
   - Jika tombol tidak muncul: ketuk menu **⋮** Chrome → **Instal aplikasi** / **Tambahkan ke layar utama**.
3. Ikon **ES Keuangan** muncul di layar utama / laci aplikasi.
4. Buka sekali dari ikon saat masih online. Setelah itu aplikasi bisa dibuka **tanpa internet** (coba mode pesawat).

### iPhone / iPad (Safari)
1. Buka alamat `https://....netlify.app` di **Safari**.
2. Ketuk tombol **Bagikan** (kotak dengan panah ke atas) di bawah layar.
3. Gulir ke bawah, pilih **Tambahkan ke Layar Utama** (*Add to Home Screen*), lalu ketuk **Tambah**.
4. Buka dari ikon ES Keuangan. Setelah dibuka sekali, aplikasi berjalan tanpa internet.

> Penting di iPhone: data aplikasi yang diinstal di layar utama **terpisah** dari data di tab Safari biasa. Selalu catat lewat ikon di layar utama.

## 3. Backup & Restore data

Data hanya ada di HP. Jika HP hilang/rusak, aplikasi dihapus, atau data browser dibersihkan, data **ikut hilang** — kecuali Anda punya file backup. Aplikasi akan menampilkan pengingat jika sudah lebih dari 7 hari belum backup.

### Backup
1. Buka tab **Pengaturan** → **💾 Backup Data (JSON)** (atau tombol *Backup Sekarang* di banner pengingat).
2. **Android:** file `es-keuangan-backup-TANGGAL.json` tersimpan di folder **Download**.
   **iPhone:** muncul lembar Bagikan → pilih **Simpan ke File** (*Save to Files*), atau kirim ke WhatsApp/Email/Google Drive.
3. Simpan salinan file di tempat lain yang aman (Google Drive, kirim ke WhatsApp diri sendiri, email, atau komputer).

### Restore
1. Pastikan file backup `.json` ada di HP (unduh dulu dari Drive/WhatsApp jika perlu).
2. Buka **Pengaturan** → **📂 Restore dari File Backup** → pilih file `.json`.
3. Pilih cara memulihkan:
   - **Ganti Semua Data** — data di HP dihapus dan diganti isi backup (cocok untuk pindah ke HP baru).
   - **Gabungkan** — isi backup ditambahkan; transaksi yang sama tidak akan dobel.

### Pindah HP
Backup di HP lama → kirim file ke HP baru → instal aplikasi di HP baru → **Restore → Ganti Semua Data**.

## Menjalankan di komputer (opsional)

Service worker butuh `https://` atau `localhost`. Dari dalam folder ini jalankan misalnya:

```
python3 -m http.server 8000
```

lalu buka `http://localhost:8000`.
