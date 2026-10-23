// Service Worker untuk Background GPS Sprinter Mahada
// File: public/gps-sw.js

const SW_VERSION = 'gps-sw-v1';
const GPS_SYNC_INTERVAL = 15000; // 15 detik

let gpsWatchId = null;
let syncInterval = null;
let sprinterConfig = null; // { karyawanId, karyawanNama, apiUrl, apiKey }
let lastCoords = null;
let lastSentTime = 0;

// ============================================================
// HANDLE MESSAGES FROM MAIN THREAD
// ============================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'START_GPS') {
    sprinterConfig = payload; // { karyawanId, karyawanNama, apiUrl, apiKey }
    startBackgroundGPS();
    event.source?.postMessage({ type: 'GPS_STATUS', status: 'started' });
  }

  if (type === 'STOP_GPS') {
    stopBackgroundGPS();
    event.source?.postMessage({ type: 'GPS_STATUS', status: 'stopped' });
  }

  if (type === 'GET_STATUS') {
    event.source?.postMessage({
      type: 'GPS_STATUS',
      status: gpsWatchId !== null ? 'running' : 'stopped',
      lastCoords,
    });
  }
});

// ============================================================
// START GPS BACKGROUND TRACKING
// ============================================================
function startBackgroundGPS() {
  if (!self.navigator?.geolocation) return;
  if (gpsWatchId !== null) return; // already running

  gpsWatchId = self.navigator.geolocation.watchPosition(
    (position) => {
      lastCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        timestamp: new Date().toISOString(),
      };
      trySendGps(lastCoords);
    },
    (err) => {
      console.warn('[GPS-SW] Error:', err.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    }
  );

  // Fallback interval ping setiap 15 detik
  syncInterval = setInterval(() => {
    if (lastCoords) {
      trySendGps(lastCoords);
    }
  }, GPS_SYNC_INTERVAL);
}

// ============================================================
// STOP GPS TRACKING
// ============================================================
function stopBackgroundGPS() {
  if (gpsWatchId !== null) {
    self.navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (syncInterval !== null) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  // Send final inactive status
  if (sprinterConfig && lastCoords) {
    sendToSupabase(lastCoords, false);
  }
}

// ============================================================
// RATE-LIMITED GPS SEND
// ============================================================
function trySendGps(coords) {
  const now = Date.now();
  if (now - lastSentTime < 7000) return; // max 1 kali per 7 detik
  lastSentTime = now;
  sendToSupabase(coords, true);
}

// ============================================================
// SEND TO SUPABASE REST API
// ============================================================
async function sendToSupabase(coords, isActive) {
  if (!sprinterConfig) return;

  const { karyawanId, karyawanNama, apiUrl, apiKey } = sprinterConfig;

  const payload = {
    id: karyawanId,
    karyawan_id: karyawanId,
    karyawan_nama: karyawanNama,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy || null,
    speed: coords.speed || null,
    waktu_update: new Date().toISOString(),
    is_active: isActive,
  };

  try {
    const res = await fetch(`${apiUrl}/sprinter_locations?id=eq.${karyawanId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    // If not found (0 rows matched), do INSERT
    if (res.status === 404 || res.headers.get('content-range') === '*/0') {
      await fetch(`${apiUrl}/sprinter_locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.warn('[GPS-SW] Gagal kirim GPS:', err.message);
  }
}

// ============================================================
// INSTALL & ACTIVATE
// ============================================================
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
