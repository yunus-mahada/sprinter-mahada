# SPRINTER MAHADA - Panduan Deployment

Aplikasi Manajemen Operasional Lapangan & Tugas Kurir Sprinter Mahada dengan integrasi **Supabase PostgreSQL & Auth**, **Vercel Serverless**, dan **GitHub**.

---

## 1. Persiapan Supabase (Database & Autentikasi)

1. Buat proyek baru di [Supabase Dashboard](https://supabase.com).
2. Buka menu **SQL Editor** pada proyek Anda.
3. Buka file [`src/db/supabase-schema.sql`](src/db/supabase-schema.sql), salin seluruh isinya, tempel ke SQL Editor Supabase, lalu klik **Run**.
   - Ini akan membuat semua tabel (`karyawan`, `categories`, `vendors`, `tasks`, `recaps`, `users`, `sprinter_locations`).
   - Sudah dilengkapi dengan **Row Level Security (RLS)** dan Index performa otomatis.
4. Buka menu **Project Settings > API** di Supabase untuk menyalin kredensial:
   - **Project URL** (contoh: `https://xyzcompany.supabase.co`)
   - **anon public key** (`eyJhbGciOi...`)

---

## 2. Unggah ke GitHub

Jalankan perintah berikut di terminal komputer Anda:

```bash
git add .
git commit -m "feat: initial commit ready for supabase and vercel"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO.git
git push -u origin main
```

> **Catatan Keamanan:** File `.gitignore` sudah otomatis mengamankan file `.env`, `node_modules`, dan `dist` agar tidak terunggah ke publik.

---

## 3. Deploy ke Vercel

1. Buka dashboard [Vercel](https://vercel.com) dan klik **Add New > Project**.
2. Hubungkan akun GitHub Anda dan pilih repositori yang baru saja di-push.
3. Konfigurasi build Vercel (akan otomatis terdeteksi):
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Pada bagian **Environment Variables**, tambahkan 4 variabel ini:

| Key | Value (Contoh) |
|---|---|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR...` |
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR...` |

5. Klik tombol **Deploy**. Aplikasi akan online dan endpoint API otomatis dilayani oleh Vercel Serverless Function melalui `vercel.json` dan `api/index.ts`.

---

## 4. Menjalankan di Komputer Lokal (Development)

1. Buat salinan file `.env`:
   ```bash
   cp .env.example .env
   ```
2. Isi nilai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di file `.env`.
3. Jalankan aplikasi:
   ```bash
   npm run dev
   ```
4. Buka browser di `http://localhost:3000`.
