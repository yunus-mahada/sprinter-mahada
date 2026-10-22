export interface Task {
  ID: string;
  Karyawan: string;
  JudulTugas: string;
  Invoice: string;
  Kategori: string;
  Dari: string;
  Tujuan: string;
  Prioritas: 'Standar' | 'Urgent' | string;
  PIC: string;
  NoHP: string;
  Biaya: number;
  KeteranganBiaya: string;
  Status: 'Pending' | 'Dalam Perjalanan' | 'Selesai' | 'Gagal' | string;
  WaktuUpdate: string;
  Penerima: string;
  Catatan: string;
}

export interface Vendor {
  ID: string;
  Nama: string;
  NoHP: string;
  Alamat: string;
  LinkMaps?: string;
}

export interface Karyawan {
  ID: string;
  Nama: string;
  Posisi: string;
}

export interface Recap {
  Tanggal: string;
  Karyawan: string;
  UangCash: number;
}

export interface SprinterLocation {
  id: string; // Karyawan ID / nama
  karyawanId: string;
  karyawanNama: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null;
  waktuUpdate: string;
  isActive: boolean;
}

export interface AppData {
  tasks: Task[];
  vendors: Vendor[];
  categories: string[];
  users: Karyawan[];
  recaps: Recap[];
  sprinterLocations?: SprinterLocation[];
}
