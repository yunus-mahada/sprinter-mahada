import { db } from './index.ts';
import { users } from './schema.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export async function getOrCreateUser(uid: string, email: string, nama?: string) {
  const userName = nama || email.split('@')[0];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('users').upsert({
        uid,
        email,
        nama: userName,
        role: 'Sprinter',
      }, { onConflict: 'uid' }).select().single();

      if (!error && data) return data;
      if (!error) return { uid, email, nama: userName, role: 'Sprinter' };
      console.warn('Supabase sync user warning:', error);
    } catch (e) {
      console.warn('Supabase sync user failed:', e);
    }
  }

  try {
    const result = await db.insert(users)
      .values({
        uid,
        email,
        nama: userName,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(nama ? { nama } : {}),
        },
      })
      .returning();

    return result[0];
  } catch {
    return { uid, email, nama: userName, role: 'Sprinter' };
  }
}

export async function getUsers() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (!error && data) return data;
    } catch {
      // ignore
    }
  }

  try {
    return await db.select().from(users);
  } catch {
    return [];
  }
}

