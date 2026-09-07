# LevelOne PS Rental — GitHub Pages

Versi ini khusus untuk deployment **GitHub Pages**. Halaman publik tetap statis, sedangkan login Admin dan status station online menggunakan **Supabase**.

## Fitur
- 8 station PS 3 + 4 station PS 4
- Status Tersedia / Terisi / Tidak Aktif
- Countdown
- TV dan indikator stik menyala saat station Terisi
- Admin muncul hanya ketika tombol **Admin** kanan atas ditekan
- Login Admin melalui Supabase Auth
- Perubahan station tersimpan online dan dapat dilihat dari perangkat lain
- Booking WhatsApp dihapus
- Contact dihapus
- Wi-Fi dan fasilitas internet dihapus
- Semua teks website berbahasa Indonesia
- Tidak membutuhkan VPS atau PHP hosting

## 1. Buat project Supabase
Buat satu project baru di Supabase.

## 2. Buat database
Buka SQL Editor, lalu jalankan seluruh isi `supabase.sql`.

## 3. Buat akun Admin
Di Supabase Authentication → Users, buat user:

- Email: `admin@levelone.local`
- Password: `levelone2026`

Untuk project ini, akun tersebut adalah akun Admin LevelOne. Jangan gunakan password ini untuk akun lain.

## 4. Konfigurasi project
Project yang digunakan untuk LevelOne sudah dikonfigurasi di `supabase-config.js`.

- Project URL: `https://uhhaaicmznywraoyciky.supabase.co`
- Publishable key: sudah dimasukkan ke file konfigurasi.

Jika membuat salinan project baru, ganti dua nilai tersebut dengan URL dan Publishable key project baru.

**Jangan pernah memasukkan `service_role` key ke website.** Client browser hanya menggunakan publishable/anon key dengan RLS.

## 5. Upload ke GitHub
Upload file berikut ke root repository:

- `index.html`
- `style.css`
- `script.js`
- `supabase-config.js`
- `supabase.sql`
- `controller.png`

File PHP tidak diperlukan untuk GitHub Pages.

## 6. Aktifkan GitHub Pages
Di repository GitHub buka **Settings → Pages**.
Pilih source dari branch utama dan folder root (`/`), lalu simpan. GitHub Pages akan mempublikasikan file statis repository.

## 7. Login Admin
Klik **Admin** di kanan atas.

- Username: `admin`
- Password: `levelone2026`

## Catatan keamanan
Password tidak ditulis di `script.js`. Login dilakukan oleh Supabase Auth. RLS database membatasi perubahan station hanya untuk akun `admin@levelone.local`.

Publishable/anon key memang digunakan di browser, tetapi **service_role key tidak boleh** dimasukkan ke repository.


## Rekap harian
Panel admin sekarang memiliki kalender tanggal untuk melihat akumulasi per station:
- total waktu bermain per hari;
- total pemasukan per hari;
- jumlah transaksi;
- rincian PS 3 Station 1-8 dan PS 4 Station 1-4.

Tambahan durasi 30 menit: PS 3 Rp3.000 dan PS 4 Rp5.000. Tarif lama tetap: PS 3 1 jam Rp5.000, 2 jam Rp10.000; PS 4 1 jam Rp8.000, 2 jam Rp16.000. Durasi custom harus kelipatan 30 menit.

**Penting:** setelah versi ini dipasang, jalankan bagian SQL `REKAP PEMAKAIAN & PEMASUKAN HARIAN` pada `supabase.sql` di Supabase SQL Editor agar tabel rekap tersedia.


## Perbaikan durasi & estimasi selesai
- Jalankan `supabase.sql` di Supabase SQL Editor agar tabel `public.play_sessions` tersedia.
- Jika error schema cache masih muncul setelah SQL berhasil, jalankan `NOTIFY pgrst, 'reload schema';` di SQL Editor.
- Saat durasi disimpan, waktu mulai dicatat menggunakan waktu realtime browser dan estimasi selesai dihitung dari waktu tersebut.
- Panel admin menampilkan "Estimasi selesai" dan akan mengikuti jam lokal perangkat.
