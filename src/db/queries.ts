import { eq, desc, asc, or } from 'drizzle-orm';
import { db } from './index.ts';
import { tasks, vendors, categories, karyawan, recaps, sprinterLocations } from './schema.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export async function getAllData() {
  if (isSupabaseConfigured) {
    try {
      const [tasksRes, vendorsRes, categoriesRes, karyawanRes, recapsRes, sprinterLocsRes] = await Promise.all([
        supabase.from('tasks').select('*').order('waktu_update', { ascending: false }),
        supabase.from('vendors').select('*').order('nama', { ascending: true }),
        supabase.from('categories').select('*').order('nama', { ascending: true }),
        supabase.from('karyawan').select('*').order('nama', { ascending: true }),
        supabase.from('recaps').select('*').order('tanggal', { ascending: false }),
        supabase.from('sprinter_locations').select('*').order('waktu_update', { ascending: false }),
      ]);

      if (!tasksRes.error && tasksRes.data) {
        const existingUsers = karyawanRes.data || [];
        const existingUserIds = new Set(existingUsers.map((k: any) => k.id));
        const existingUserNames = new Set(existingUsers.map((k: any) => (k.nama || '').trim().toLowerCase()));

        // Only include sprinter locations for karyawan that still exist in the database, and deduplicate by name
        const locMap = new Map<string, any>();
        for (const l of (sprinterLocsRes?.data || [])) {
          const name = (l.karyawan_nama || '').trim().toLowerCase();
          const validUser =
            existingUserIds.has(l.karyawan_id) ||
            existingUserIds.has(l.id) ||
            existingUserNames.has(name);
          if (validUser && name && !locMap.has(name)) {
            locMap.set(name, l);
          }
        }
        const validSprinterLocs = Array.from(locMap.values());

        return {
          tasks: tasksRes.data.map((t: any) => ({
            ID: t.id,
            Karyawan: t.karyawan,
            JudulTugas: t.judul_tugas,
            Invoice: t.invoice || '',
            Kategori: t.kategori,
            Dari: t.dari || '',
            Tujuan: t.tujuan,
            Prioritas: t.prioritas,
            PIC: t.pic || '',
            NoHP: t.no_hp || '',
            Biaya: t.biaya,
            KeteranganBiaya: t.keterangan_biaya || '',
            Status: t.status,
            WaktuUpdate: t.waktu_update,
            Penerima: t.penerima || '',
            Catatan: t.catatan || '',
          })),
          vendors: (vendorsRes.data || []).map((v: any) => ({
            ID: v.id,
            Nama: v.nama,
            NoHP: v.no_hp || '',
            Alamat: v.alamat,
            LinkMaps: v.link_maps || '',
          })),
          categories: (categoriesRes.data || []).map((c: any) => c.nama),
          users: existingUsers.map((k: any) => ({
            ID: k.id,
            Nama: k.nama,
            Posisi: k.posisi,
          })),
          recaps: (recapsRes.data || []).map((r: any) => ({
            Tanggal: r.tanggal,
            Karyawan: r.karyawan || '',
            UangCash: r.uang_cash,
          })),
          sprinterLocations: validSprinterLocs.map((l: any) => ({
            id: l.id,
            karyawanId: l.karyawan_id,
            karyawanNama: l.karyawan_nama,
            latitude: parseFloat(l.latitude) || 0,
            longitude: parseFloat(l.longitude) || 0,
            accuracy: l.accuracy ? parseFloat(l.accuracy) : undefined,
            speed: l.speed ? parseFloat(l.speed) : undefined,
            waktuUpdate: l.waktu_update,
            isActive: l.is_active === 'true' || l.is_active === true,
          })),
        };
      }
    } catch (err) {
      console.warn('Supabase query failed, falling back to local database:', err);
    }
  }

  try {
    const [allTasks, allVendors, allCategories, allKaryawan, allRecaps, allSprinterLocs] = await Promise.all([
      db.select().from(tasks).orderBy(desc(tasks.waktuUpdate)),
      db.select().from(vendors).orderBy(asc(vendors.nama)),
      db.select().from(categories).orderBy(asc(categories.nama)),
      db.select().from(karyawan).orderBy(asc(karyawan.nama)),
      db.select().from(recaps).orderBy(desc(recaps.tanggal)),
      db.select().from(sprinterLocations).orderBy(desc(sprinterLocations.waktuUpdate)),
    ]);

    return {
      tasks: allTasks.map((t) => ({
        ID: t.id,
        Karyawan: t.karyawan,
        JudulTugas: t.judulTugas,
        Invoice: t.invoice || '',
        Kategori: t.kategori,
        Dari: t.dari || '',
        Tujuan: t.tujuan,
        Prioritas: t.prioritas,
        PIC: t.pic || '',
        NoHP: t.noHp || '',
        Biaya: t.biaya,
        KeteranganBiaya: t.keteranganBiaya || '',
        Status: t.status,
        WaktuUpdate: t.waktuUpdate,
        Penerima: t.penerima || '',
        Catatan: t.catatan || '',
      })),
      vendors: allVendors.map((v) => ({
        ID: v.id,
        Nama: v.nama,
        NoHP: v.noHp || '',
        Alamat: v.alamat,
        LinkMaps: v.linkMaps || '',
      })),
      categories: allCategories.map((c) => c.nama),
      users: allKaryawan.map((k) => ({
        ID: k.id,
        Nama: k.nama,
        Posisi: k.posisi,
      })),
      recaps: allRecaps.map((r) => ({
        Tanggal: r.tanggal,
        Karyawan: r.karyawan || '',
        UangCash: r.uangCash,
      })),
      sprinterLocations: (() => {
        const activeIds = new Set(allKaryawan.map((k) => k.id));
        const activeNames = new Set(allKaryawan.map((k) => (k.nama || '').trim().toLowerCase()));
        return allSprinterLocs
          .filter(
            (l) =>
              activeIds.has(l.karyawanId) ||
              activeIds.has(l.id) ||
              activeNames.has((l.karyawanNama || '').trim().toLowerCase())
          )
          .map((l) => ({
            id: l.id,
            karyawanId: l.karyawanId,
            karyawanNama: l.karyawanNama,
            latitude: parseFloat(l.latitude) || 0,
            longitude: parseFloat(l.longitude) || 0,
            accuracy: l.accuracy ? parseFloat(l.accuracy) : undefined,
            speed: l.speed ? parseFloat(l.speed) : undefined,
            waktuUpdate: l.waktuUpdate,
            isActive: l.isActive === 'true',
          }));
      })(),
    };
  } catch (error) {
    console.error('Failed to fetch data:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertTask(taskData: {
  ID: string;
  Karyawan: string;
  JudulTugas: string;
  Invoice?: string;
  Kategori?: string;
  Dari?: string;
  Tujuan: string;
  Prioritas?: string;
  PIC?: string;
  NoHP?: string;
  Biaya?: number;
  KeteranganBiaya?: string;
  Status?: string;
  WaktuUpdate?: string;
  Penerima?: string;
  Catatan?: string;
}) {
  const formatted = {
    id: taskData.ID,
    karyawan: taskData.Karyawan,
    judulTugas: taskData.JudulTugas,
    invoice: taskData.Invoice || '',
    kategori: taskData.Kategori || 'Lainnya',
    dari: taskData.Dari || '',
    tujuan: taskData.Tujuan,
    prioritas: taskData.Prioritas || 'Standar',
    pic: taskData.PIC || '',
    noHp: taskData.NoHP || '',
    biaya: Number(taskData.Biaya) || 0,
    keteranganBiaya: taskData.KeteranganBiaya || '',
    status: taskData.Status || 'Pending',
    waktuUpdate: taskData.WaktuUpdate || new Date().toISOString().replace('T', ' ').substring(0, 19),
    penerima: taskData.Penerima || '',
    catatan: taskData.Catatan || '',
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('tasks').upsert({
        id: formatted.id,
        karyawan: formatted.karyawan,
        judul_tugas: formatted.judulTugas,
        invoice: formatted.invoice,
        kategori: formatted.kategori,
        dari: formatted.dari,
        tujuan: formatted.tujuan,
        prioritas: formatted.prioritas,
        pic: formatted.pic,
        no_hp: formatted.noHp,
        biaya: formatted.biaya,
        keterangan_biaya: formatted.keteranganBiaya,
        status: formatted.status,
        waktu_update: formatted.waktuUpdate,
        penerima: formatted.penerima,
        catatan: formatted.catatan,
      }).select().single();

      if (!error && data) {
        return data;
      }
      if (!error) {
        return formatted;
      }
      console.warn('Supabase upsertTask error:', error);
    } catch (e) {
      console.warn('Supabase upsertTask failed:', e);
    }
  }

  try {
    const res = await db
      .insert(tasks)
      .values(formatted)
      .onConflictDoUpdate({
        target: tasks.id,
        set: formatted,
      })
      .returning();

    return res[0];
  } catch (error) {
    console.error('Failed to upsert task:', error);
    throw new Error('Failed to save task in database.', { cause: error });
  }
}

export async function deleteTask(id: string) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (!error) {
        return [{ id }];
      }
      console.warn('Supabase deleteTask error:', error);
    } catch (e) {
      console.warn('Supabase deleteTask failed:', e);
    }
  }

  try {
    return await db.delete(tasks).where(eq(tasks.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete task:', error);
    throw new Error('Failed to delete task from database.', { cause: error });
  }
}

export async function upsertVendor(vendorData: {
  ID: string;
  Nama: string;
  NoHP?: string;
  Alamat: string;
  LinkMaps?: string;
}) {
  const formatted = {
    id: vendorData.ID,
    nama: vendorData.Nama,
    noHp: vendorData.NoHP || '',
    alamat: vendorData.Alamat,
    linkMaps: vendorData.LinkMaps || '',
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('vendors').upsert({
        id: formatted.id,
        nama: formatted.nama,
        no_hp: formatted.noHp,
        alamat: formatted.alamat,
        link_maps: formatted.linkMaps,
      }).select().single();

      if (!error && data) {
        return data;
      }
      if (!error) {
        return formatted;
      }
      console.warn('Supabase upsertVendor error:', error);
    } catch (e) {
      console.warn('Supabase upsertVendor failed:', e);
    }
  }

  try {
    const res = await db
      .insert(vendors)
      .values(formatted)
      .onConflictDoUpdate({
        target: vendors.id,
        set: formatted,
      })
      .returning();

    return res[0];
  } catch (error) {
    console.error('Failed to upsert vendor:', error);
    throw new Error('Failed to save vendor in database.', { cause: error });
  }
}

export async function deleteVendor(id: string) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (!error) {
        return [{ id }];
      }
      console.warn('Supabase deleteVendor error:', error);
    } catch (e) {
      console.warn('Supabase deleteVendor failed:', e);
    }
  }

  try {
    return await db.delete(vendors).where(eq(vendors.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete vendor:', error);
    throw new Error('Failed to delete vendor from database.', { cause: error });
  }
}

export async function insertCategory(nama: string) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('categories').insert({ nama }).select().single();
      if (!error && data) {
        return data;
      }
      if (!error) {
        return { nama };
      }
      console.warn('Supabase insertCategory error:', error);
    } catch (e) {
      console.warn('Supabase insertCategory failed:', e);
    }
  }

  try {
    const res = await db
      .insert(categories)
      .values({ nama })
      .onConflictDoNothing()
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to insert category:', error);
    throw new Error('Failed to save category in database.', { cause: error });
  }
}

export async function deleteCategory(nama: string) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('categories').delete().eq('nama', nama);
      if (!error) {
        return [{ nama }];
      }
      console.warn('Supabase deleteCategory error:', error);
    } catch (e) {
      console.warn('Supabase deleteCategory failed:', e);
    }
  }

  try {
    return await db.delete(categories).where(eq(categories.nama, nama)).returning();
  } catch (error) {
    console.error('Failed to delete category:', error);
    throw new Error('Failed to delete category from database.', { cause: error });
  }
}

export async function upsertKaryawan(data: { ID: string; Nama: string; Posisi?: string }) {
  const formatted = {
    id: data.ID,
    nama: data.Nama,
    posisi: data.Posisi || 'Sprinter',
  };

  if (isSupabaseConfigured) {
    try {
      const { data: savedData, error } = await supabase.from('karyawan').upsert(formatted).select().single();
      if (!error && savedData) {
        return savedData;
      }
      if (!error) {
        return formatted;
      }
      console.warn('Supabase upsertKaryawan error:', error);
    } catch (e) {
      console.warn('Supabase upsertKaryawan failed:', e);
    }
  }

  try {
    const res = await db
      .insert(karyawan)
      .values(formatted)
      .onConflictDoUpdate({
        target: karyawan.id,
        set: formatted,
      })
      .returning();

    return res[0];
  } catch (error) {
    console.error('Failed to upsert karyawan:', error);
    throw new Error('Failed to save karyawan in database.', { cause: error });
  }
}

export async function deleteKaryawan(id: string) {
  if (isSupabaseConfigured) {
    try {
      // Also delete any existing GPS location for this karyawan
      await supabase.from('sprinter_locations').delete().or(`karyawan_id.eq.${id},id.eq.${id}`);
      const { error } = await supabase.from('karyawan').delete().eq('id', id);
      if (!error) {
        return [{ id }];
      }
      console.warn('Supabase deleteKaryawan error:', error);
    } catch (e) {
      console.warn('Supabase deleteKaryawan failed:', e);
    }
  }

  try {
    await db.delete(sprinterLocations).where(or(eq(sprinterLocations.karyawanId, id), eq(sprinterLocations.id, id)));
    return await db.delete(karyawan).where(eq(karyawan.id, id)).returning();
  } catch (error) {
    console.error('Failed to delete karyawan:', error);
    throw new Error('Failed to delete karyawan from database.', { cause: error });
  }
}

export async function upsertRecap(recapData: {
  Tanggal: string;
  Karyawan?: string;
  UangCash: number;
}) {
  const formatted = {
    tanggal: recapData.Tanggal,
    karyawan: recapData.Karyawan || '',
    uangCash: Number(recapData.UangCash) || 0,
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('recaps').upsert({
        tanggal: formatted.tanggal,
        karyawan: formatted.karyawan,
        uang_cash: formatted.uangCash,
      }).select().single();

      if (!error && data) {
        return data;
      }
      if (!error) {
        return formatted;
      }
      console.warn('Supabase upsertRecap error:', error);
    } catch (e) {
      console.warn('Supabase upsertRecap failed:', e);
    }
  }

  try {
    const res = await db
      .insert(recaps)
      .values(formatted)
      .onConflictDoUpdate({
        target: recaps.tanggal,
        set: formatted,
      })
      .returning();

    return res[0];
  } catch (error) {
    console.error('Failed to upsert recap:', error);
    throw new Error('Failed to save recap in database.', { cause: error });
  }
}

export async function getSprinterLocations() {
  if (isSupabaseConfigured) {
    try {
      const res = await supabase.from('sprinter_locations').select('*').order('waktu_update', { ascending: false });
      if (!res.error && res.data) {
        // Deduplicate by name taking the most recent update
        const locMap = new Map<string, any>();
        for (const l of res.data) {
          const name = (l.karyawan_nama || '').trim().toLowerCase();
          if (name && !locMap.has(name)) {
            locMap.set(name, l);
          }
        }
        return Array.from(locMap.values()).map((l: any) => ({
          id: l.id,
          karyawanId: l.karyawan_id,
          karyawanNama: l.karyawan_nama,
          latitude: parseFloat(l.latitude),
          longitude: parseFloat(l.longitude),
          accuracy: l.accuracy ? parseFloat(l.accuracy) : undefined,
          speed: l.speed ? parseFloat(l.speed) : null,
          waktuUpdate: l.waktu_update,
          isActive: l.is_active === 'true' || l.is_active === true,
        }));
      }
    } catch (e) {
      console.warn('Supabase getSprinterLocations failed:', e);
    }
  }

  try {
    const list = await db.select().from(sprinterLocations).orderBy(desc(sprinterLocations.waktuUpdate));
    return list.map((l) => ({
      id: l.id,
      karyawanId: l.karyawanId,
      karyawanNama: l.karyawanNama,
      latitude: parseFloat(l.latitude),
      longitude: parseFloat(l.longitude),
      accuracy: l.accuracy ? parseFloat(l.accuracy) : undefined,
      speed: l.speed ? parseFloat(l.speed) : null,
      waktuUpdate: l.waktuUpdate,
      isActive: l.isActive === 'true',
    }));
  } catch (error) {
    console.error('Failed to get sprinter locations:', error);
    return [];
  }
}

export async function upsertSprinterLocation(locData: {
  id: string;
  karyawanId: string;
  karyawanNama: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null;
  waktuUpdate: string;
  isActive: boolean;
}) {
  const formatted = {
    id: locData.id,
    karyawanId: locData.karyawanId,
    karyawanNama: locData.karyawanNama,
    latitude: String(locData.latitude),
    longitude: String(locData.longitude),
    accuracy: locData.accuracy !== undefined ? String(locData.accuracy) : '',
    speed: locData.speed !== undefined && locData.speed !== null ? String(locData.speed) : '',
    waktuUpdate: locData.waktuUpdate || new Date().toISOString(),
    isActive: String(locData.isActive),
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('sprinter_locations').upsert({
        id: formatted.id,
        karyawan_id: formatted.karyawanId,
        karyawan_nama: formatted.karyawanNama,
        latitude: formatted.latitude,
        longitude: formatted.longitude,
        accuracy: formatted.accuracy,
        speed: formatted.speed,
        waktu_update: formatted.waktuUpdate,
        is_active: formatted.isActive,
      }).select().single();

      // Delete any older duplicate rows for the same sprinter name to prevent duplicate markers
      await supabase
        .from('sprinter_locations')
        .delete()
        .eq('karyawan_nama', formatted.karyawanNama)
        .neq('id', formatted.id);

      if (!error && data) {
        return data;
      }
      if (!error) {
        return formatted;
      }
      console.warn('Supabase upsertSprinterLocation error:', error);
    } catch (e) {
      console.warn('Supabase upsertSprinterLocation failed:', e);
    }
  }

  try {
    const res = await db
      .insert(sprinterLocations)
      .values(formatted)
      .onConflictDoUpdate({
        target: sprinterLocations.id,
        set: formatted,
      })
      .returning();

    return res[0];
  } catch (error) {
    console.error('Failed to upsert sprinter location:', error);
    throw new Error('Failed to save sprinter location in database.', { cause: error });
  }
}

export async function clearAllSprinterLocations() {
  if (isSupabaseConfigured) {
    try {
      await supabase.from('sprinter_locations').delete().neq('id', 'dummy-prevent-empty');
    } catch (e) {
      console.warn('Supabase clearAllSprinterLocations failed:', e);
    }
  }
  try {
    await db.delete(sprinterLocations);
  } catch (e) {
    // ignore
  }
}

