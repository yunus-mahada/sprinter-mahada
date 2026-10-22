import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { SprinterLocation, Task } from '../types.ts';

// Fix Leaflet default icon URL resolution in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface SprinterLiveMapProps {
  locations: SprinterLocation[];
  tasks: Task[];
  selectedSprinterId?: string;
  onSelectSprinter?: (sprinterName: string) => void;
  className?: string;
}

export function SprinterLiveMap({
  locations,
  tasks,
  selectedSprinterId,
  onSelectSprinter,
  className = 'h-72 w-full',
}: SprinterLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Default center Jakarta
    const defaultCenter: [number, number] = [-6.2088, 106.8456];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    // Clean OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when locations or tasks change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const activeLocations = locations.filter(
      (loc) => loc.latitude && loc.longitude && !isNaN(loc.latitude) && !isNaN(loc.longitude)
    );

    if (activeLocations.length === 0) {
      return;
    }

    const bounds: [number, number][] = [];

    activeLocations.forEach((loc) => {
      bounds.push([loc.latitude, loc.longitude]);

      // Find in-progress tasks for this sprinter
      const sprinterTasks = tasks.filter(
        (t) =>
          (t.Karyawan || '').toLowerCase().includes((loc.karyawanNama || '').toLowerCase()) ||
          (loc.karyawanNama || '').toLowerCase().includes((t.Karyawan || '').toLowerCase())
      );
      const onGoingTasks = sprinterTasks.filter((t) => t.Status === 'Dalam Perjalanan');
      const pendingTasks = sprinterTasks.filter((t) => t.Status === 'Pending');

      const isSelected = selectedSprinterId === loc.karyawanId || selectedSprinterId === loc.id;
      const isLive = loc.isActive !== false;

      // Custom pulsing HTML marker
      const customIcon = L.divIcon({
        className: 'custom-sprinter-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
            <!-- Label Tag -->
            <div style="
              background: ${isLive ? (isSelected ? '#0f766e' : '#0d9488') : '#64748b'};
              color: white;
              font-weight: 700;
              font-size: 11px;
              padding: 2px 8px;
              border-radius: 9999px;
              white-space: nowrap;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
              border: 2px solid white;
              margin-bottom: 4px;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${
                isLive ? '#4ade80' : '#cbd5e1'
              };"></span>
              ${loc.karyawanNama}
              ${
                onGoingTasks.length > 0
                  ? `<span style="background: rgba(0,0,0,0.25); font-size: 9px; padding: 1px 4px; border-radius: 4px;">${onGoingTasks.length} Tgs</span>`
                  : ''
              }
            </div>

            <!-- Pulsing Pin Circle -->
            <div style="position: relative; width: 34px; height: 34px;">
              ${
                isLive
                  ? `<div style="
                      position: absolute;
                      inset: -4px;
                      border-radius: 50%;
                      background: rgba(20, 184, 166, 0.4);
                      animation: pulse 2s infinite ease-out;
                    "></div>`
                  : ''
              }
              <div style="
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: ${isLive ? '#0f766e' : '#475569'};
                border: 3px solid white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 15px;
              ">
                🛵
              </div>
            </div>
            <!-- Pin Pointer -->
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 7px solid ${isLive ? '#0f766e' : '#475569'};
              margin-top: -2px;
            "></div>
          </div>
        `,
        iconSize: [40, 50],
        iconAnchor: [20, 50],
        popupAnchor: [0, -50],
      });

      const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon });

      const googleMapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
      const timeStr = loc.waktuUpdate ? loc.waktuUpdate.replace('T', ' ').substring(0, 19) : '-';

      const popupContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="font-size: 14px; color: #0f172a;">${loc.karyawanNama}</strong>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px; background: ${
              isLive ? '#dcfce7; color: #15803d;' : '#f1f5f9; color: #64748b;'
            }">
              ${isLive ? '● Live Online' : '○ Standby'}
            </span>
          </div>

          <div style="font-size: 11px; color: #475569; margin-bottom: 6px; line-height: 1.5;">
            <div><strong>Koordinat:</strong> ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</div>
            ${loc.accuracy ? `<div><strong>Akurasi GPS:</strong> &plusmn;${Math.round(loc.accuracy)} meter</div>` : ''}
            <div><strong>Waktu Update:</strong> ${timeStr}</div>
          </div>

          ${
            onGoingTasks.length > 0
              ? `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; margin-bottom: 8px; font-size: 11px;">
                <div style="color: #0f766e; font-weight: 700; margin-bottom: 2px;">Sedang Berjalan (${onGoingTasks.length}):</div>
                ${onGoingTasks
                  .slice(0, 2)
                  .map(
                    (t) =>
                      `<div style="color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">&bull; ${t.JudulTugas} &rarr; ${t.Tujuan}</div>`
                  )
                  .join('')}
              </div>`
              : pendingTasks.length > 0
              ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${pendingTasks.length} tugas pending antrean</div>`
              : `<div style="font-size: 11px; color: #10b981; margin-bottom: 6px;">Tidak ada tugas aktif</div>`
          }

          <div style="display: flex; gap: 6px; margin-top: 8px;">
            <a href="${googleMapsUrl}" target="_blank" rel="noreferrer" style="
              flex: 1;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              background: #0f766e;
              color: white;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              text-decoration: none;
            ">
              Buka Google Maps
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        if (onSelectSprinter) {
          onSelectSprinter(loc.karyawanNama);
        }
      });

      marker.addTo(layer);
    });

    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [locations, tasks, selectedSprinterId, onSelectSprinter]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
      <div ref={mapContainerRef} className={className} style={{ minHeight: '260px' }} />
      {locations.length === 0 && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center pointer-events-none">
          <div className="bg-white/90 dark:bg-slate-900/90 px-4 py-2 rounded-xl shadow-lg border border-white/20 text-xs font-semibold text-slate-700 dark:text-slate-300">
            📍 Belum ada sprinter yang mengaktifkan broadcast GPS saat ini.
          </div>
        </div>
      )}
    </div>
  );
}
