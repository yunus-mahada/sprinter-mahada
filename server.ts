import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dbQueries from './src/db/queries.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { optionalAuth } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(express.json());

// API Routes

// 1. Get All Operational Data
app.get('/api/data', async (req, res) => {
  try {
    const data = await dbQueries.getAllData();
    res.json(data);
  } catch (error: any) {
    console.error('API /api/data error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 2. Tasks
app.post('/api/tasks', optionalAuth, async (req, res) => {
  try {
    const taskData = req.body;
    if (!taskData || !taskData.ID || !taskData.JudulTugas) {
      return res.status(400).json({ error: 'Data tugas tidak lengkap' });
    }
    const saved = await dbQueries.upsertTask(taskData);
    res.json({ success: true, task: saved });
  } catch (error: any) {
    console.error('API /api/tasks error:', error);
    res.status(500).json({ error: error.message || 'Failed to save task' });
  }
});

app.delete('/api/tasks/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await dbQueries.deleteTask(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/tasks/:id DELETE error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete task' });
  }
});

// 3. Vendors
app.post('/api/vendors', optionalAuth, async (req, res) => {
  try {
    const vendorData = req.body;
    if (!vendorData || !vendorData.ID || !vendorData.Nama) {
      return res.status(400).json({ error: 'Nama vendor wajib diisi' });
    }
    const saved = await dbQueries.upsertVendor(vendorData);
    res.json({ success: true, vendor: saved });
  } catch (error: any) {
    console.error('API /api/vendors error:', error);
    res.status(500).json({ error: error.message || 'Failed to save vendor' });
  }
});

app.delete('/api/vendors/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await dbQueries.deleteVendor(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/vendors/:id DELETE error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete vendor' });
  }
});

// 4. Karyawan
app.post('/api/karyawan', optionalAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.ID || !data.Nama) {
      return res.status(400).json({ error: 'ID dan Nama karyawan wajib diisi' });
    }
    const saved = await dbQueries.upsertKaryawan(data);
    res.json({ success: true, karyawan: saved });
  } catch (error: any) {
    console.error('API /api/karyawan error:', error);
    res.status(500).json({ error: error.message || 'Failed to save karyawan' });
  }
});

app.delete('/api/karyawan/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await dbQueries.deleteKaryawan(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/karyawan/:id DELETE error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete karyawan' });
  }
});

// 5. Categories
app.post('/api/categories', optionalAuth, async (req, res) => {
  try {
    const { nama } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    const saved = await dbQueries.insertCategory(nama);
    res.json({ success: true, category: saved });
  } catch (error: any) {
    console.error('API /api/categories error:', error);
    res.status(500).json({ error: error.message || 'Failed to save category' });
  }
});

app.delete('/api/categories/:name', optionalAuth, async (req, res) => {
  try {
    const { name } = req.params;
    await dbQueries.deleteCategory(decodeURIComponent(name));
    res.json({ success: true });
  } catch (error: any) {
    console.error('API /api/categories/:name DELETE error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete category' });
  }
});

// 6. Recaps (Kas Harian)
app.post('/api/recaps', optionalAuth, async (req, res) => {
  try {
    const recapData = req.body;
    if (!recapData || !recapData.Tanggal) {
      return res.status(400).json({ error: 'Tanggal rekap wajib diisi' });
    }
    const saved = await dbQueries.upsertRecap(recapData);
    res.json({ success: true, recap: saved });
  } catch (error: any) {
    console.error('API /api/recaps error:', error);
    res.status(500).json({ error: error.message || 'Failed to save recap' });
  }
});

// 7. Auth User Sync
app.post('/api/auth/sync', optionalAuth, async (req, res) => {
  try {
    const { uid, email, nama } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ error: 'UID and email are required' });
    }
    const user = await getOrCreateUser(uid, email, nama);
    res.json({ success: true, user });
  } catch (error: any) {
    console.error('API /api/auth/sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync user' });
  }
});

// 8. GPS Sprinter Tracking
app.get('/api/gps', optionalAuth, async (_req, res) => {
  try {
    const locations = await dbQueries.getSprinterLocations();
    res.json({ success: true, locations });
  } catch (error: any) {
    console.error('API /api/gps GET error:', error);
    res.status(500).json({ error: error.message || 'Failed to get sprinter locations' });
  }
});

app.post('/api/gps', optionalAuth, async (req, res) => {
  try {
    const locData = req.body;
    if (!locData || !locData.karyawanId || locData.latitude === undefined || locData.longitude === undefined) {
      return res.status(400).json({ error: 'karyawanId, latitude, and longitude are required' });
    }
    const saved = await dbQueries.upsertSprinterLocation({
      id: locData.id || locData.karyawanId,
      karyawanId: locData.karyawanId,
      karyawanNama: locData.karyawanNama || locData.karyawanId,
      latitude: Number(locData.latitude),
      longitude: Number(locData.longitude),
      accuracy: locData.accuracy !== undefined ? Number(locData.accuracy) : undefined,
      speed: locData.speed !== undefined && locData.speed !== null ? Number(locData.speed) : null,
      waktuUpdate: locData.waktuUpdate || new Date().toISOString(),
      isActive: locData.isActive !== false,
    });
    res.json({ success: true, location: saved });
  } catch (error: any) {
    console.error('API /api/gps POST error:', error);
    res.status(500).json({ error: error.message || 'Failed to save sprinter location' });
  }
});

// Setup Vite middleware in dev or static files in production
export async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, () => {
    console.log(`Server running at http://localhost:${port} in ${isProduction ? 'production' : 'development'} mode`);
  });
}

// Only listen if not running in Vercel serverless environment
if (!process.env.VERCEL) {
  startServer();
}

export default app;

