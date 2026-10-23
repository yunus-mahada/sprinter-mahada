import { AppData, Task, Vendor, Karyawan, Recap, SprinterLocation } from '../types.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

async function getHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore
  }
  return headers;
}

export async function fetchAllData(): Promise<AppData> {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return await res.json();
}

export async function apiSaveTask(task: Task): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers,
    body: JSON.stringify(task),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan tugas ke Supabase');
  }
}

export async function apiDeleteTask(id: string): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menghapus tugas dari Supabase');
  }
}

export async function apiSaveVendor(vendor: Vendor): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/vendors', {
    method: 'POST',
    headers,
    body: JSON.stringify(vendor),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan vendor ke Supabase');
  }
}

export async function apiDeleteVendor(id: string): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch(`/api/vendors/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menghapus vendor dari Supabase');
  }
}

export async function apiSaveKaryawan(karyawan: Karyawan): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/karyawan', {
    method: 'POST',
    headers,
    body: JSON.stringify(karyawan),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan karyawan ke Supabase');
  }
}

export async function apiDeleteKaryawan(id: string): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch(`/api/karyawan/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menghapus karyawan dari Supabase');
  }
}

export async function apiSaveCategory(nama: string): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ nama }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan kategori ke Supabase');
  }
}

export async function apiDeleteCategory(nama: string): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch(`/api/categories/${encodeURIComponent(nama)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menghapus kategori dari Supabase');
  }
}

export async function apiSaveRecap(recap: Recap): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/recaps', {
    method: 'POST',
    headers,
    body: JSON.stringify(recap),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan rekap ke Supabase');
  }
}

export async function apiGetSprinterLocations(): Promise<SprinterLocation[]> {
  const res = await fetch('/api/gps');
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.locations || [];
}

export async function apiSaveSprinterLocation(loc: SprinterLocation): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/gps', {
    method: 'POST',
    headers,
    body: JSON.stringify(loc),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal memperbarui lokasi GPS sprinter');
  }
}

export async function apiClearAllSprinterLocations(): Promise<void> {
  const headers = await getHeaders();
  const res = await fetch('/api/gps', {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal membersihkan data GPS');
  }
}

