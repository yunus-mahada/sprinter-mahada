-- ============================================================
-- SPRINTER MAHADA - SUPABASE POSTGRESQL DATABASE SCHEMA
-- Jalankan skrip ini pada SQL Editor di dashboard Supabase Anda:
-- ============================================================

-- 1. Tabel Karyawan
CREATE TABLE IF NOT EXISTS public.karyawan (
    id VARCHAR(64) PRIMARY KEY,
    nama TEXT NOT NULL,
    posisi VARCHAR(64) DEFAULT 'Sprinter' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabel Master Kategori
CREATE TABLE IF NOT EXISTS public.categories (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabel Database Vendor
CREATE TABLE IF NOT EXISTS public.vendors (
    id VARCHAR(64) PRIMARY KEY,
    nama TEXT NOT NULL,
    no_hp TEXT DEFAULT '',
    alamat TEXT DEFAULT '',
    link_maps TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabel Tugas Kurir / Operasional (Tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id VARCHAR(64) PRIMARY KEY,
    karyawan TEXT NOT NULL,
    judul_tugas TEXT NOT NULL,
    invoice TEXT DEFAULT '',
    kategori TEXT DEFAULT 'Lainnya' NOT NULL,
    dari TEXT DEFAULT '',
    tujuan TEXT NOT NULL,
    prioritas VARCHAR(32) DEFAULT 'Standar' NOT NULL,
    pic TEXT DEFAULT '',
    no_hp TEXT DEFAULT '',
    biaya INTEGER DEFAULT 0 NOT NULL,
    keterangan_biaya TEXT DEFAULT '',
    status VARCHAR(32) DEFAULT 'Pending' NOT NULL,
    waktu_update TEXT NOT NULL,
    penerima TEXT DEFAULT '',
    catatan TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabel Rekap Kas Harian (Recaps)
CREATE TABLE IF NOT EXISTS public.recaps (
    tanggal VARCHAR(32) PRIMARY KEY,
    karyawan TEXT DEFAULT '',
    uang_cash INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabel Akun Pengguna / User Profiles (Sync Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    nama TEXT DEFAULT '',
    role TEXT DEFAULT 'Sprinter',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabel Pelacak Lokasi GPS Sprinter Live
CREATE TABLE IF NOT EXISTS public.sprinter_locations (
    id VARCHAR(64) PRIMARY KEY,
    karyawan_id VARCHAR(64) NOT NULL,
    karyawan_nama TEXT NOT NULL,
    latitude TEXT NOT NULL,
    longitude TEXT NOT NULL,
    accuracy TEXT DEFAULT '',
    speed TEXT DEFAULT '',
    waktu_update TEXT NOT NULL,
    is_active TEXT DEFAULT 'true' NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Data Awal
INSERT INTO public.categories (nama) VALUES 
('Pengiriman'), ('Pembelian'), ('Setor Bank'), ('Lainnya')
ON CONFLICT (nama) DO NOTHING;

INSERT INTO public.karyawan (id, nama, posisi) VALUES 
('EMP-01', 'Budi Santoso', 'Sprinter'),
('EMP-02', 'Rian Hidayat', 'Sprinter'),
('EMP-03', 'Ahmad Ridwan', 'Produksi')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vendors (id, nama, no_hp, alamat) VALUES
('VND-01', 'Percetakan Jaya Abadi', '081234567890', 'Jl. Kalibaru No. 12, Jakarta'),
('VND-02', 'Toko Bahan Mahada Sentosa', '081398765432', 'Kawasan Industri Pulogadung Blok B4')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. INDEXES UNTUK PERFORMA QUERY CEPAT
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_waktu_update ON public.tasks (waktu_update DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_karyawan ON public.tasks (karyawan);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_recaps_tanggal ON public.recaps (tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_sprinter_locations_update ON public.sprinter_locations (waktu_update DESC);

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Aktifkan RLS dan izinkan akses operasional aplikasi
-- ============================================================
ALTER TABLE public.karyawan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprinter_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for karyawan" ON public.karyawan;
CREATE POLICY "Allow all for karyawan" ON public.karyawan FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for categories" ON public.categories;
CREATE POLICY "Allow all for categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for vendors" ON public.vendors;
CREATE POLICY "Allow all for vendors" ON public.vendors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for tasks" ON public.tasks;
CREATE POLICY "Allow all for tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for recaps" ON public.recaps;
CREATE POLICY "Allow all for recaps" ON public.recaps FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for users" ON public.users;
CREATE POLICY "Allow all for users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for sprinter_locations" ON public.sprinter_locations;
CREATE POLICY "Allow all for sprinter_locations" ON public.sprinter_locations FOR ALL USING (true) WITH CHECK (true);

