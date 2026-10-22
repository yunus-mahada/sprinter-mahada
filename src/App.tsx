import React, { useState, useEffect, useMemo } from 'react';
import { Task, Vendor, Karyawan, Recap, AppData, SprinterLocation } from './types.ts';
import * as api from './services/api.ts';
import { useAuth, AuthProvider } from './context/AuthContext.tsx';
import { SprinterLiveMap } from './components/SprinterLiveMap.tsx';

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 5) return 'baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mnt lalu`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return `${Math.floor(diffHours / 24)} hari lalu`;
  } catch {
    return dateStr;
  }
}

function formatRupiah(num: number): string {
  return 'Rp ' + (num || 0).toLocaleString('id-ID');
}

function getJakartaTimeString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getIndonesianDateHeader(): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const d = new Date();
  const dayName = days[d.getDay()];
  const date = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${date} ${monthName} ${year}`;
}

function formatTaskTime(waktuUpdate: string): string {
  if (!waktuUpdate) return '-';
  const parts = waktuUpdate.split(' ');
  const datePart = parts[0] || '';
  const timePart = (parts[1] || '').substring(0, 5);

  if (datePart.includes('-')) {
    const dp = datePart.split('-');
    const d = parseInt(dp[2], 10);
    const m = parseInt(dp[1], 10) - 1;
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (!isNaN(d) && m >= 0 && m < 12) {
      return `${d} ${monthsShort[m]} ${timePart}`;
    }
  }
  return timePart || waktuUpdate;
}

function resolveLocationMapsLink(
  locationText: string,
  vendors: Vendor[]
): {
  url: string;
  vendorMatch?: Vendor;
  hasCustomMap: boolean;
} {
  if (!locationText) return { url: '#', hasCustomMap: false };
  if (locationText.startsWith('http://') || locationText.startsWith('https://')) {
    return { url: locationText, hasCustomMap: true };
  }

  const cleanText = locationText.toLowerCase();
  // Sort vendors by length of name descending to match the longest / most specific name first
  const sortedVendors = [...vendors].sort((a, b) => (b.Nama || '').length - (a.Nama || '').length);
  const match = sortedVendors.find((v) => {
    const vName = (v.Nama || '').trim().toLowerCase();
    return vName && (cleanText.includes(vName) || cleanText.startsWith(vName));
  });

  if (match && match.LinkMaps && match.LinkMaps.trim()) {
    return {
      url: match.LinkMaps.trim(),
      vendorMatch: match,
      hasCustomMap: true,
    };
  }

  return {
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`,
    vendorMatch: match,
    hasCustomMap: false,
  };
}

export function SprinterApp() {
  const {
    user,
    isConfigured: isSupabaseConfigured,
    signInWithOAuth,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
  } = useAuth();

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authMsg, setAuthMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Navigation tab: 'home' | 'radar' | 'add' | 'report' | 'vendor' | 'setting'
  const [activeTab, setActiveTab] = useState<'home' | 'radar' | 'add' | 'report' | 'vendor' | 'setting'>('home');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // App Data directly from server/Supabase
  const [data, setData] = useState<AppData>({
    tasks: [],
    vendors: [],
    categories: [],
    users: [],
    recaps: [],
    sprinterLocations: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('SINKRONISASI...');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // GPS Tracking state
  const [isGpsBroadcasting, setIsGpsBroadcasting] = useState<boolean>(() => {
    return localStorage.getItem('sprinter_gps_active') === 'true';
  });
  const [mySprinterIdentity, setMySprinterIdentity] = useState<string>(() => {
    return localStorage.getItem('sprinter_my_name') || '';
  });
  const [currentGpsCoords, setCurrentGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number | null;
    timestamp: string;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showLiveRadarMap, setShowLiveRadarMap] = useState<boolean>(true);
  const [selectedSprinterOnMap, setSelectedSprinterOnMap] = useState<string | undefined>(undefined);

  // Filter in Home (cuma Pending, Diproses/Dalam Perjalanan, Selesai, Batal/Gagal)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'Dalam Perjalanan' | 'Selesai' | 'Gagal'>('Pending');

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Sub-tabs in Settings ('karyawan' | 'gps' | 'kategori' | 'informasi')
  const [settingTab, setSettingTab] = useState<'karyawan' | 'gps' | 'kategori' | 'informasi'>('karyawan');

  // Filter in Report
  const [reportDate, setReportDate] = useState<string>(getTodayDateString());
  const [reportKaryawan, setReportKaryawan] = useState<string>('ALL');
  const [rekapKaryawan, setRekapKaryawan] = useState<string>('');
  const [uangCashInput, setUangCashInput] = useState<string>('');

  // Vendor search
  const [vendorSearch, setVendorSearch] = useState('');

  // Modals
  const [statusModalTask, setStatusModalTask] = useState<Task | null>(null);
  const [modalStatusChoice, setModalStatusChoice] = useState<string>('Pending');
  const [modalBiaya, setModalBiaya] = useState<string>('');
  const [modalKetBiaya, setModalKetBiaya] = useState<string>('');
  const [modalPenerima, setModalPenerima] = useState<string>('');
  const [modalCatatan, setModalCatatan] = useState<string>('');

  const [vendorModalData, setVendorModalData] = useState<{
    id?: string;
    nama: string;
    noHp: string;
    alamat: string;
    linkMaps: string;
  } | null>(null);
  const [editModalTask, setEditModalTask] = useState<Task | null>(null);

  // Add Task Form state
  const [addKaryawan, setAddKaryawan] = useState('');
  const [addJudul, setAddJudul] = useState('');
  const [addInvoice, setAddInvoice] = useState('');
  const [addKategori, setAddKategori] = useState('Pengiriman');
  const [addDari, setAddDari] = useState('');
  const [addTujuan, setAddTujuan] = useState('');
  const [addPrioritas, setAddPrioritas] = useState<'Standar' | 'Urgent'>('Standar');
  const [addPIC, setAddPIC] = useState('');
  const [addHP, setAddHP] = useState('');
  const [selectedVendorDariId, setSelectedVendorDariId] = useState('');
  const [selectedVendorTujuanId, setSelectedVendorTujuanId] = useState('');

  // Settings state
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Sprinter');
  const [newCategoryName, setNewCategoryName] = useState('');

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Toast auto-clear
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  // PWA Install Event Listener & Check
  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsAppInstalled(isStandalone);
    };
    checkStandalone();

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      showToast('Aplikasi berhasil dipasang di handphone Anda!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isAppInstalled) {
      showToast('Aplikasi sudah terpasang di HP ini!');
      return;
    }
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          showToast('Menginstal aplikasi ke layar utama HP...');
        }
        setDeferredPrompt(null);
      } catch {
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };


  // Initial & periodic data fetch
  const refreshData = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setLoadingText('SINKRONISASI DATABASE...');
    }
    try {
      const result = await api.fetchAllData();
      setData(result);
    } catch (e: any) {
      console.error('Refresh error:', e);
      if (!silent) showToast('Gagal memuat data terbaru');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData(false);
    const interval = setInterval(() => {
      refreshData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Periodic GPS sync
  useEffect(() => {
    const fetchGpsOnly = async () => {
      try {
        const locs = await api.apiGetSprinterLocations();
        setData((prev) => ({ ...prev, sprinterLocations: locs }));
      } catch (e) {
        // ignore
      }
    };
    const gpsInterval = setInterval(fetchGpsOnly, 10000);
    return () => clearInterval(gpsInterval);
  }, []);

  // HTML5 Geolocation watchPosition hook for sprinter mobile GPS broadcast
  useEffect(() => {
    if (!isGpsBroadcasting || !mySprinterIdentity) return;

    if (!navigator.geolocation) {
      setGpsError('Browser HP Anda tidak mendukung fitur Geolocation GPS.');
      setIsGpsBroadcasting(false);
      localStorage.setItem('sprinter_gps_active', 'false');
      return;
    }

    let lastSent = 0;
    const sendGpsUpdate = async (coords: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number | null;
    }) => {
      const now = Date.now();
      // Rate limit to once every 7 seconds
      if (now - lastSent < 7000) return;
      lastSent = now;

      const userObj = data.users.find((u) => u.Nama.trim() === mySprinterIdentity.trim());
      const karyawanId = userObj ? userObj.ID : mySprinterIdentity.replace(/\s+/g, '-').toLowerCase();
      const nowIso = new Date().toISOString();

      const locPayload: SprinterLocation = {
        id: karyawanId,
        karyawanId,
        karyawanNama: mySprinterIdentity,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        waktuUpdate: nowIso,
        isActive: true,
      };

      try {
        await api.apiSaveSprinterLocation(locPayload);
        setData((prev) => {
          const list = prev.sprinterLocations || [];
          const withoutMe = list.filter((l) => l.karyawanNama !== mySprinterIdentity && l.id !== karyawanId);
          return {
            ...prev,
            sprinterLocations: [locPayload, ...withoutMe],
          };
        });
      } catch (err) {
        console.warn('Gagal broadcast GPS:', err);
      }
    };

    // 1. Screen Wake Lock to prevent screen turning off while driving
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch (e) {
        // WakeLock may fail if battery is low or not supported
      }
    };
    requestWakeLock();

    // 2. Inaudible silent audio loop keep-alive to keep mobile browser thread active in background
    let audioKeepAlive: HTMLAudioElement | null = null;
    try {
      audioKeepAlive = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
      audioKeepAlive.loop = true;
      audioKeepAlive.volume = 0.01;
      audioKeepAlive.play().catch(() => {});
    } catch (e) {
      // Audio playback might require user gesture, already triggered on toggle button click
    }

    // 3. Main Geolocation Watch
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          timestamp: new Date().toISOString(),
        };
        setCurrentGpsCoords(coords);
        setGpsError(null);
        sendGpsUpdate(coords);
      },
      (err) => {
        console.warn('GPS watch error:', err);
        if (err.code === 1) {
          setGpsError('Izin akses lokasi GPS ditolak oleh browser/HP. Harap izinkan lokasi.');
        } else if (err.code === 2) {
          setGpsError('Sinyal GPS tidak terdeteksi. Pastikan GPS HP aktif.');
        } else {
          setGpsError(err.message || 'Gagal membaca koordinat GPS.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 4000,
      }
    );

    // 4. Fallback interval ping (every 15s) in case watchPosition throttles on background
    const intervalPing = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            timestamp: new Date().toISOString(),
          };
          setCurrentGpsCoords(coords);
          sendGpsUpdate(coords);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    }, 15000);

    // 5. Page visibility change auto-sync (instant ping when user returns to app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              timestamp: new Date().toISOString(),
            };
            setCurrentGpsCoords(coords);
            sendGpsUpdate(coords);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalPing);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
      if (audioKeepAlive) {
        audioKeepAlive.pause();
        audioKeepAlive.src = '';
      }
    };
  }, [isGpsBroadcasting, mySprinterIdentity, data.users]);

  const handleToggleGps = async () => {
    if (!mySprinterIdentity) {
      showToast('Pilih nama sprinter Anda terlebih dahulu');
      return;
    }

    if (isGpsBroadcasting) {
      setIsGpsBroadcasting(false);
      localStorage.setItem('sprinter_gps_active', 'false');
      showToast('Broadcast GPS Sprinter dinonaktifkan');

      try {
        const userObj = data.users.find((u) => u.Nama.trim() === mySprinterIdentity.trim());
        const karyawanId = userObj ? userObj.ID : mySprinterIdentity.replace(/\s+/g, '-').toLowerCase();
        if (currentGpsCoords) {
          await api.apiSaveSprinterLocation({
            id: karyawanId,
            karyawanId,
            karyawanNama: mySprinterIdentity,
            latitude: currentGpsCoords.latitude,
            longitude: currentGpsCoords.longitude,
            accuracy: currentGpsCoords.accuracy,
            speed: currentGpsCoords.speed,
            waktuUpdate: new Date().toISOString(),
            isActive: false,
          });
        }
      } catch (e) {
        // ignore
      }
    } else {
      localStorage.setItem('sprinter_my_name', mySprinterIdentity);
      localStorage.setItem('sprinter_gps_active', 'true');
      setIsGpsBroadcasting(true);
      showToast('Mengaktifkan pelacakan GPS live...');
    }
  };

  // Sync recap state when reportDate changes
  useEffect(() => {
    const existing = (data.recaps || []).find((r) => r.Tanggal === reportDate);
    if (existing) {
      setUangCashInput(existing.UangCash ? String(existing.UangCash) : '');
      setRekapKaryawan(existing.Karyawan || '');
    } else {
      setUangCashInput('');
      setRekapKaryawan('');
    }
  }, [reportDate, data.recaps]);

  // Set default form choices when data loads
  useEffect(() => {
    if (!addKaryawan && data.users.length > 0) {
      setAddKaryawan(`${data.users[0].Nama} (${data.users[0].Posisi})`);
    }
    if (!addKategori && data.categories.length > 0) {
      setAddKategori(data.categories[0]);
    }
  }, [data.users, data.categories, addKaryawan, addKategori]);

  // Dashboard calculations
  const stats = useMemo(() => {
    const todayStr = getTodayDateString();
    let totalHariIni = 0;
    let selHariIni = 0;
    let prosHariIni = 0;
    let byaHariIni = 0;
    let lastLokasi = 'Belum ada aktivitas';
    let lastTime = '';

    for (const t of data.tasks) {
      const isToday = t.WaktuUpdate && t.WaktuUpdate.startsWith(todayStr);

      if (t.Status === 'Pending') {
        totalHariIni++;
      } else if (t.Status === 'Dalam Perjalanan') {
        totalHariIni++;
        prosHariIni++;
      } else if (t.Status === 'Selesai') {
        if (isToday) {
          totalHariIni++;
          selHariIni++;
          byaHariIni += Number(t.Biaya) || 0;
        }
        if (t.WaktuUpdate >= lastTime) {
          lastTime = t.WaktuUpdate;
          const tJam = (t.WaktuUpdate.split(' ')[1] || '').substring(0, 5);
          lastLokasi = `${t.Tujuan}${tJam ? ` (${tJam})` : ''}`;
        }
      } else if (t.Status === 'Gagal' || t.Status === 'Batal') {
        if (isToday) {
          totalHariIni++;
        }
      }
    }

    const progress = totalHariIni > 0 ? Math.round((selHariIni / totalHariIni) * 100) : 0;
    return {
      total: totalHariIni,
      selesai: selHariIni,
      proses: prosHariIni,
      biaya: byaHariIni,
      progress,
      lastLokasi,
    };
  }, [data.tasks]);

  // Filtered task list
  const filteredTasks = useMemo(() => {
    const kw = searchQuery.trim().toLowerCase();
    const list = [...data.tasks];

    // Disusun berdasarkan input terbaru (terbaru di atas)
    list.sort((a, b) => {
      const timeA = a.WaktuUpdate || '';
      const timeB = b.WaktuUpdate || '';
      if (timeA !== timeB) {
        return timeB.localeCompare(timeA);
      }
      return (b.ID || '').localeCompare(a.ID || '');
    });

    return list.filter((t) => {
      const matchStatus = t.Status === statusFilter;
      const matchKw =
        !kw ||
        (t.JudulTugas + ' ' + t.Tujuan + ' ' + t.PIC + ' ' + t.Karyawan + ' ' + t.Invoice)
          .toLowerCase()
          .includes(kw);
      return matchStatus && matchKw;
    });
  }, [data.tasks, searchQuery, statusFilter]);

  // Counts for segmented status tabs (cuma Pending, Diproses/Dalam Perjalanan, Selesai, Batal/Gagal)
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Pending: 0,
      'Dalam Perjalanan': 0,
      Selesai: 0,
      Gagal: 0,
    };
    for (const t of data.tasks) {
      if (t.Status && t.Status in counts) {
        counts[t.Status]++;
      }
    }
    return counts;
  }, [data.tasks]);

  // Vendor auto-fill handlers (auto reads address into task inputs)
  const handleVendorDariChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedVendorDariId(id);
    if (!id) return;
    const v = data.vendors.find((item) => item.ID === id);
    if (v) {
      setAddDari(v.Alamat ? `${v.Nama} - ${v.Alamat}` : v.Nama);
    }
  };

  const handleVendorTujuanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedVendorTujuanId(id);
    if (!id) return;
    const v = data.vendors.find((item) => item.ID === id);
    if (v) {
      setAddTujuan(v.Alamat ? `${v.Nama} - ${v.Alamat}` : v.Nama);
      if (v.Nama) setAddPIC(v.Nama);
      if (v.NoHP) setAddHP(v.NoHP);
    }
  };

  // Add Task submit
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addJudul.trim() || !addTujuan.trim()) {
      showToast('Judul dan Lokasi Tujuan wajib diisi');
      return;
    }

    const id = `TSK-${getJakartaTimeString().replace(/[- :]/g, '')}-${Math.floor(Math.random() * 90 + 10)}`;
    const newTask: Task = {
      ID: id,
      Karyawan: addKaryawan || (data.users[0] ? `${data.users[0].Nama} (${data.users[0].Posisi})` : 'Sprinter'),
      JudulTugas: addJudul.trim(),
      Invoice: addInvoice.trim(),
      Kategori: addKategori || 'Lainnya',
      Dari: addDari.trim(),
      Tujuan: addTujuan.trim(),
      Prioritas: addPrioritas,
      PIC: addPIC.trim(),
      NoHP: addHP.trim(),
      Biaya: 0,
      KeteranganBiaya: '',
      Status: 'Pending',
      WaktuUpdate: getJakartaTimeString(),
      Penerima: '',
      Catatan: '',
    };

    setIsLoading(true);
    setLoadingText('MENYIMPAN TUGAS...');
    try {
      await api.apiSaveTask(newTask);
      setData((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
      }));
      setAddJudul('');
      setAddInvoice('');
      setAddDari('');
      setAddTujuan('');
      setAddPIC('');
      setAddHP('');
      setSelectedVendorDariId('');
      setSelectedVendorTujuanId('');
      setStatusFilter('Pending');
      setActiveTab('home');
      showToast('Tugas baru berhasil disimpan ke Pending!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan tugas');
    } finally {
      setIsLoading(false);
    }
  };

  // Direct move to "Dalam Perjalanan"
  const handleProcessDirectly = async (task: Task) => {
    setIsLoading(true);
    setLoadingText('MEMPROSES TUGAS...');
    const updated: Task = {
      ...task,
      Status: 'Dalam Perjalanan',
      WaktuUpdate: getJakartaTimeString(),
    };
    try {
      await api.apiSaveTask(updated);
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.ID === task.ID ? updated : t)),
      }));
      showToast('Tugas dipindahkan ke Diproses!');
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui status');
    } finally {
      setIsLoading(false);
    }
  };

  // Open Status modal
  const handleOpenStatusModal = (task: Task) => {
    setStatusModalTask(task);
    setModalStatusChoice(task.Status);
    setModalBiaya(task.Biaya > 0 ? String(task.Biaya) : '');
    setModalKetBiaya(task.KeteranganBiaya || '');
    setModalPenerima(task.Penerima || '');
    setModalCatatan(task.Catatan || '');
  };

  const handleSaveStatusModal = async () => {
    if (!statusModalTask) return;
    if ((modalStatusChoice === 'Selesai' || modalStatusChoice === 'Gagal') && !modalCatatan.trim()) {
      showToast('Catatan wajib diisi untuk status Selesai atau Batal!');
      return;
    }

    const updated: Task = {
      ...statusModalTask,
      Status: modalStatusChoice,
      Biaya: Number(modalBiaya) || 0,
      KeteranganBiaya: modalKetBiaya.trim(),
      Penerima: modalPenerima.trim(),
      Catatan: modalCatatan.trim(),
      WaktuUpdate: getJakartaTimeString(),
    };

    setIsLoading(true);
    setLoadingText('MEMPERBARUI STATUS...');
    try {
      await api.apiSaveTask(updated);
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.ID === updated.ID ? updated : t)),
      }));
      setStatusModalTask(null);
      showToast('Status tugas berhasil diperbarui!');
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui');
    } finally {
      setIsLoading(false);
    }
  };

  // Open Edit Task modal
  const handleSaveEditTask = async () => {
    if (!editModalTask) return;
    setIsLoading(true);
    setLoadingText('MENYIMPAN PERUBAHAN...');
    try {
      const updated: Task = {
        ...editModalTask,
        WaktuUpdate: getJakartaTimeString(),
      };
      await api.apiSaveTask(updated);
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.ID === updated.ID ? updated : t)),
      }));
      setEditModalTask(null);
      showToast('Tugas berhasil diubah!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm('Hapus tugas ini secara permanen dari database?')) return;
    setIsLoading(true);
    setLoadingText('MENGHAPUS TUGAS...');
    try {
      await api.apiDeleteTask(id);
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.ID !== id),
      }));
      setEditModalTask(null);
      showToast('Tugas telah dihapus');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus');
    } finally {
      setIsLoading(false);
    }
  };

  // Vendor management
  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorModalData || !vendorModalData.nama.trim() || !vendorModalData.alamat.trim()) {
      showToast('Nama dan Alamat vendor wajib diisi');
      return;
    }

    const id = vendorModalData.id || `VND-${getJakartaTimeString().replace(/[- :]/g, '')}-${Math.floor(Math.random() * 90 + 10)}`;
    const vendor: Vendor = {
      ID: id,
      Nama: vendorModalData.nama.trim(),
      NoHP: vendorModalData.noHp.trim(),
      Alamat: vendorModalData.alamat.trim(),
      LinkMaps: (vendorModalData.linkMaps || '').trim(),
    };

    setIsLoading(true);
    setLoadingText('MENYIMPAN VENDOR...');
    try {
      await api.apiSaveVendor(vendor);
      await refreshData(true);
      setVendorModalData(null);
      showToast('Vendor berhasil disimpan!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan vendor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!window.confirm('Hapus vendor ini?')) return;
    setIsLoading(true);
    try {
      await api.apiDeleteVendor(id);
      await refreshData(true);
      showToast('Vendor dihapus');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus');
    } finally {
      setIsLoading(false);
    }
  };

  // User / Karyawan settings
  const handleAddKaryawan = async () => {
    if (!newUserId.trim() || !newUserName.trim()) {
      showToast('ID dan Nama Karyawan wajib diisi!');
      return;
    }
    const k: Karyawan = {
      ID: newUserId.trim(),
      Nama: newUserName.trim(),
      Posisi: newUserRole,
    };
    setIsLoading(true);
    try {
      await api.apiSaveKaryawan(k);
      setData((prev) => ({
        ...prev,
        users: [...prev.users.filter((u) => u.ID !== k.ID), k],
      }));
      setNewUserId('');
      setNewUserName('');
      showToast('Karyawan berhasil ditambahkan!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambah karyawan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKaryawan = async (id: string) => {
    if (!window.confirm('Hapus karyawan ini? Data lokasi radar juga akan dibersihkan.')) return;
    setIsLoading(true);
    try {
      const targetUser = data.users.find((u) => u.ID === id);
      const targetName = targetUser ? targetUser.Nama.trim().toLowerCase() : '';
      await api.apiDeleteKaryawan(id);
      setData((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.ID !== id),
        sprinterLocations: (prev.sprinterLocations || []).filter(
          (l) =>
            l.karyawanId !== id &&
            l.id !== id &&
            (!targetName || (l.karyawanNama || '').trim().toLowerCase() !== targetName)
        ),
      }));
      showToast('Karyawan dan data lokasi radar berhasil dihapus');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearSprinterLocation = async (sprinterNama: string, karyawanId: string) => {
    if (!window.confirm(`Bersihkan riwayat lokasi radar untuk "${sprinterNama}"?`)) return;
    setIsLoading(true);
    try {
      await api.apiSaveSprinterLocation({
        id: karyawanId,
        karyawanId,
        karyawanNama: sprinterNama,
        latitude: 0,
        longitude: 0,
        waktuUpdate: new Date().toISOString(),
        isActive: false,
      });
      setData((prev) => ({
        ...prev,
        sprinterLocations: (prev.sprinterLocations || []).filter(
          (l) => l.karyawanNama !== sprinterNama && l.id !== karyawanId && l.karyawanId !== karyawanId
        ),
      }));
      showToast(`Lokasi radar ${sprinterNama} berhasil dibersihkan`);
    } catch (err: any) {
      showToast('Gagal membersihkan lokasi');
    } finally {
      setIsLoading(false);
    }
  };

  // Category settings
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const cat = newCategoryName.trim();
    setIsLoading(true);
    try {
      await api.apiSaveCategory(cat);
      setData((prev) => ({
        ...prev,
        categories: prev.categories.includes(cat) ? prev.categories : [...prev.categories, cat],
      }));
      setNewCategoryName('');
      showToast('Kategori berhasil ditambahkan!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambah kategori');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (!window.confirm(`Hapus kategori "${cat}"?`)) return;
    setIsLoading(true);
    try {
      await api.apiDeleteCategory(cat);
      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c !== cat),
      }));
      showToast('Kategori dihapus');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save recap when editing cash or employee
  const handleSaveRecap = async (cashVal?: number, empVal?: string) => {
    const c = cashVal !== undefined ? cashVal : Number(uangCashInput) || 0;
    const e = empVal !== undefined ? empVal : rekapKaryawan;
    if (!reportDate) return;

    const recap: Recap = {
      Tanggal: reportDate,
      Karyawan: e,
      UangCash: c,
    };

    try {
      await api.apiSaveRecap(recap);
      setData((prev) => {
        const filtered = (prev.recaps || []).filter((r) => r.Tanggal !== reportDate);
        return {
          ...prev,
          recaps: [...filtered, recap],
        };
      });
      showToast('Rekap kas tersimpan');
    } catch (err) {
      console.error('Save recap error:', err);
    }
  };

  // Report calculations
  const reportFilteredTasks = useMemo(() => {
    return data.tasks.filter((t) => {
      const matchEmp = reportKaryawan === 'ALL' || t.Karyawan === reportKaryawan;
      const matchDate = !reportDate || (t.WaktuUpdate && t.WaktuUpdate.startsWith(reportDate));
      return matchEmp && matchDate && t.Status === 'Selesai' && Number(t.Biaya) > 0;
    });
  }, [data.tasks, reportKaryawan, reportDate]);

  const reportTotalPengeluaran = useMemo(() => {
    return reportFilteredTasks.reduce((acc, curr) => acc + (Number(curr.Biaya) || 0), 0);
  }, [reportFilteredTasks]);

  const modalCashNumber = Number(uangCashInput) || 0;
  const sisaUang = modalCashNumber - reportTotalPengeluaran;

  const handlePrintPDF = () => {
    handleSaveRecap();
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="bg-slate-50 text-slate-800 dark:bg-[#0f172a] dark:text-slate-200 min-h-screen transition-colors duration-300 antialiased selection:bg-teal-300 relative">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-slate-900/90 text-white dark:bg-teal-600 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold backdrop-blur-md animate-fade-in border border-white/10">
          <i className="bi bi-info-circle-fill text-teal-400 dark:text-white"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* OVERLAY LOADING */}
      {isLoading && (
        <div
          onClick={() => setIsLoading(false)}
          className="fixed inset-0 bg-slate-900/80 z-[9999] flex flex-col justify-center items-center backdrop-blur-sm transition-all duration-300 cursor-pointer"
        >
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-500 mb-4 shadow-[0_0_20px_rgba(20,184,166,0.6)]"></div>
          <p className="text-white font-bold animate-pulse tracking-wide text-sm">{loadingText}</p>
          <p className="text-[10px] text-white/60 mt-5 font-medium tracking-widest bg-black/40 px-4 py-2 rounded-full border border-white/10">
            (Ketuk di mana saja untuk menutup)
          </p>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="w-full md:max-w-2xl lg:max-w-3xl mx-auto bg-slate-50 dark:bg-[#0f172a] min-h-screen relative pb-28 shadow-2xl overflow-x-hidden border-x border-slate-200 dark:border-slate-800 z-10">
        
        {/* HEADER */}
        <header className="bg-slate-900 text-white px-4 md:px-6 py-3.5 sticky top-0 z-30 border-b border-slate-800 shadow-sm backdrop-blur-md bg-slate-900/95">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-lg shrink-0 shadow-inner">
                <i className="bi bi-send-check-fill"></i>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base md:text-lg font-black tracking-tight text-white leading-none truncate">
                    SPRINTER MAHADA
                  </h1>
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                    Operasional
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-2 mt-1 truncate">
                  <span className="truncate">{getIndonesianDateHeader()}</span>
                  <span className="text-slate-600 hidden sm:inline">&bull;</span>
                  <span className="text-emerald-400 hidden sm:inline-flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Supabase Connected
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Tombol Install Aplikasi Handphone */}
              <button
                type="button"
                onClick={handleInstallClick}
                title={isAppInstalled ? 'Aplikasi Terpasang di HP' : 'Install Aplikasi di HP (PWA)'}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer active:scale-95 shadow-xs ${
                  isAppInstalled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-teal-500 hover:bg-teal-400 text-slate-900 border-teal-400 font-extrabold'
                }`}
              >
                <i className={`bi ${isAppInstalled ? 'bi-check-circle-fill' : 'bi-phone-vibrate'} text-sm`}></i>
                <span className="hidden sm:inline">{isAppInstalled ? 'Terpasang' : 'Install di HP'}</span>
                <span className="sm:hidden">{isAppInstalled ? '✓' : 'Install'}</span>
              </button>

              <button
                type="button"
                onClick={() => refreshData(true)}
                title="Sinkronisasi Data"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-700 text-slate-300 hover:text-white cursor-pointer active:scale-95"
              >
                <i className="bi bi-arrow-clockwise text-sm"></i>
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-700 text-slate-300 hover:text-white cursor-pointer active:scale-95"
              >
                <i className={`bi ${darkMode ? 'bi-sun-fill text-amber-300' : 'bi-moon-stars-fill'} text-sm`}></i>
              </button>
              {/* Tombol Pengaturan (dipindah dari bottom nav ke header) */}
              <button
                type="button"
                onClick={() => setActiveTab('setting')}
                title="Pengaturan"
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition border cursor-pointer active:scale-95 ${
                  activeTab === 'setting'
                    ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <i className="bi bi-gear-fill text-sm"></i>
              </button>
            </div>
          </div>
        </header>

        {/* VIEW 1: HOME (BERANDA TUGAS) */}
        {activeTab === 'home' && (
          <div className="animate-fade-in">
            {/* KPI METRICS BOARD */}
            <div className="p-4 md:p-5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80">
              {/* 4 Clean Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mb-3.5">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-[11px] font-semibold tracking-wide uppercase">Tugas Hari Ini</span>
                    <i className="bi bi-card-checklist text-sm text-teal-600 dark:text-teal-400"></i>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {stats.total}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Semua status</div>
                </div>

                <div className="bg-amber-50/70 dark:bg-amber-950/20 p-3.5 rounded-2xl border border-amber-200/60 dark:border-amber-800/40">
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 mb-1">
                    <span className="text-[11px] font-semibold tracking-wide uppercase">Diproses</span>
                    <i className="bi bi-clock-history text-sm"></i>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-amber-800 dark:text-amber-300">
                    {stats.proses}
                  </div>
                  <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">Sedang jalan</div>
                </div>

                <div className="bg-emerald-50/70 dark:bg-emerald-950/20 p-3.5 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1">
                    <span className="text-[11px] font-semibold tracking-wide uppercase">Selesai</span>
                    <i className="bi bi-check-circle-fill text-sm"></i>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                    {stats.selesai}
                  </div>
                  <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                    {stats.progress}% selesai
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="text-[11px] font-semibold tracking-wide uppercase">Total Biaya</span>
                    <i className="bi bi-wallet2 text-sm text-teal-600 dark:text-teal-400"></i>
                  </div>
                  <div className="text-lg md:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                    {formatRupiah(stats.biaya)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Kas terpakai</div>
                </div>
              </div>

              {/* Progress Bar & Status Footer */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="flex-1 w-full">
                  <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
                    <span className="text-slate-600 dark:text-slate-300">Tingkat Penyelesaian</span>
                    <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{stats.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-600 dark:bg-teal-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${stats.progress}%` }}
                    ></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0 pt-1 sm:pt-0 sm:pl-3 sm:border-l sm:border-slate-200 sm:dark:border-slate-700">
                  <i className="bi bi-geo-alt text-teal-600 dark:text-teal-400"></i>
                  <span className="truncate max-w-[220px]" title={stats.lastLokasi}>
                    {stats.lastLokasi}
                  </span>
                </div>
              </div>
            </div>



            {/* SEARCH & SEGMENTED FILTER BAR */}
            <div className="px-4 py-3 sticky top-[69px] z-20 bg-slate-50/95 dark:bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="relative mb-2.5">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <i className="bi bi-search text-xs"></i>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kegiatan, penerima, rute, invoice..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40 text-xs md:text-sm font-medium shadow-2xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <i className="bi bi-x-circle-fill text-xs"></i>
                  </button>
                )}
              </div>

              {/* Segmented Control: Cuma Pending, Diproses, Selesai, Batal */}
              <div className="flex bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-xl overflow-x-auto scrollbar-hide gap-1">
                {(['Pending', 'Dalam Perjalanan', 'Selesai', 'Gagal'] as const).map((st) => {
                  const label = st === 'Dalam Perjalanan' ? 'Diproses' : st === 'Gagal' ? 'Batal' : st;
                  const isActive = statusFilter === st;
                  const count = taskCounts[st] || 0;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                        isActive
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>{label}</span>
                      <span
                        className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-md ${
                          isActive
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold'
                            : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TASK LIST */}
            <div className="p-4 space-y-3.5">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3 text-slate-400">
                    <i className="bi bi-inbox text-2xl"></i>
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Tidak ada tugas ditemukan</p>
                  <p className="text-xs mt-1 text-slate-400 max-w-xs">
                    {searchQuery ? `Tidak ada hasil untuk pencarian "${searchQuery}".` : 'Belum ada tugas dalam kategori status ini.'}
                  </p>
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const resDari = resolveLocationMapsLink(t.Dari, data.vendors);
                  const resTujuan = resolveLocationMapsLink(t.Tujuan, data.vendors);
                  const resJudul = resolveLocationMapsLink(t.JudulTugas, data.vendors);

                  return (
                    <div
                      key={t.ID}
                      className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      {/* Top Header of Card */}
                      <div className="flex justify-between items-start gap-2 mb-2.5">
                        <div className="flex flex-wrap items-center gap-1.5 md:gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                            <i className="bi bi-person-circle text-teal-600 dark:text-teal-400"></i>
                            {t.Karyawan || '-'}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {formatTaskTime(t.WaktuUpdate)}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">&bull;</span>
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            {t.Kategori}
                          </span>
                          {t.Prioritas === 'Urgent' && (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <i className="bi bi-fire text-rose-600"></i> Urgent
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                            t.Status === 'Dalam Perjalanan'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                              : t.Status === 'Selesai'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                              : t.Status === 'Gagal'
                              ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {t.Status === 'Dalam Perjalanan' ? 'Diproses' : t.Status === 'Gagal' ? 'Batal' : t.Status}
                        </span>
                      </div>

                      {/* Title & Optional Invoice */}
                      <div className="mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm md:text-base leading-snug">
                            {t.JudulTugas}
                          </h3>
                          {resJudul.vendorMatch && !resDari.vendorMatch && !resTujuan.vendorMatch && (
                            <a
                              href={resJudul.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition hover:opacity-90 ${
                                resJudul.vendorMatch.LinkMaps
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                              title={resJudul.vendorMatch.LinkMaps ? `Buka Google Maps ${resJudul.vendorMatch.Nama}` : 'Cari di Google Maps'}
                            >
                              <i className="bi bi-geo-alt-fill text-rose-500"></i>
                              <span>Vendor: {resJudul.vendorMatch.Nama}</span>
                              <i className="bi bi-box-arrow-up-right text-[9px] opacity-70"></i>
                            </a>
                          )}
                        </div>
                        {t.Invoice && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <i className="bi bi-receipt font-normal"></i>
                            <span className="font-mono text-[11px] font-medium">{t.Invoice}</span>
                          </div>
                        )}
                      </div>

                      {/* Itinerary Route (Dari -> Tujuan) */}
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 text-xs space-y-2 mb-3">
                        {t.Dari && (
                          <div className="flex items-start gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-teal-500 bg-white dark:bg-slate-900 mt-1 shrink-0"></div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                                Jemput / Dari
                              </span>
                              <div className="text-slate-800 dark:text-slate-200 font-medium">
                                {t.Dari}
                              </div>
                              {resDari.vendorMatch && (
                                <a
                                  href={resDari.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 hover:bg-teal-50 transition cursor-pointer"
                                  title={`Buka Google Maps ${resDari.vendorMatch.Nama}`}
                                >
                                  <i className="bi bi-geo-alt-fill text-rose-500"></i>
                                  <span>{resDari.vendorMatch.Nama}</span>
                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 underline font-normal">(Buka Maps)</span>
                                  <i className="bi bi-box-arrow-up-right text-[9px] opacity-70"></i>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-2.5">
                          <i className="bi bi-geo-alt-fill text-rose-500 mt-0.5 text-sm shrink-0"></i>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                              Tujuan Pengiriman
                            </span>
                            <div className="text-slate-900 dark:text-slate-100 font-medium">
                              {t.Tujuan}
                            </div>
                            {resTujuan.vendorMatch && (
                              <a
                                href={resTujuan.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 hover:bg-teal-50 transition cursor-pointer"
                                title={`Buka Google Maps ${resTujuan.vendorMatch.Nama}`}
                              >
                                <i className="bi bi-geo-alt-fill text-rose-500"></i>
                                <span>{resTujuan.vendorMatch.Nama}</span>
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 underline font-normal">(Buka Maps)</span>
                                <i className="bi bi-box-arrow-up-right text-[9px] opacity-70"></i>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* PIC & Cost Details */}
                      {(t.PIC || t.Biaya > 0 || t.Penerima) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80 mb-3 text-slate-600 dark:text-slate-400">
                          {t.PIC && (
                            <div className="flex items-center gap-1.5">
                              <i className="bi bi-person text-slate-400"></i>
                              <span>PIC: <strong className="text-slate-800 dark:text-slate-200">{t.PIC}</strong></span>
                              {t.NoHP && (
                                <a
                                  href={`https://wa.me/${t.NoHP.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 font-semibold ml-1"
                                >
                                  <i className="bi bi-whatsapp"></i> {t.NoHP}
                                </a>
                              )}
                            </div>
                          )}

                          {t.Biaya > 0 && (
                            <div className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                              Biaya: {formatRupiah(t.Biaya)}
                              {t.KeteranganBiaya && <span className="font-sans font-normal text-slate-400 ml-1">({t.KeteranganBiaya})</span>}
                            </div>
                          )}

                          {t.Penerima && (
                            <div className="text-slate-500">
                              Penerima: <strong className="text-slate-700 dark:text-slate-300">{t.Penerima}</strong>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sprinter Live GPS Badge if assigned sprinter is tracking */}
                      {(() => {
                        const assignedSprinterName = (t.Karyawan || '').trim();
                        const sprinterGps = (data.sprinterLocations || []).find((l) => {
                          const lName = (l.karyawanNama || '').trim().toLowerCase();
                          const aName = assignedSprinterName.toLowerCase();
                          return lName && (aName.includes(lName) || lName.includes(aName));
                        });

                        if (!sprinterGps || !sprinterGps.latitude || !sprinterGps.longitude) {
                          return null;
                        }

                        const isSprinterLive = sprinterGps.isActive !== false;

                        return (
                          <div
                            className={`mb-3 p-2.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs transition ${
                              isSprinterLive
                                ? 'bg-teal-50/80 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="relative flex h-2.5 w-2.5 shrink-0">
                                {isSprinterLive && (
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                )}
                                <span
                                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                    isSprinterLive ? 'bg-teal-500' : 'bg-slate-400'
                                  }`}
                                ></span>
                              </span>
                              <div className="leading-tight truncate">
                                <div className="font-bold flex items-center gap-1.5 truncate">
                                  <span>Posisi HP ({sprinterGps.karyawanNama}):</span>
                                  <span className="text-[11px] font-normal text-teal-700 dark:text-teal-300">
                                    {isSprinterLive ? 'Live Online' : 'Standby'} &bull; {formatTimeAgo(sprinterGps.waktuUpdate)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  {sprinterGps.latitude.toFixed(5)}, {sprinterGps.longitude.toFixed(5)}
                                  {sprinterGps.accuracy ? ` (akurasi ±${Math.round(sprinterGps.accuracy)}m)` : ''}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSprinterOnMap(sprinterGps.karyawanNama);
                                  setShowLiveRadarMap(true);
                                  window.scrollTo({ top: 150, behavior: 'smooth' });
                                }}
                                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 font-semibold text-[11px] hover:bg-teal-50 transition cursor-pointer flex items-center gap-1"
                              >
                                <i className="bi bi-broadcast"></i> Radar
                              </button>
                              <a
                                href={`https://www.google.com/maps?q=${sprinterGps.latitude},${sprinterGps.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] transition flex items-center gap-1"
                              >
                                <i className="bi bi-geo-alt-fill text-rose-300"></i> Maps
                              </a>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        {t.Status === 'Pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleProcessDirectly(t)}
                              className="flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-xs md:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-xs active:scale-[0.98]"
                            >
                              <i className="bi bi-play-circle-fill"></i> Mulai Diproses
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(t)}
                              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-xs border border-slate-200 dark:border-slate-700 cursor-pointer transition flex items-center gap-1.5"
                            >
                              <i className="bi bi-check2-circle"></i> Update
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditModalTask(t)}
                              title="Edit Tugas"
                              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs border border-slate-200 dark:border-slate-700 cursor-pointer transition"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                          </>
                        ) : t.Status === 'Dalam Perjalanan' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(t)}
                              className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white rounded-xl font-semibold text-xs md:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-xs active:scale-[0.98]"
                            >
                              <i className="bi bi-check2-circle"></i> Selesaikan / Update Biaya
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditModalTask(t)}
                              title="Edit Detail"
                              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs border border-slate-200 dark:border-slate-700 cursor-pointer transition"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(t)}
                              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-xs border border-slate-200 dark:border-slate-700 cursor-pointer transition flex items-center justify-center gap-1.5"
                            >
                              <i className="bi bi-arrow-repeat"></i> Ubah Status / Catatan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditModalTask(t)}
                              title="Edit Detail"
                              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs border border-slate-200 dark:border-slate-700 cursor-pointer transition"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: RADAR POSISI LIVE SPRINTER (Halaman Khusus) */}
        {activeTab === 'radar' && (
          <div className="animate-fade-in">
            {(() => {
              const existingUserIds = new Set(data.users.map((u) => u.ID));
              const existingUserNames = new Set(data.users.map((u) => (u.Nama || '').trim().toLowerCase()));

              // Filter out any locations of deleted karyawan
              const validSprinterLocations = (data.sprinterLocations || []).filter(
                (l) =>
                  existingUserIds.has(l.karyawanId) ||
                  existingUserIds.has(l.id) ||
                  existingUserNames.has((l.karyawanNama || '').trim().toLowerCase())
              );

              const activeSprinters = validSprinterLocations.filter(
                (l) => l.isActive && l.latitude && l.longitude
              );
              return (
                <>
                  {/* Header */}
                  <div className="px-4 md:px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 sticky top-[69px] z-20 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-lg shadow-inner">
                          <i className="bi bi-broadcast-pin"></i>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white leading-none">
                              Radar Sprinter
                            </h2>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              {activeSprinters.length} Online
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">Pantauan posisi GPS live dari handphone sprinter</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshData(true)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer active:scale-95"
                        title="Refresh lokasi GPS"
                      >
                        <i className="bi bi-arrow-clockwise text-sm"></i>
                      </button>
                    </div>
                  </div>

                  {/* Sprinter Chips Horizontal */}
                  <div className="px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                        Sprinter:
                      </span>
                      {activeSprinters.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">
                          Belum ada GPS aktif. Aktifkan di Pengaturan <i className="bi bi-gear"></i>
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setSelectedSprinterOnMap(undefined)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              !selectedSprinterOnMap
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                            }`}
                          >
                            Semua
                          </button>
                          {activeSprinters.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                setSelectedSprinterOnMap(
                                  selectedSprinterOnMap === s.karyawanNama ? undefined : s.karyawanNama
                                )
                              }
                              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                                selectedSprinterOnMap === s.karyawanNama
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              <span>{s.karyawanNama}</span>
                              <span className="text-[10px] opacity-70">
                                {formatTimeAgo(s.waktuUpdate)}
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Full-size Map */}
                  <div className="p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm overflow-hidden">
                      <SprinterLiveMap
                        locations={validSprinterLocations}
                        tasks={data.tasks}
                        selectedSprinterId={selectedSprinterOnMap}
                        onSelectSprinter={(name) => setSelectedSprinterOnMap(name)}
                        className="h-[60vh] w-full"
                      />
                    </div>
                  </div>

                  {/* Active Sprinter Details Cards */}
                  {activeSprinters.length > 0 && (
                    <div className="px-4 pb-4 space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Detail Lokasi Sprinter Aktif
                      </h3>
                      {activeSprinters.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSprinterOnMap(s.karyawanNama)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            selectedSprinterOnMap === s.karyawanNama
                              ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700 shadow-sm'
                              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 hover:border-teal-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                                <i className="bi bi-person-walking"></i>
                              </div>
                              <div>
                                <div className="font-bold text-sm text-slate-800 dark:text-white">{s.karyawanNama}</div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <i className="bi bi-clock text-[10px]"></i>
                                  <span>Update {formatTimeAgo(s.waktuUpdate)}</span>
                                  {s.accuracy && (
                                    <>
                                      <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                                      <span>±{Math.round(s.accuracy)}m</span>
                                    </>
                                  )}
                                  {s.speed != null && s.speed > 0 && (
                                    <>
                                      <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                                      <span>{Math.round(s.speed * 3.6)} km/h</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              <a
                                href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 transition flex items-center gap-1"
                              >
                                <i className="bi bi-geo-alt-fill"></i> Maps
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Broadcast Notice */}
                  {!isGpsBroadcasting && (
                    <div className="px-4 pb-4">
                      <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/50 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-1">
                            <i className="bi bi-broadcast text-teal-600"></i> Anda sprinter?
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Aktifkan GPS HP untuk muncul di radar ini
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('setting')}
                          className="px-3.5 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-95"
                        >
                          <i className="bi bi-gear"></i> Pengaturan GPS
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* VIEW 3: DATABASE VENDOR */}
        {activeTab === 'vendor' && (
          <div className="animate-fade-in">
            <div className="px-4 md:px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 sticky top-[69px] z-20 flex justify-between items-center shadow-2xs">
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="bi bi-shop text-teal-600 dark:text-teal-400"></i> Database Vendor
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola daftar toko, mitra, dan vendor langganan</p>
              </div>
              <button
                type="button"
                onClick={() => setVendorModalData({ nama: '', noHp: '', alamat: '', linkMaps: '' })}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5 transition active:scale-95"
              >
                <i className="bi bi-plus-lg"></i> Tambah Vendor
              </button>
            </div>

            <div className="p-4 md:p-5">
              <div className="relative mb-3.5">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <i className="bi bi-search text-xs"></i>
                </span>
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Cari nama atau alamat vendor..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-800 dark:text-slate-200 shadow-2xs"
                />
              </div>

              {data.vendors.filter((v) =>
                (v.Nama + ' ' + v.Alamat).toLowerCase().includes(vendorSearch.toLowerCase())
              ).length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3 text-slate-400">
                    <i className="bi bi-shop text-2xl"></i>
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Belum ada vendor</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">Tambahkan vendor untuk auto-fill tugas dengan mudah.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.vendors
                    .filter((v) => (v.Nama + ' ' + v.Alamat).toLowerCase().includes(vendorSearch.toLowerCase()))
                    .map((v) => (
                      <div
                        key={v.ID}
                        className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-2xs border border-slate-200/80 dark:border-slate-800/80 flex justify-between items-start gap-3 transition hover:border-slate-300 dark:hover:border-slate-700"
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm md:text-base leading-snug">{v.Nama}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{v.Alamat}</p>
                          <div className="flex flex-wrap gap-2 mt-2 items-center">
                            {v.NoHP && (
                              <a
                                href={`https://wa.me/${v.NoHP.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
                              >
                                <i className="bi bi-whatsapp"></i> {v.NoHP}
                              </a>
                            )}
                            {v.LinkMaps ? (
                              <a
                                href={v.LinkMaps}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-teal-700 dark:text-teal-300 font-semibold inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 transition"
                              >
                                <i className="bi bi-geo-alt-fill text-rose-500"></i> Buka Maps
                                <i className="bi bi-box-arrow-up-right text-[9px] opacity-70"></i>
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Belum ada link maps
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setVendorModalData({
                                id: v.ID,
                                nama: v.Nama,
                                noHp: v.NoHP,
                                alamat: v.Alamat,
                                linkMaps: v.LinkMaps || '',
                              })
                            }
                            title="Edit Vendor"
                            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition border border-slate-200 dark:border-slate-700"
                          >
                            <i className="bi bi-pencil text-xs"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVendor(v.ID)}
                            title="Hapus Vendor"
                            className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 flex items-center justify-center cursor-pointer transition border border-rose-200 dark:border-rose-900/50"
                          >
                            <i className="bi bi-trash text-xs"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: TAMBAH TUGAS */}
        {activeTab === 'add' && (
          <div className="animate-fade-in p-4 md:p-6 max-w-2xl mx-auto">
            {/* Header Form */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Formulir Penugasan
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Buat Tugas Baru
              </h2>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Input penugasan kurir sprinter, tentukan rute pengantaran, dan kontak lapangan.
              </p>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              {/* SECTION 1: INFORMASI UTAMA & PETUGAS */}
              <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs space-y-3.5">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="w-5 h-5 rounded-md bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <h3 className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    Informasi Tugas &amp; Petugas
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Sprinter / Petugas *
                    </label>
                    <select
                      required
                      value={addKaryawan}
                      onChange={(e) => setAddKaryawan(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer"
                    >
                      {data.users.map((u) => (
                        <option key={u.ID} value={`${u.Nama} (${u.Posisi})`}>
                          {u.Nama} ({u.Posisi})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Kategori Pekerjaan
                    </label>
                    <select
                      value={addKategori}
                      onChange={(e) => setAddKategori(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer"
                    >
                      {data.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Kegiatan / Judul Tugas *
                  </label>
                  <input
                    type="text"
                    required
                    value={addJudul}
                    onChange={(e) => setAddJudul(e.target.value)}
                    placeholder="Contoh: Ambil Sampel Kain / Kirim Invoice Mahada"
                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      No. Invoice / Resi / Dokumen
                    </label>
                    <input
                      type="text"
                      value={addInvoice}
                      onChange={(e) => setAddInvoice(e.target.value)}
                      placeholder="Cth: INV-2026/01 atau No. Resi"
                      className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 font-mono text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tingkat Prioritas *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAddPrioritas('Standar')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          addPrioritas === 'Standar'
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <i className="bi bi-clock"></i> Standar
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddPrioritas('Urgent')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          addPrioritas === 'Urgent'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <i className="bi bi-fire text-rose-500"></i> Urgent
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: RUTE LOKASI (DARI & TUJUAN) */}
              <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="w-5 h-5 rounded-md bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      Rute Pengantaran (Asal &amp; Tujuan)
                    </h3>
                  </div>
                </div>

                {/* LOKASI ASAL (DARI) */}
                <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-teal-500 bg-white dark:bg-slate-900"></span>
                      Lokasi Asal (Jemput / Dari)
                    </label>

                    {/* VENDOR SELECTION: CUKUP NAMA SAJA TANPA ALAMAT */}
                    <div className="w-full sm:w-60">
                      <select
                        value={selectedVendorDariId}
                        onChange={handleVendorDariChange}
                        className="w-full text-xs font-medium py-1.5 px-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer shadow-2xs truncate"
                      >
                        <option value="">-- Pilih Vendor (Nama Saja) --</option>
                        {data.vendors.map((v) => (
                          <option key={v.ID} value={v.ID}>
                            {v.Nama}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={addDari}
                    onChange={(e) => setAddDari(e.target.value)}
                    placeholder="Alamat asal atau lokasi penjemputan barang..."
                    className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                  />
                </div>

                {/* LOKASI TUJUAN (KE) */}
                <div className="p-3.5 rounded-xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                      <i className="bi bi-geo-alt-fill text-rose-500"></i>
                      Lokasi Tujuan Pengiriman *
                    </label>

                    {/* VENDOR SELECTION: CUKUP NAMA SAJA TANPA ALAMAT */}
                    <div className="w-full sm:w-60">
                      <select
                        value={selectedVendorTujuanId}
                        onChange={handleVendorTujuanChange}
                        className="w-full text-xs font-medium py-1.5 px-2.5 border border-teal-200 dark:border-teal-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer shadow-2xs truncate"
                      >
                        <option value="">-- Pilih Vendor (Nama Saja) --</option>
                        {data.vendors.map((v) => (
                          <option key={v.ID} value={v.ID}>
                            {v.Nama}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <textarea
                    required
                    rows={2}
                    value={addTujuan}
                    onChange={(e) => setAddTujuan(e.target.value)}
                    placeholder="Alamat lengkap tujuan pengiriman atau nama penerima..."
                    className="w-full p-2.5 border border-teal-200/80 dark:border-teal-800/80 rounded-xl bg-white dark:bg-slate-900 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                  ></textarea>
                </div>
              </div>

              {/* SECTION 3: KONTAK PIC LAPANGAN */}
              <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs space-y-3.5">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="w-5 h-5 rounded-md bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h3 className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    Kontak &amp; PIC Lapangan
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nama PIC / Penanggung Jawab
                    </label>
                    <input
                      type="text"
                      value={addPIC}
                      onChange={(e) => setAddPIC(e.target.value)}
                      placeholder="Nama PIC (otomatis jika vendor dipilih)"
                      className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      No. WhatsApp / Handphone
                    </label>
                    <input
                      type="tel"
                      value={addHP}
                      onChange={(e) => setAddHP(e.target.value)}
                      placeholder="08123456789"
                      className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 font-medium text-xs md:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm md:text-base cursor-pointer transition active:scale-[0.99]"
                >
                  <i className="bi bi-send-check-fill"></i> Simpan &amp; Jadwalkan Tugas
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 4: LAPORAN & REKAP KAS */}
        {activeTab === 'report' && (
          <div className="animate-fade-in p-5">
            <h2 className="text-2xl font-black mb-6 text-slate-800 dark:text-white flex items-center gap-2">
              <i className="bi bi-pie-chart-fill text-teal-500"></i> Laporan & Rekap Kas
            </h2>

            {/* FILTER KARYAWAN & TANGGAL */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-5 flex gap-3 items-end hide-on-print">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Karyawan</label>
                <select
                  value={reportKaryawan}
                  onChange={(e) => setReportKaryawan(e.target.value)}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <option value="ALL">Semua Karyawan</option>
                  {data.users.map((u) => (
                    <option key={u.ID} value={`${u.Nama} (${u.Posisi})`}>
                      {u.Nama} ({u.Posisi})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Tanggal</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setReportKaryawan('ALL');
                  setReportDate(getTodayDateString());
                }}
                title="Reset Filter"
                className="h-[46px] px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl cursor-pointer hover:bg-slate-200 transition"
              >
                <i className="bi bi-arrow-clockwise"></i>
              </button>
            </div>

            {/* ARUS KAS CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mb-6">
              <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center hide-on-print">
                <span className="font-bold text-slate-700 dark:text-slate-300">Arus Kas Operasional</span>
                <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center">
                  <i className="bi bi-wallet2"></i>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4 hide-on-print mb-2">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-slate-500 dark:text-slate-400 uppercase">
                      Yg Merekap
                    </label>
                    <select
                      value={rekapKaryawan}
                      onChange={(e) => {
                        setRekapKaryawan(e.target.value);
                        handleSaveRecap(undefined, e.target.value);
                      }}
                      className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 text-sm cursor-pointer"
                    >
                      <option value="">-- Pilih Karyawan --</option>
                      {data.users.map((u) => (
                        <option key={u.ID} value={`${u.Nama} (${u.Posisi})`}>
                          {u.Nama} ({u.Posisi})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-slate-500 dark:text-slate-400 uppercase">
                      Cash Hari Ini (Rp)
                    </label>
                    <input
                      type="number"
                      value={uangCashInput}
                      onChange={(e) => setUangCashInput(e.target.value)}
                      onBlur={() => handleSaveRecap()}
                      placeholder="0"
                      className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono font-black text-teal-700 dark:text-teal-400 text-base"
                    />
                  </div>
                </div>

                {/* Print Title Header */}
                <div className="print-only mb-4 hidden">
                  <h2 className="text-xl font-black mb-1">SPRINTER MAHADA - LAPORAN KAS OPERASIONAL</h2>
                  <p className="text-xs font-bold text-slate-600">
                    Tanggal: {reportDate} | PIC Rekap: {rekapKaryawan || '-'}
                  </p>
                </div>

                <div className="flex justify-between items-center border-b border-dashed border-slate-200 dark:border-slate-800 pb-3 pt-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">Modal Awal / Cash</span>
                  <span className="font-black text-slate-700 dark:text-slate-200 text-lg">
                    {formatRupiah(modalCashNumber)}
                  </span>
                </div>

                <div className="flex justify-between items-center border-b border-dashed border-slate-200 dark:border-slate-800 pb-3 pt-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">Total Pengeluaran</span>
                  <span className="font-black text-rose-500 text-lg">
                    {formatRupiah(reportTotalPengeluaran)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 pb-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mt-2 border border-amber-100 dark:border-amber-900/30">
                  <span className="text-amber-800 dark:text-amber-400 font-bold text-sm">Sisa Uang (Kembalian)</span>
                  <span className="font-black text-2xl text-amber-600 dark:text-amber-400">
                    {formatRupiah(sisaUang)}
                  </span>
                </div>
              </div>
            </div>

            {/* RINCIAN TABEL BIAYA */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mb-6">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  Rincian Kegiatan (Biaya &gt; 0)
                </span>
                <span className="text-xs font-bold px-2.5 py-1 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded-full">
                  {reportFilteredTasks.length} Transaksi
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100/60 dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700">No. Inv</th>
                      <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700">Kegiatan</th>
                      <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700">Kategori</th>
                      <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 text-right">Biaya (Rp)</th>
                      <th className="p-3 font-bold border-b border-slate-200 dark:border-slate-700 hide-on-print w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                    {reportFilteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-xs text-slate-400">
                          Tidak ada transaksi biaya pada tanggal ini.
                        </td>
                      </tr>
                    ) : (
                      reportFilteredTasks.map((t) => (
                        <tr key={t.ID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {t.Invoice || '-'}
                          </td>
                          <td className="p-3 text-slate-800 dark:text-slate-200 font-medium">
                            {t.JudulTugas}
                            {t.KeteranganBiaya && (
                              <span className="block text-xs text-slate-400">{t.KeteranganBiaya}</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                              {t.Kategori}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {formatRupiah(t.Biaya)}
                          </td>
                          <td className="p-3 hide-on-print w-10 text-center">
                            <button
                              type="button"
                              onClick={() => setEditModalTask(t)}
                              className="bg-amber-100 dark:bg-amber-900/30 w-7 h-7 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-200 transition cursor-pointer flex items-center justify-center"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 hide-on-print">
              <button
                type="button"
                onClick={handlePrintPDF}
                className="w-full bg-slate-800 dark:bg-teal-600 text-white font-bold py-4 rounded-2xl shadow-md flex justify-center items-center gap-2 cursor-pointer hover:bg-slate-700 dark:hover:bg-teal-500 transition"
              >
                <i className="bi bi-file-earmark-pdf-fill text-lg"></i> Unduh / Cetak Laporan PDF (A5)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Muat ulang data dari server?')) {
                    refreshData(false);
                  }
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-2xl flex justify-center items-center gap-2 cursor-pointer hover:bg-slate-50 transition"
              >
                <i className="bi bi-arrow-clockwise"></i> Sinkronkan Ulang Data
              </button>
            </div>
          </div>
        )}

        {/* VIEW 5: PENGATURAN */}
        {activeTab === 'setting' && (
          <div className="animate-fade-in p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                <i className="bi bi-gear-fill text-teal-500"></i> Pengaturan
              </h2>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Pilih tab pengaturan di bawah
              </span>
            </div>

            {/* TAB-TAB KECIL PENGATURAN DI ATAS */}
            <div className="flex bg-slate-200/80 dark:bg-slate-800/80 p-1 rounded-2xl gap-1 mb-5 overflow-x-auto scrollbar-hide shadow-xs">
              <button
                type="button"
                onClick={() => setSettingTab('karyawan')}
                className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settingTab === 'karyawan'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <i className="bi bi-people-fill text-sm"></i>
                <span>Kelola Karyawan</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingTab('gps')}
                className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settingTab === 'gps'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <i className="bi bi-geo-alt-fill text-sm"></i>
                <span>Pelacak GPS</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingTab('kategori')}
                className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settingTab === 'kategori'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <i className="bi bi-tags-fill text-sm"></i>
                <span>Kategori</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingTab('informasi')}
                className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settingTab === 'informasi'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <i className="bi bi-info-circle-fill text-sm"></i>
                <span>Informasi</span>
              </button>
            </div>

            {/* TAB 1: KELOLA KARYAWAN */}
            {settingTab === 'karyawan' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-6 animate-fade-in">
                <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                  <i className="bi bi-people-fill text-teal-500"></i> Kelola Karyawan
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 mb-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input
                      type="text"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl bg-white dark:bg-slate-800 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200"
                      placeholder="ID (Cth: EMP-04)"
                    />
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl bg-white dark:bg-slate-800 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200"
                      placeholder="Nama Lengkap"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="flex-1 p-2.5 border border-slate-200 rounded-xl bg-white dark:bg-slate-800 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    >
                      <option value="Sprinter">Sprinter</option>
                      <option value="Produksi">Produksi</option>
                      <option value="Admin">Admin</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddKaryawan}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-5 rounded-xl font-bold text-sm cursor-pointer transition shadow-xs"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl max-h-72 overflow-y-auto">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {data.users.map((u) => (
                        <tr key={u.ID}>
                          <td className="p-3 text-slate-800 dark:text-slate-200">
                            <b>{u.Nama}</b>
                            <br />
                            <span className="text-xs text-slate-500">
                              {u.ID} &bull; {u.Posisi}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteKaryawan(u.ID)}
                              className="text-rose-500 hover:text-rose-700 cursor-pointer p-1"
                              title="Hapus Karyawan"
                            >
                              <i className="bi bi-trash-fill"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: PELACAK GPS HANDPHONE SPRINTER */}
            {settingTab === 'gps' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-6 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <i className="bi bi-geo-alt-fill text-teal-500"></i> Pelacak GPS Handphone Sprinter
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                      isGpsBroadcasting
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isGpsBroadcasting ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                      }`}
                    ></span>
                    {isGpsBroadcasting ? 'GPS Aktif (Broadcasting)' : 'GPS Nonaktif'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Fitur ini membaca GPS langsung dari browser handphone sprinter dan menyinkronkannya ke cloud database. 
                  Tidak memerlukan akun email pihak ketiga atau alat tracker berbayar.
                </p>

                {/* Identity & Switch */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 mb-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Nama Sprinter (Pengguna HP Ini)
                    </label>
                    <select
                      value={mySprinterIdentity}
                      disabled={isGpsBroadcasting}
                      onChange={(e) => {
                        setMySprinterIdentity(e.target.value);
                        localStorage.setItem('sprinter_my_name', e.target.value);
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 disabled:opacity-60"
                    >
                      <option value="">-- Pilih Nama Sprinter Anda --</option>
                      {data.users.map((u) => (
                        <option key={u.ID} value={u.Nama}>
                          {u.Nama} ({u.Posisi})
                        </option>
                      ))}
                    </select>
                  </div>

                  {gpsError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                      <i className="bi bi-exclamation-triangle-fill text-rose-500 mt-0.5"></i>
                      <div>{gpsError}</div>
                    </div>
                  )}

                  {/* GPS Info Badge if active */}
                  {currentGpsCoords && (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-teal-200 dark:border-teal-800/60 text-xs space-y-1">
                      <div className="flex items-center justify-between text-teal-700 dark:text-teal-300 font-bold">
                        <span className="flex items-center gap-1.5">
                          <i className="bi bi-pin-map-fill"></i> Koordinat HP Anda:
                        </span>
                        <span className="font-mono">
                          {currentGpsCoords.latitude.toFixed(5)}, {currentGpsCoords.longitude.toFixed(5)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>
                          Akurasi: &plusmn;{currentGpsCoords.accuracy ? Math.round(currentGpsCoords.accuracy) : 0} meter
                        </span>
                        <span>Update: {formatTimeAgo(currentGpsCoords.timestamp)}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleGps}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm cursor-pointer transition flex items-center justify-center gap-2 shadow-sm ${
                      isGpsBroadcasting
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-teal-600 hover:bg-teal-700 text-white'
                    }`}
                  >
                    <i className={`bi ${isGpsBroadcasting ? 'bi-stop-circle-fill' : 'bi-broadcast-pin'} text-base`}></i>
                    <span>{isGpsBroadcasting ? 'Matikan Siaran GPS HP' : 'Mulai Siaran Live GPS HP'}</span>
                  </button>

                  {/* Background Mode Notice when broadcasting */}
                  {isGpsBroadcasting && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span>Mode Latar Belakang (Keep-Alive) Aktif</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                        Layar dicegah mati otomatis (WakeLock) dan sistem audio hening diaktifkan agar browser tidak ditidurkan oleh Android saat Anda membuka WhatsApp atau navigasi.
                      </p>
                    </div>
                  )}

                  {/* Android Battery Optimization Tip */}
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                      <i className="bi bi-shield-check"></i>
                      <span>Tips Agar GPS Tidak Mati Saat Layar Mati:</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      Pada HP Android, buka <strong>Pengaturan HP &rarr; Aplikasi &rarr; Chrome / Sprinter &rarr; Baterai</strong>, lalu pilih <strong>"Tidak Dibatasi" (Unrestricted)</strong> agar Android tidak mematikan pelacak GPS secara otomatis.
                    </p>
                  </div>
                </div>

                {/* Status Semua Sprinter */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center justify-between">
                    <span>Daftar Sprinter & Lokasi Terakhir</span>
                    <span className="text-[10px] lowercase font-normal">
                      {(data.sprinterLocations || []).filter((l) => l.isActive).length} online
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {data.users
                      .filter((u) => u.Posisi.toLowerCase().includes('sprinter') || true)
                      .map((sprinter) => {
                        const loc = (data.sprinterLocations || []).find(
                          (l) => (l.karyawanNama || '').toLowerCase() === sprinter.Nama.toLowerCase()
                        );
                        const isOnline = loc && loc.isActive;
                        return (
                          <div
                            key={sprinter.ID}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              ></span>
                              <div className="truncate">
                                <span className="font-bold text-slate-800 dark:text-slate-200">{sprinter.Nama}</span>
                                <div className="text-[10px] text-slate-400">
                                  {isOnline && loc
                                    ? `Online • ${formatTimeAgo(loc.waktuUpdate)} (±${Math.round(loc.accuracy || 0)}m)`
                                    : loc
                                    ? `Terakhir online ${formatTimeAgo(loc.waktuUpdate)}`
                                    : 'Belum pernah aktif'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {loc && (
                                <>
                                  <a
                                    href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-semibold text-[11px] hover:bg-teal-100 transition flex items-center gap-1 border border-teal-200 dark:border-teal-700"
                                    title="Buka di Google Maps"
                                  >
                                    <i className="bi bi-geo-alt"></i> Peta
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleClearSprinterLocation(sprinter.Nama, loc.id || loc.karyawanId || sprinter.ID)}
                                    className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex items-center justify-center border border-rose-200 dark:border-rose-800 cursor-pointer"
                                    title="Bersihkan riwayat lokasi radar sprinter ini"
                                  >
                                    <i className="bi bi-trash text-xs"></i>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: KELOLA KATEGORI */}
            {settingTab === 'kategori' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-6 animate-fade-in">
                <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                  <i className="bi bi-tags-fill text-teal-500"></i> Kelola Kategori Tugas
                </h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 p-3 border border-slate-200 rounded-xl bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200"
                    placeholder="Nama kategori baru..."
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 rounded-xl font-bold cursor-pointer transition text-sm shadow-xs"
                  >
                    Tambah
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {data.categories.map((cat) => (
                    <div
                      key={cat}
                      className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{cat}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        className="text-rose-500 hover:text-rose-700 cursor-pointer p-1"
                        title="Hapus Kategori"
                      >
                        <i className="bi bi-trash-fill"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: INFORMASI, INSTALASI APP HP & SUPABASE */}
            {settingTab === 'informasi' && (
              <div className="space-y-5 animate-fade-in">
                {/* 1. INSTALASI APLIKASI HANDPHONE (PWA) */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <i className="bi bi-phone-vibrate-fill text-teal-500"></i> Install Aplikasi di Handphone
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isAppInstalled
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                      }`}
                    >
                      {isAppInstalled ? 'Sudah Terpasang' : 'Tersedia untuk HP'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Pasang aplikasi ini di layar utama handphone sprinter Anda agar dapat dibuka seperti aplikasi Android/iOS asli tanpa membuka browser berulang kali.
                  </p>

                  <div className="p-4 bg-teal-50/70 dark:bg-teal-950/30 rounded-2xl border border-teal-200/60 dark:border-teal-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                        <i className="bi bi-app-indicator"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white">Sprinter Mahada Mobile</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Ringan, cepat, dan hemat kuota</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <i className="bi bi-download"></i>
                      <span>{isAppInstalled ? 'Petunjuk Instalasi' : 'Pasang di Handphone'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. SUPABASE AUTHENTICATION */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <i className="bi bi-shield-lock-fill text-teal-500"></i> Autentikasi Supabase
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSupabaseConfigured
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {isSupabaseConfigured ? 'Supabase Terhubung' : 'Mode Offline / Dev'}
                    </span>
                  </div>

                  {user ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                            {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                              {user.email}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                              UID: {user.id}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={signOutUser}
                          className="px-3.5 py-2 text-xs font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl cursor-pointer hover:bg-rose-100 transition"
                        >
                          Keluar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Masuk atau daftar dengan akun Supabase untuk mengelola data operasional kurir secara cloud.
                      </p>

                      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
                        <button
                          type="button"
                          onClick={() => { setAuthMode('signin'); setAuthMsg(null); }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                            authMode === 'signin' ? 'bg-white dark:bg-slate-900 text-teal-600 shadow-sm' : 'text-slate-500'
                          }`}
                        >
                          Masuk
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('signup'); setAuthMsg(null); }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                            authMode === 'signup' ? 'bg-white dark:bg-slate-900 text-teal-600 shadow-sm' : 'text-slate-500'
                          }`}
                        >
                          Daftar Baru
                        </button>
                      </div>

                      {authMsg && (
                        <div className={`p-3 rounded-xl text-xs font-medium ${
                          authMsg.error
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}>
                          {authMsg.text}
                        </div>
                      )}

                      <div className="space-y-2">
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="Email Supabase"
                          className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200"
                        />
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Kata Sandi (min 6 karakter)"
                          className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isSubmittingAuth}
                        onClick={async () => {
                          if (!authEmail.trim() || !authPassword.trim()) {
                            setAuthMsg({ text: 'Email dan kata sandi wajib diisi', error: true });
                            return;
                          }
                          setIsSubmittingAuth(true);
                          setAuthMsg(null);
                          try {
                            if (authMode === 'signin') {
                              const res = await signInWithEmail(authEmail, authPassword);
                              if (res.error) {
                                setAuthMsg({ text: res.error.message || 'Gagal masuk', error: true });
                              } else {
                                setAuthMsg({ text: 'Berhasil masuk ke Supabase!', error: false });
                              }
                            } else {
                              const res = await signUpWithEmail(authEmail, authPassword);
                              if (res.error) {
                                setAuthMsg({ text: res.error.message || 'Gagal mendaftar', error: true });
                              } else {
                                setAuthMsg({ text: 'Pendaftaran berhasil! Cek email untuk verifikasi.', error: false });
                              }
                            }
                          } catch (err: any) {
                            setAuthMsg({ text: err.message || 'Terjadi kesalahan autentikasi', error: true });
                          } finally {
                            setIsSubmittingAuth(false);
                          }
                        }}
                        className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isSubmittingAuth
                          ? 'Memproses...'
                          : authMode === 'signin'
                          ? 'Masuk ke Akun'
                          : 'Daftar Akun Baru'}
                      </button>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                        <button
                          type="button"
                          onClick={() => signInWithOAuth('google')}
                          className="flex-1 py-2.5 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <i className="bi bi-google text-rose-500"></i> Google
                        </button>
                        <button
                          type="button"
                          onClick={() => signInWithOAuth('github')}
                          className="flex-1 py-2.5 px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <i className="bi bi-github"></i> GitHub
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. DATABASE BACKEND INFO (SUPABASE) */}
                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-2xl border border-teal-100 dark:border-teal-800/40 text-xs text-teal-800 dark:text-teal-300 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        <i className="bi bi-database-fill"></i>
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-white">Database Supabase (PostgreSQL)</p>
                        <p className="text-[11px] opacity-80">Tabel: tasks, vendors, categories, karyawan, recaps, sprinter_locations.</p>
                      </div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Aplikasi ini dikonfigurasi untuk bekerja dengan cloud database Supabase. Anda dapat menghubungkan proyek Supabase Anda dengan memasukkan <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> pada environment.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      </div> {/* END MAIN CONTAINER */}

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 mx-auto w-full md:max-w-2xl lg:max-w-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.06)] z-[100] py-2 px-3 md:rounded-3xl md:bottom-4 border-t md:border border-slate-200/90 dark:border-slate-800 hide-on-print">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex-1 py-1.5 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'home' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <i className="bi bi-grid-fill text-lg"></i>
          <span className="text-[10px] tracking-wide">Tugas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('radar')}
          className={`flex-1 py-1.5 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'radar' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <i className="bi bi-broadcast-pin text-lg"></i>
          <span className="text-[10px] tracking-wide">Radar</span>
        </button>

        {/* PLUS BUTTON IN CENTER */}
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm cursor-pointer transition active:scale-95 ${
              activeTab === 'add'
                ? 'bg-teal-600 text-white ring-4 ring-teal-500/20 shadow-teal-500/30'
                : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-600'
            }`}
            title="Tambah Tugas Baru"
          >
            <i className="bi bi-plus-lg text-lg font-bold"></i>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`flex-1 py-1.5 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'report' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <i className="bi bi-wallet-fill text-lg"></i>
          <span className="text-[10px] tracking-wide">Rekap</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vendor')}
          className={`flex-1 py-1.5 flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'vendor' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <i className="bi bi-shop-window text-lg"></i>
          <span className="text-[10px] tracking-wide">Vendor</span>
        </button>
      </nav>

      {/* MODAL UPDATE STATUS & POD */}
      {statusModalTask && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setStatusModalTask(null);
          }}
          className="fixed inset-0 bg-slate-900/60 z-[9000] flex justify-center items-end backdrop-blur-sm transition-opacity p-0 md:p-4"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md md:max-w-lg rounded-t-[2rem] md:rounded-[2rem] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <i className="bi bi-arrow-repeat text-teal-500"></i> Update Progress &amp; Biaya
              </h3>
              <button
                type="button"
                onClick={() => setStatusModalTask(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex justify-center items-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="bg-teal-50/50 dark:bg-teal-900/20 p-3.5 rounded-2xl mb-4 border border-teal-100 dark:border-teal-800/40">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{statusModalTask.JudulTugas}</p>
              {(() => {
                const mapRes = resolveLocationMapsLink(statusModalTask.Tujuan, data.vendors);
                return (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <i className="bi bi-geo-alt-fill text-rose-500 shrink-0"></i>
                    <a
                      href={mapRes.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-700 dark:text-teal-300 font-bold hover:underline inline-flex items-center gap-1"
                      title={mapRes.vendorMatch?.LinkMaps ? `Buka Maps Vendor ${mapRes.vendorMatch.Nama}` : 'Cari di Google Maps'}
                    >
                      <span>{statusModalTask.Tujuan}</span>
                      <i className="bi bi-box-arrow-up-right text-[10px]"></i>
                    </a>
                    {mapRes.vendorMatch && (
                      <a
                        href={mapRes.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 ${
                          mapRes.vendorMatch.LinkMaps
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <i className="bi bi-geo-alt-fill text-emerald-600"></i>
                        <span>Maps: {mapRes.vendorMatch.Nama}</span>
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
                  Total Biaya Keluar (Rp)
                </label>
                <input
                  type="number"
                  value={modalBiaya}
                  onChange={(e) => setModalBiaya(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 dark:bg-slate-800 dark:border-slate-700 font-black text-teal-700 dark:text-teal-400 text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
                  Keterangan Biaya (Cth: Bensin, Parkir, Titip)
                </label>
                <input
                  type="text"
                  value={modalKetBiaya}
                  onChange={(e) => setModalKetBiaya(e.target.value)}
                  placeholder="Cth: Bensin 20rb, Parkir 5rb"
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <h4 className="text-xs font-bold mb-2 text-slate-500 uppercase tracking-wide">Pilih Status:</h4>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {[
                { key: 'Pending', label: 'Pending', color: 'border-slate-200 text-slate-700 bg-slate-50' },
                { key: 'Dalam Perjalanan', label: 'Proses', color: 'border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-900/20' },
                { key: 'Selesai', label: 'Selesai', color: 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' },
                { key: 'Gagal', label: 'Batal', color: 'border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-900/20' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setModalStatusChoice(s.key)}
                  className={`py-3 px-2 border rounded-xl font-bold text-sm cursor-pointer transition ${s.color} ${
                    modalStatusChoice === s.key ? 'ring-2 ring-teal-500 shadow-sm' : ''
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {(modalStatusChoice === 'Selesai' || modalStatusChoice === 'Gagal') && (
              <div className="space-y-3 mb-5 p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/60 animate-fade-in">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
                    Nama Penerima / PIC yang Menemui
                  </label>
                  <input
                    type="text"
                    value={modalPenerima}
                    onChange={(e) => setModalPenerima(e.target.value)}
                    placeholder="Nama orang yang menerima"
                    className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
                    Catatan Bukti / Keterangan *
                  </label>
                  <textarea
                    rows={2}
                    value={modalCatatan}
                    onChange={(e) => setModalCatatan(e.target.value)}
                    placeholder="Wajib diisi: barang telah diserahkan / alasan batal..."
                    className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200"
                  ></textarea>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveStatusModal}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white font-black py-4 rounded-2xl cursor-pointer transition shadow-md"
            >
              Simpan Perubahan Status
            </button>
          </div>
        </div>
      )}

      {/* MODAL EDIT TUGAS LENGKAP */}
      {editModalTask && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditModalTask(null);
          }}
          className="fixed inset-0 bg-slate-900/60 z-[9000] flex justify-center items-end backdrop-blur-sm transition-opacity p-0 md:p-4"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md md:max-w-lg rounded-t-[2rem] md:rounded-[2rem] p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <i className="bi bi-pencil-square text-amber-500"></i> Edit Detail Tugas
              </h3>
              <button
                type="button"
                onClick={() => setEditModalTask(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex justify-center items-center text-slate-500 cursor-pointer"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Kegiatan / Judul</label>
                <input
                  type="text"
                  value={editModalTask.JudulTugas}
                  onChange={(e) => setEditModalTask({ ...editModalTask, JudulTugas: e.target.value })}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Invoice / Resi</label>
                <input
                  type="text"
                  value={editModalTask.Invoice}
                  onChange={(e) => setEditModalTask({ ...editModalTask, Invoice: e.target.value })}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Dari (Asal)</label>
                  <input
                    type="text"
                    value={editModalTask.Dari}
                    onChange={(e) => setEditModalTask({ ...editModalTask, Dari: e.target.value })}
                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Prioritas</label>
                  <select
                    value={editModalTask.Prioritas}
                    onChange={(e) => setEditModalTask({ ...editModalTask, Prioritas: e.target.value })}
                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="Standar">Standar</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Tujuan *</label>
                <textarea
                  rows={2}
                  value={editModalTask.Tujuan}
                  onChange={(e) => setEditModalTask({ ...editModalTask, Tujuan: e.target.value })}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Karyawan</label>
                  <select
                    value={editModalTask.Karyawan}
                    onChange={(e) => setEditModalTask({ ...editModalTask, Karyawan: e.target.value })}
                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {data.users.map((u) => (
                      <option key={u.ID} value={`${u.Nama} (${u.Posisi})`}>
                        {u.Nama} ({u.Posisi})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Kategori</label>
                  <select
                    value={editModalTask.Kategori}
                    onChange={(e) => setEditModalTask({ ...editModalTask, Kategori: e.target.value })}
                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {data.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Biaya (Rp)</label>
                <input
                  type="number"
                  value={editModalTask.Biaya || ''}
                  onChange={(e) => setEditModalTask({ ...editModalTask, Biaya: Number(e.target.value) || 0 })}
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono font-bold text-teal-700 dark:text-teal-400 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveEditTask}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-2xl cursor-pointer transition shadow-md"
            >
              Simpan Perbaikan
            </button>

            <button
              type="button"
              onClick={() => handleDeleteTask(editModalTask.ID)}
              className="w-full mt-3 bg-white dark:bg-slate-900 text-rose-600 border border-rose-200 dark:border-rose-800 font-bold py-3 rounded-2xl cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
            >
              <i className="bi bi-trash-fill mr-1"></i> Hapus Tugas
            </button>
          </div>
        </div>
      )}

      {/* MODAL VENDOR */}
      {vendorModalData && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setVendorModalData(null);
          }}
          className="fixed inset-0 bg-slate-900/60 z-[9000] flex justify-center items-end backdrop-blur-sm transition-opacity p-0 md:p-4"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md md:max-w-lg rounded-t-[2rem] md:rounded-[2rem] p-5 md:p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <i className="bi bi-shop text-teal-500"></i> {vendorModalData.id ? 'Edit Vendor' : 'Tambah Vendor Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setVendorModalData(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex justify-center items-center text-slate-500 cursor-pointer"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form onSubmit={handleSaveVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Nama Vendor *</label>
                <input
                  type="text"
                  required
                  value={vendorModalData.nama}
                  onChange={(e) => setVendorModalData({ ...vendorModalData, nama: e.target.value })}
                  placeholder="Cth: Toko Bahan Mahada"
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">No. HP / WhatsApp</label>
                <input
                  type="tel"
                  value={vendorModalData.noHp}
                  onChange={(e) => setVendorModalData({ ...vendorModalData, noHp: e.target.value })}
                  placeholder="0812..."
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Alamat Lengkap *</label>
                <textarea
                  required
                  rows={2}
                  value={vendorModalData.alamat}
                  onChange={(e) => setVendorModalData({ ...vendorModalData, alamat: e.target.value })}
                  placeholder="Alamat lengkap vendor..."
                  className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">
                  Link Google Maps (Opsional)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-rose-500">
                    <i className="bi bi-geo-alt-fill"></i>
                  </span>
                  <input
                    type="url"
                    value={vendorModalData.linkMaps}
                    onChange={(e) => setVendorModalData({ ...vendorModalData, linkMaps: e.target.value })}
                    placeholder="https://maps.app.goo.gl/... atau link Maps"
                    className="w-full pl-9 pr-3 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Saat vendor ini terpilih di tugas, nama vendor dapat diklik dan langsung menuju ke tautan maps ini.
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-4 rounded-2xl cursor-pointer transition shadow-md"
              >
                Simpan Vendor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INSTALL APLIKASI HANDPHONE (PWA) */}
      {showInstallModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInstallModal(false);
          }}
          className="fixed inset-0 bg-slate-900/70 z-[9999] flex justify-center items-end sm:items-center backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md">
                  <i className="bi bi-phone-vibrate text-xl"></i>
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-800 dark:text-white">Install Sprinter Mahada</h3>
                  <p className="text-[11px] text-slate-400">Pasang di layar utama handphone Anda</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex justify-center items-center text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer transition"
              >
                <i className="bi bi-x-lg text-sm"></i>
              </button>
            </div>

            <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-2xl border border-teal-200/70 dark:border-teal-800/60 text-xs text-teal-800 dark:text-teal-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <i className="bi bi-lightning-charge-fill text-amber-500"></i> Keunggulan Aplikasi HP:
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <li>Buka cepat langsung dari ikon layar depan HP</li>
                <li>Tampilan layar penuh tanpa bilah URL browser</li>
                <li>Pelacak GPS sprinter bekerja stabil & hemat baterai</li>
              </ul>
            </div>

            {/* PLATFORM INSTRUCTIONS */}
            <div className="space-y-3">
              {/* Android Chrome */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                <div className="font-bold text-slate-800 dark:text-white text-xs flex items-center gap-2 mb-2">
                  <i className="bi bi-android2 text-emerald-500 text-base"></i> Pengguna Android (Google Chrome):
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  <li>Buka aplikasi di Chrome, lalu tekan ikon <strong>titik tiga (&vellip;)</strong> di sudut kanan atas browser.</li>
                  <li>Pilih menu <strong>"Instal Aplikasi"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.</li>
                  <li>Klik tombol <strong>"Instal"</strong> saat jendela konfirmasi muncul.</li>
                </ol>
              </div>

              {/* iOS Safari */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                <div className="font-bold text-slate-800 dark:text-white text-xs flex items-center gap-2 mb-2">
                  <i className="bi bi-apple text-slate-800 dark:text-slate-200 text-base"></i> Pengguna iPhone / iPad (Safari):
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  <li>Buka website di browser Safari, tekan tombol <strong>Bagikan (Share <i className="bi bi-box-arrow-up text-teal-500"></i>)</strong> di bagian bawah.</li>
                  <li>Gulir ke bawah dan pilih opsi <strong>"Tambahkan ke Layar Utama (Add to Home Screen)"</strong>.</li>
                  <li>Klik <strong>"Tambah"</strong> di sudut kanan atas layar.</li>
                </ol>
              </div>
            </div>

            {deferredPrompt && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deferredPrompt.prompt();
                    const choice = await deferredPrompt.userChoice;
                    if (choice && choice.outcome === 'accepted') {
                      showToast('Menginstal aplikasi ke HP...');
                    }
                    setDeferredPrompt(null);
                    setShowInstallModal(false);
                  } catch {
                    // ignore
                  }
                }}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <i className="bi bi-download"></i> Pasang Otomatis Sekarang
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-2xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SprinterApp />
    </AuthProvider>
  );
}
