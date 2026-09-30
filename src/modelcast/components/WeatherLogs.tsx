// @ts-nocheck -- WeatherLogs: Pure Timeline Observations with Ground-Truth Explanations & IndexedDB Photos
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/modelcast/lib/supabase';
import type { GeoLocation, CurrentWeather } from '@/modelcast/lib/types';
import ObservationImagePicker from '@/modelcast/components/ObservationImagePicker';

export interface WeatherConditionGuide {
  id: string;
  label: string;
  emoji: string;
  severity: 'light' | 'moderate' | 'heavy' | 'extreme';
  color: string;
  cues: string;
  rate: string;
  impact: string;
}

export const CONDITIONS: WeatherConditionGuide[] = [
  {
    id: 'sunny',
    label: 'Sunny / Clear',
    emoji: '☀️',
    severity: 'light',
    color: '#38bdf8',
    cues: 'Sky completely clear or <10% high cirrus. Strong sharp shadows cast on ground; intense direct solar radiation.',
    rate: '0 mm rain • Peak UV exposure',
    impact: 'Comfortable to hot depending on season. Protect skin/eyes during midday peak solar hours.',
  },
  {
    id: 'partly_cloudy',
    label: 'Partly Cloudy',
    emoji: '⛅',
    severity: 'light',
    color: '#60a5fa',
    cues: 'Sun shines through broken fluffy cumulus covering 25–50% of the sky. Alternating warm sun and cool shadows.',
    rate: '0 mm rain • Gentle thermal breeze',
    impact: 'Ideal outdoor conditions; pleasant lighting with intermittent direct sun.',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    emoji: '☁️',
    severity: 'light',
    color: '#94a3b8',
    cues: 'Sky 100% blanketed by a dull, uniform gray cloud layer. No distinct shadows, muted light, sun disc obscured.',
    rate: '0 mm rain (or pre-rain humidity build-up)',
    impact: 'Traps heat overnight or prevents daytime solar heating. Often precedes developing rain cells.',
  },
  {
    id: 'drizzle',
    label: 'Drizzle / Mist',
    emoji: '🌦️',
    severity: 'light',
    color: '#06b6d4',
    cues: 'Extremely fine micro-droplets floating in the air. Dampens pavement without distinct ripples or running water.',
    rate: '< 1.0 mm/h • Surface dampening',
    impact: 'Windshield wipers on intermittent delay. Walking without an umbrella is tolerable for several minutes.',
  },
  {
    id: 'light_rain',
    label: 'Light Rain',
    emoji: '🌧️',
    severity: 'light',
    color: '#22c55e',
    cues: 'Individual drops clearly visible and audible. Small circular ripples form in shallow puddles; pavement glistens.',
    rate: '1.0 – 2.5 mm/h',
    impact: 'Wipers on continuous low speed. Umbrella needed. No standing water on well-drained roadways.',
  },
  {
    id: 'moderate_rain',
    label: 'Moderate Rain',
    emoji: '🌧️',
    severity: 'moderate',
    color: '#eab308',
    cues: 'Steady, rhythmic drumming sound. Continuous water flowing along curbs and gutters; spray kicked up behind car tires.',
    rate: '2.5 – 10.0 mm/h',
    impact: 'Wipers on standard speed. Moderate visibility reduction. Walking quickly gets shoes and clothes soaked.',
  },
  {
    id: 'heavy_rain',
    label: 'Heavy Rain',
    emoji: '🌊',
    severity: 'heavy',
    color: '#f97316',
    cues: 'Loud roaring sound on roofs and cars. Sheets of water sweeping across streets; visibility drops below 1 km.',
    rate: '10.0 – 25.0 mm/h (Gauges often lose 10-15% to splash-out)',
    impact: 'Wipers on maximum high speed. Rapid water accumulation in road dips. Hydroplaning hazard; slow driving.',
  },
  {
    id: 'extreme_rain',
    label: 'Torrential Downpour',
    emoji: '🚨',
    severity: 'extreme',
    color: '#ef4444',
    cues: 'Blinding white curtain of water. Rain bouncing 15–20 cm off the pavement. Near-zero visibility; drains overflow.',
    rate: '> 25.0 – 50+ mm/h (High Flash Flood Risk)',
    impact: 'Flash ponding occurs in minutes. Pull over safely if driving. Standard tipping gauges severely undercount volume.',
  },
  {
    id: 'thunderstorm',
    label: 'Thunderstorm',
    emoji: '⛈️',
    severity: 'extreme',
    color: '#a855f7',
    cues: 'Towering dark anvil clouds, sudden gust front, temperature plunge, and audible thunder rumbles or lightning bolts.',
    rate: 'Variable squalls 15–50+ mm/h • Lightning hazard',
    impact: '30-30 Safety Rule: If time between flash and thunder is under 30 seconds, immediately take shelter indoors.',
  },
  {
    id: 'windy',
    label: 'Windy / Squall',
    emoji: '💨',
    severity: 'moderate',
    color: '#14b8a6',
    cues: 'Large tree branches whipping constantly; dust and loose leaves airborne; umbrellas blown inside out.',
    rate: 'Sustained > 30 km/h or gusts > 45 km/h',
    impact: 'Hazardous for two-wheelers/scooters. Watch for loose sheet-metal roofing and falling tree limbs.',
  },
  {
    id: 'hazy',
    label: 'Haze / PM2.5 Smoke',
    emoji: '🌫️',
    severity: 'moderate',
    color: '#f59e0b',
    cues: 'Milky, bleached horizon with brownish-yellow tint. Distant hills faded or invisible; acrid smell in the air.',
    rate: 'Visibility 2 – 5 km • Elevated particulate matter',
    impact: 'Sensitive individuals should wear N95/FFP2 masks outdoors and keep doors and windows closed.',
  },
  {
    id: 'foggy',
    label: 'Dense Fog',
    emoji: '🌁',
    severity: 'moderate',
    color: '#64748b',
    cues: 'Ground-level cloud engulfing surrounding area. Landmarks past 500m disappear; damp moisture covers skin.',
    rate: 'Visibility < 1 km • 100% Relative Humidity',
    impact: 'Drive slowly using low-beam fog lights. High beams reflect off droplets and cause blinding white-out glare.',
  },
  {
    id: 'hot',
    label: 'Oppressive Heat',
    emoji: '🔥',
    severity: 'moderate',
    color: '#dc2626',
    cues: 'Heat waves shimmering off road asphalt. Stifling, stagnant air; heavy perspiration that struggles to evaporate.',
    rate: 'Temp > 35°C or Heat Index > 41°C',
    impact: 'High danger of heat exhaustion and cramps. Drink extra electrolytes and avoid strenuous activity in the sun.',
  },
];

// --- IndexedDB Storage Engine for Photo Binaries ---
const IDB_NAME = 'modelcast_photos_v1';
const STORE_NAME = 'photos';

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSavePhoto(id: string, dataUrl: string): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, dataUrl, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetPhoto(id: string): Promise<string | undefined> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result?.dataUrl);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeletePhotos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearPhotos(): Promise<void> {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetStats(): Promise<{ count: number; kb: number }> {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      let count = 0;
      let totalBytes = 0;
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          count++;
          if (cursor.value?.dataUrl) totalBytes += cursor.value.dataUrl.length;
          cursor.continue();
        } else {
          resolve({ count, kb: Math.round(totalBytes / 1024) });
        }
      };
      req.onerror = () => resolve({ count: 0, kb: 0 });
    });
  } catch {
    return { count: 0, kb: 0 };
  }
}

export function WeatherLogs({
  location,
  current,
}: {
  location: GeoLocation;
  current: CurrentWeather;
}) {
  const [obsTime, setObsTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [selectedCondId, setSelectedCondId] = useState<string>('partly_cloudy');
  const [temperature, setTemperature] = useState<number>(() => current?.temperature ?? 30);
  const [note, setNote] = useState<string>('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});
  const [storageStats, setStorageStats] = useState({ count: 0, kb: 0 });
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [cityOnly, setCityOnly] = useState<boolean>(true);

  const activeCondition = useMemo(
    () => CONDITIONS.find((c) => c.id === selectedCondId) || CONDITIONS[1],
    [selectedCondId]
  );

  const refreshStats = useCallback(async () => {
    const stats = await idbGetStats();
    setStorageStats(stats);
  }, []);

  // Load saved observations from localStorage
  const loadLogs = useCallback(() => {
    try {
      const stored = localStorage.getItem('weather_logs_safe');
      const parsed = stored ? JSON.parse(stored) : [];
      setLogs(parsed);

      // Preload images into memory cache
      parsed.forEach(async (log: any) => {
        const pId = log.photoId || log.mainPhotoId;
        if (pId && !photoCache[pId]) {
          const dataUrl = await idbGetPhoto(pId);
          if (dataUrl) setPhotoCache((prev) => ({ ...prev, [pId]: dataUrl }));
        }
        if (log.changes) {
          log.changes.forEach(async (ch: any) => {
            if (ch.photoId && !photoCache[ch.photoId]) {
              const dataUrl = await idbGetPhoto(ch.photoId);
              if (dataUrl) setPhotoCache((prev) => ({ ...prev, [ch.photoId]: dataUrl }));
            }
          });
        }
      });
    } catch {
      setLogs([]);
    }
  }, [photoCache]);

  useEffect(() => {
    loadLogs();
    refreshStats();
  }, []);

  // Quick fill from live station
  const handleQuickFill = () => {
    if (current) {
      setTemperature(Math.round(current.temperature));
      const code = current.weather_code;
      if (code === 0 || code === 1) setSelectedCondId('sunny');
      else if (code === 2) setSelectedCondId('partly_cloudy');
      else if (code === 3) setSelectedCondId('overcast');
      else if (code >= 51 && code <= 55) setSelectedCondId('drizzle');
      else if (code === 61 || code === 80) setSelectedCondId('light_rain');
      else if (code === 63 || code === 81) setSelectedCondId('moderate_rain');
      else if (code === 65 || code === 82) setSelectedCondId('heavy_rain');
      else if (code >= 95) setSelectedCondId('thunderstorm');
      else if (code === 45 || code === 48) setSelectedCondId('foggy');
    }
    setObsTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setMsg('⚡ Filled with live station observations');
    setTimeout(() => setMsg(''), 3000);
  };

  // Submit new Timeline Observation
  const handleSaveObservation = async () => {
    const nowStamp = Date.now();
    let photoId: string | undefined = undefined;

    if (photo) {
      photoId = `photo_${nowStamp}`;
      await idbSavePhoto(photoId, photo);
      setPhotoCache((prev) => ({ ...prev, [photoId!]: photo }));
    }

    const newObservation = {
      id: `obs_${nowStamp}`,
      time: obsTime || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      condition: activeCondition.id,
      conditionLabel: activeCondition.label,
      emoji: activeCondition.emoji,
      severity: activeCondition.severity,
      severityColor: activeCondition.color,
      temperature: Number(temperature),
      rate: activeCondition.rate,
      note: note.trim(),
      photoId,
      location_name: location.name,
      logged_at: new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(localStorage.getItem('weather_logs_safe') || '[]');
      existing.unshift(newObservation);
      localStorage.setItem('weather_logs_safe', JSON.stringify(existing.slice(0, 200)));

      // Optional Supabase backup
      try {
        await supabase.from('weather_logs').insert({
          note: `[${newObservation.time}] ${activeCondition.emoji} ${activeCondition.label} (${newObservation.temperature}°C) | ${note}`,
          location_name: location.name,
          logged_at: newObservation.logged_at,
        } as any);
      } catch {}

      // Reset form
      setNote('');
      setPhoto(undefined);
      setObsTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
      loadLogs();
      await refreshStats();

      setMsg(`✅ Observation logged for ${location.name} at ${newObservation.time}`);
      setTimeout(() => setMsg(''), 4000);
    } catch {
      setMsg('❌ Failed to save observation');
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem('weather_logs_safe') || '[]');
      const target = existing.find((l: any) => l.id === id);
      const remaining = existing.filter((l: any) => l.id !== id);
      localStorage.setItem('weather_logs_safe', JSON.stringify(remaining));

      const photosToDelete: string[] = [];
      if (target?.photoId) photosToDelete.push(target.photoId);
      if (target?.mainPhotoId) photosToDelete.push(target.mainPhotoId);
      if (target?.changes) {
        target.changes.forEach((c: any) => {
          if (c.photoId) photosToDelete.push(c.photoId);
        });
      }

      if (photosToDelete.length) {
        await idbDeletePhotos(photosToDelete);
        setPhotoCache((prev) => {
          const next = { ...prev };
          photosToDelete.forEach((p) => delete next[p]);
          return next;
        });
      }

      loadLogs();
      await refreshStats();
    } catch {}
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete all timeline weather observations and photos?')) return;
    localStorage.removeItem('weather_logs_safe');
    await idbClearPhotos();
    setPhotoCache({});
    setLogs([]);
    await refreshStats();
  };

  // Filter logs by selected city
  const cityLogs = useMemo(
    () => logs.filter((l) => l.location_name === location.name),
    [logs, location.name]
  );
  const visibleLogs = cityOnly ? cityLogs : logs;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <img
              src={lightboxImg}
              alt="Enlarged observation"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', border: '2px solid #38bdf8' }}
            />
            <button
              onClick={() => setLightboxImg(null)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '16px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          border: '1px solid #334155',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>
            ⏱️ Timeline Weather Observations
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Logging for <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{location.name}</span> • One unified stream of ground truth
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: '#0284c720',
              border: '1px solid #0284c750',
              color: '#38bdf8',
            }}
          >
            💾 {storageStats.count} photos ({storageStats.kb} KB)
          </span>
          <button
            onClick={handleQuickFill}
            style={{
              fontSize: '11px',
              padding: '6px 12px',
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ⚡ Live Station Fill
          </button>
        </div>
      </div>

      {msg && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '14px',
            borderRadius: '10px',
            background: msg.startsWith('✅') ? '#065f46' : msg.startsWith('⚡') ? '#075985' : '#7f1d1d',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
        >
          {msg}
        </div>
      )}

      {/* Observation Entry Form */}
      <div
        style={{
          background: '#0f172a',
          padding: '18px',
          borderRadius: '16px',
          border: '1px solid #334155',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1' }}>
            1. Select Condition
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Tap any condition to view physical cues & rate
          </span>
        </div>

        {/* Condition Buttons Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          {CONDITIONS.map((cond) => {
            const isSelected = selectedCondId === cond.id;
            return (
              <button
                key={cond.id}
                onClick={() => setSelectedCondId(cond.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: isSelected ? `2px solid ${cond.color}` : '1px solid #1e293b',
                  background: isSelected ? `${cond.color}25` : '#1e293b',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  fontSize: '12px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '16px' }}>{cond.emoji}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cond.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Observation Guide Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '12px',
            border: `1.5px solid ${activeCondition.color}`,
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>{activeCondition.emoji}</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}>
                {activeCondition.label}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: activeCondition.color,
                  color: '#ffffff',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}
              >
                {activeCondition.severity}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 'bold' }}>
              {activeCondition.rate}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <div>
              <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>👀 Physical ground cues: </span>
              {activeCondition.cues}
            </div>
            <div>
              <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>🚗 Real-world impact: </span>
              {activeCondition.impact}
            </div>
          </div>
        </div>

        {/* Observation Details: Time, Temp, Note, Photo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Observation Time
            </label>
            <input
              type="text"
              value={obsTime}
              onChange={(e) => setObsTime(e.target.value)}
              placeholder="10:30"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '8px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: 'white',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Observed Temp (°C)
            </label>
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '8px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: 'white',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Photo (Optional)
            </label>
            <ObservationImagePicker
              value={photo}
              onChange={setPhoto}
              label="📷 Snap / Upload"
              onPreview={(img) => setLightboxImg(img)}
            />
          </div>
        </div>

        {/* Note input */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Ground Notes (Optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Heavy water pooling on Soi Fa, wind gusts rattling windows..."
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: 'white',
              fontSize: '12px',
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSaveObservation}
          style={{
            width: '100%',
            padding: '12px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
          }}
        >
          ＋ Add to {location.name} Timeline
        </button>
      </div>

      {/* Timeline Feed History */}
      <div style={{ background: '#0f172a', padding: '16px', borderRadius: '16px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setCityOnly(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                background: cityOnly ? '#0284c7' : '#1e293b',
                color: 'white',
                border: cityOnly ? '1px solid #38bdf8' : '1px solid #334155',
              }}
            >
              📍 {location.name} ({cityLogs.length})
            </button>
            <button
              onClick={() => setCityOnly(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                background: !cityOnly ? '#0284c7' : '#1e293b',
                color: 'white',
                border: !cityOnly ? '1px solid #38bdf8' : '1px solid #334155',
              }}
            >
              🌐 All Cities ({logs.length})
            </button>
          </div>

          {logs.length > 0 && (
            <button
              onClick={handleDeleteAll}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#7f1d1d30',
                border: '1px solid #7f1d1d80',
                color: '#f87171',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              Clear All Logs
            </button>
          )}
        </div>

        {/* Timeline Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visibleLogs.map((log: any) => {
            const photoSrc =
              (log.photoId && photoCache[log.photoId]) ||
              (log.mainPhotoId && photoCache[log.mainPhotoId]) ||
              log.photo ||
              log.mainPhoto;

            const condMatch =
              CONDITIONS.find((c) => c.id === log.condition) ||
              CONDITIONS.find((c) => c.label.toLowerCase().includes((log.condition || '').toLowerCase()));

            const badgeColor = log.severityColor || condMatch?.color || '#38bdf8';
            const displayTime = log.time || new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const displayDate = new Date(log.logged_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

            return (
              <div
                key={log.id}
                style={{
                  padding: '12px',
                  background: '#1e293b',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  borderLeft: `5px solid ${badgeColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{log.emoji || condMatch?.emoji || '🌤️'}</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffffff' }}>
                      {log.conditionLabel || condMatch?.label || log.condition}
                    </span>
                    {log.temperature !== undefined && (
                      <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>
                        {log.temperature}°C
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: `${badgeColor}30`,
                        border: `1px solid ${badgeColor}`,
                        color: badgeColor,
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                      }}
                    >
                      {log.severity || condMatch?.severity || 'obs'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                      {displayDate} • {displayTime}
                    </span>
                    <button
                      onClick={() => handleDeleteOne(log.id)}
                      style={{
                        padding: '4px 8px',
                        background: '#7f1d1d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                      title="Delete entry"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Legacy timeline string support if present */}
                {log.timeline && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    {log.timeline}
                  </div>
                )}

                {/* Observation Note */}
                {log.note && (
                  <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>
                    {log.note}
                  </div>
                )}

                {/* Photo Thumbnail */}
                {photoSrc && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img
                      src={photoSrc}
                      alt="Observation photo"
                      onClick={() => setLightboxImg(photoSrc)}
                      style={{
                        height: '60px',
                        width: '60px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1.5px solid #38bdf8',
                        cursor: 'pointer',
                      }}
                      title="Click to view full image"
                    />
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Tap to view photo</span>
                  </div>
                )}
              </div>
            );
          })}

          {visibleLogs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '12px' }}>
              {cityOnly && logs.length > 0
                ? `No timeline observations for ${location.name} yet — switch to "All Cities" to see entries from other locations.`
                : 'No timeline observations recorded yet. Add your first observation above!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
