import { pgTable, text, serial, integer, timestamp, varchar } from 'drizzle-orm/pg-core';

// Firebase Auth Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  nama: text('nama'),
  role: text('role').default('Sprinter'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Master Karyawan Operasional (Sprinter / Produksi)
export const karyawan = pgTable('karyawan', {
  id: varchar('id', { length: 64 }).primaryKey(), // EMP-01
  nama: text('nama').notNull(),
  posisi: varchar('posisi', { length: 64 }).notNull().default('Sprinter'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Master Kategori Tugas
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  nama: varchar('nama', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Master Database Vendor
export const vendors = pgTable('vendors', {
  id: varchar('id', { length: 64 }).primaryKey(),
  nama: text('nama').notNull(),
  noHp: text('no_hp'),
  alamat: text('alamat').notNull(),
  linkMaps: text('link_maps').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tugas Operasional / Kurir Sprinter
export const tasks = pgTable('tasks', {
  id: varchar('id', { length: 64 }).primaryKey(), // TSK-...
  karyawan: text('karyawan').notNull(),
  judulTugas: text('judul_tugas').notNull(),
  invoice: text('invoice').default(''),
  kategori: text('kategori').notNull().default('Lainnya'),
  dari: text('dari').default(''),
  tujuan: text('tujuan').notNull(),
  prioritas: varchar('prioritas', { length: 32 }).notNull().default('Standar'),
  pic: text('pic').default(''),
  noHp: text('no_hp').default(''),
  biaya: integer('biaya').notNull().default(0),
  keteranganBiaya: text('keterangan_biaya').default(''),
  status: varchar('status', { length: 32 }).notNull().default('Pending'),
  waktuUpdate: text('waktu_update').notNull(),
  penerima: text('penerima').default(''),
  catatan: text('catatan').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

// Rekap Kas Harian (Modal / Cash & Saldo)
export const recaps = pgTable('recaps', {
  tanggal: varchar('tanggal', { length: 32 }).primaryKey(), // YYYY-MM-DD
  karyawan: text('karyawan').default(''),
  uangCash: integer('uang_cash').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Pelacak GPS Lokasi Sprinter Live
export const sprinterLocations = pgTable('sprinter_locations', {
  id: varchar('id', { length: 64 }).primaryKey(), // karyawan ID / nama
  karyawanId: varchar('karyawan_id', { length: 64 }).notNull(),
  karyawanNama: text('karyawan_nama').notNull(),
  latitude: text('latitude').notNull(),
  longitude: text('longitude').notNull(),
  accuracy: text('accuracy'),
  speed: text('speed'),
  waktuUpdate: text('waktu_update').notNull(),
  isActive: text('is_active').notNull().default('true'),
});
