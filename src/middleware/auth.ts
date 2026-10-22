import { Request, Response, NextFunction } from 'express';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (!isSupabaseConfigured) {
    req.user = { id: 'local-user', email: 'user@sprintermahada.com' };
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Supabase token' });
    }
    req.user = data.user;
    next();
  } catch (error) {
    console.error('Error verifying Supabase token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.auth.getUser(token);
        if (data?.user) req.user = data.user;
      } catch {
        // ignore
      }
    }
  }
  next();
};
