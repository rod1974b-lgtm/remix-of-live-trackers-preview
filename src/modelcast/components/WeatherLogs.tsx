// @ts-nocheck -- WeatherLogs: Pure Timeline Observations with Ground-Truth Explanations, IndexedDB Photos & AI Sky Vision
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/modelcast/lib/supabase';
import type { GeoLocation, CurrentWeather } from '@/modelcast/lib/types';
import ObservationImagePicker, { type AnalysisResult } from '@/modelcast/components/ObservationImagePicker';
import { useSettings } from '@/modelcast/lib/settings';
import { cToF, fToC, tempUnitLabel } from '@/modelcast/lib/units';

export interface WeatherConditionGuide {
  id: string;
  label: string;
  emoji: string;
  severity: 'light' | 'moderate' | 'heavy' | 'extreme';
  color: string;
  cues: string;
  rateMetric: string;
  rateUs: string;
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
    rateMetric: '0 mm rain • Peak UV exposure',
    rateUs: '0 in rain • Peak UV exposure',
    impact: 'Comfortable to hot depending on season. Protect skin/eyes during midday peak solar hours.',
  },
  {
    id: 'partly_cloudy',
    label: 'Partly Cloudy',
    emoji: '⛅',
    severity: 'light',
    color: '#60a5fa',
    cues: 'Sun shines through broken fluffy cumulus covering 25–50% of the sky. Alternating warm sun and cool shadows.',
    rateMetric: '0 mm rain • Gentle thermal breeze',
    rateUs: '0 in rain • Gentle thermal breeze',
    impact: 'Ideal outdoor conditions; pleasant lighting with intermittent direct sun.',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    emoji: '☁️',
    severity: 'light',
    color: '#94a3b8',
    cues: 'Sky 100% blanketed by a dull, uniform gray cloud layer. No distinct shadows, muted light, sun disc obscured.',
    rateMetric: '0 mm rain (or pre-rain humidity build-up)',
    rateUs: '0 in rain (or pre-rain humidity build-up)',
    impact: 'Traps heat overnight or prevents daytime solar heating. Often precedes developing rain cells.',
  },
  {
    id: 'drizzle',
    label: 'Drizzle / Mist',
    emoji: '🌦️',
    severity: 'light',
    color: '#06b6d4',
    cues: 'Extremely fine micro-droplets floating in the air. Dampens pavement without distinct ripples or running water.',
    rateMetric: '< 1.0 mm/h • Surface dampening',
    rateUs: '< 0.04 in/h • Surface dampening',
    impact: 'Windshield wipers on intermittent delay. Walking without an umbrella is tolerable for several minutes.',
  },
  {
    id: 'light_rain',
    label: 'Light Rain',
    emoji: '🌧️',
    severity: 'light',
    color: '#22c55e',
    cues: 'Individual drops clearly visible and audible. Small circular ripples form in shallow puddles; pavement glistens.',
    rateMetric: '1.0 – 2.5 mm/h',
    rateUs: '0.04 – 0.10 in/h',
    impact: 'Wipers on continuous low speed. Umbrella needed. No standing water on well-drained roadways.',
  },
  {
    id: 'moderate_rain',
    label: 'Moderate Rain',
    emoji: '🌧️',
    severity: 'moderate',
    color: '#eab308',
    cues: 'Steady, rhythmic drumming sound. Continuous water flowing along curbs and gutters; spray kicked up behind car tires.',
    rateMetric: '2.5 – 10.0 mm/h',
    rateUs: '0.10 – 0.40 in/h',
    impact: 'Wipers on standard speed. Moderate visibility reduction. Walking quickly gets shoes and clothes soaked.',
  },
  {
    id: 'heavy_rain',
    label: 'Heavy Rain',
    emoji: '🌊',
    severity: 'heavy',
    color: '#f97316',
    cues: 'Loud roaring sound on roofs and cars. Sheets of water sweeping across streets; visibility drops below 1 km (0.6 mi).',
    rateMetric: '10.0 – 25.0 mm/h (Gauges often lose 10-15% to splash-out)',
    rateUs: '0.40 – 1.00 in/h (Gauges often lose 10-15% to splash-out)',
    impact: 'Wipers on maximum high speed. Rapid water accumulation in road dips. Hydroplaning hazard; slow driving.',
  },
  {
    id: 'extreme_rain',
    label: 'Torrential Downpour',
    emoji: '🚨',
    severity: 'extreme',
    color: '#ef4444',
    cues: 'Blinding white curtain of water. Rain bouncing 15–20 cm (6–8 in) off the pavement. Near-zero visibility; drains overflow.',
    rateMetric: '> 25.0 – 50+ mm/h (High Flash Flood Risk)',
    rateUs: '> 1.00 – 2.00+ in/h (High Flash Flood Risk)',
    impact: 'Flash ponding occurs in minutes. Pull over safely if driving. Standard tipping gauges severely undercount volume.',
  },
  {
    id: 'thunderstorm',
    label: 'Thunderstorm',
    emoji: '⛈️',
    severity: 'extreme',
    color: '#a855f7',
    cues: 'Towering dark anvil clouds, sudden gust front, temperature plunge, and audible thunder rumbles or lightning bolts.',
    rateMetric: 'Variable squalls 15–50+ mm/h • Lightning hazard',
    rateUs: 'Variable squalls 0.6–2.0+ in/h • Lightning hazard',
    impact: '30-30 Safety Rule: If time between flash and thunder is under 30 seconds, immediately take shelter indoors.',
  },
  {
    id: 'windy',
    label: 'Windy / Squall',
    emoji: '💨',
    severity: 'moderate',
    color: '#14b8a6',
    cues: 'Large tree branches whipping constantly; dust and loose leaves airborne; umbrellas blown inside out.',
    rateMetric: 'Sustained > 30 km/h or gusts > 45 km/h',
    rateUs: 'Sustained > 18 mph or gusts > 28 mph',
    impact: 'Hazardous for two-wheelers/scooters. Watch for loose sheet-metal roofing and falling tree limbs.',
  },
  {
    id: 'hazy',
    label: 'Smoke / Haze / Dust',
    emoji: '🌫️',
    severity: 'moderate',
    color: '#f59e0b',
    cues: 'Horizon obscured by brownish/grayish murk; sun appears as an orange/red disc; burning smell or eye irritation.',
    rateMetric: 'Fine particulate matter suspension (PM2.5/PM10)',
    rateUs: 'Fine particulate matter suspension (PM2.5/PM10)',
    impact: 'Sensitive groups limit outdoor exertion. Air purifiers recommended indoors.',
  },
  {
    id: 'foggy',
    label: 'Dense Fog',
    emoji: '🌁',
    severity: 'moderate',
    color: '#64748b',
    cues: 'Ground-level cloud restricting horizontal visibility to under 1,000 m (0.6 mi). Cool, damp, clammy sensation.',
    rateMetric: '100% relative humidity • Micro-condensation',
    rateUs: '100% relative humidity • Micro-condensation',
    impact: 'Use low-beam fog lights only. High beams reflect glare directly back into the driver eyes.',
  },
  {
    id: 'hot_humid',
    label: 'Scorching Heat / Sticky',
    emoji: '🔥',
    severity: 'heavy',
    color: '#dc2626',
    cues: 'Heat waves shimmering off road asphalt. Stifling, stagnant air; heavy perspiration that struggles to evaporate.',
    rateMetric: 'Temp > 35°C or Heat Index > 41°C',
    rateUs: 'Temp > 95°F or Heat Index > 106°F',
    impact: 'High heat exhaustion risk. Drink water with electrolytes proactively before feeling thirsty.',
  },
];

// IndexedDB Photo helpers
const IDB_NAME = 'modelcast_photos_db';
const IDB_STORE = 'photos';

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSavePhoto(id: string, dataUrl: string): Promise<void> {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

async function idbGetPhoto(id: string): Promise<string | null> {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbDeletePhoto(id: string): Promise<void> {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

async function idbGetStats(): Promise<{ count: number; kb: number }> {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const countReq = store.count();
      let totalBytes = 0;
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          if (typeof cursor.value === 'string') {
            totalBytes += cursor.value.length;
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        resolve({ count: countReq.result || 0, kb: Math.round(totalBytes / 1024) });
      };
      tx.onerror = () => resolve({ count: 0, kb: 0 });
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
  const { units } = useSettings();
  const unitLabel = tempUnitLabel(units);

  const getInitialTemp = useCallback(() => {
    const rawC = current?.temperature ?? 30;
    return units === 'us' ? Math.round(cToF(rawC)) : Math.round(rawC);
  }, [current, units]);

  const [obsTime, setObsTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [selectedCondId, setSelectedCondId] = useState<string>('partly_cloudy');
  const [temperature, setTemperature] = useState<number>(getInitialTemp);
  const [note, setNote] = useState<string>('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [aiDetails, setAiDetails] = useState<AnalysisResult | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});
  const [storageStats, setStorageStats] = useState({ count: 0, kb: 0 });
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [cityOnly, setCityOnly] = useState<boolean>(true);

  // Sync temperature input default when units change
  useEffect(() => {
    setTemperature(getInitialTemp());
  }, [getInitialTemp]);

  const activeCondition = useMemo(
    () => CONDITIONS.find((c) => c.id === selectedCondId) || CONDITIONS[1],
    [selectedCondId]
  );

  const activeRate = useMemo(
    () => (units === 'us' ? activeCondition.rateUs : activeCondition.rateMetric),
    [activeCondition, units]
  );

  const refreshStats = useCallback(async () => {
    const stats = await idbGetStats();
    setStorageStats(stats);
  }, []);

  const loadLogs = useCallback(() => {
    try {
      const stored = localStorage.getItem('weather_logs_safe');
      const parsed = stored ? JSON.parse(stored) : [];
      setLogs(parsed);

      // Load only photos that are shown (main photo per log), once each
      const ids = new Set<string>();
      parsed.forEach((log: any) => {
        const pId = log.photoId || log.mainPhotoId;
        if (pId) ids.add(pId);
      });
      setPhotoCache((prev) => {
        // Drop photos for deleted logs to free memory
        const next: Record<string, string> = {};
        for (const id of ids) if (prev[id]) next[id] = prev[id];
        ids.forEach(async (id) => {
          if (next[id]) return;
          const dataUrl = await idbGetPhoto(id);
          if (dataUrl) setPhotoCache((p) => (p[id] ? p : { ...p, [id]: dataUrl }));
        });
        return next;
      });
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    refreshStats();
  }, []);

  // Callback when AI analyzes the photo
  const handleAiAnalyzed = (res: AnalysisResult) => {
    setAiDetails(res);
    if (res.conditionId && CONDITIONS.some((c) => c.id === res.conditionId)) {
      setSelectedCondId(res.conditionId);
    }
    // Pre-fill note if blank, or append cleanly
    if (!note.trim()) {
      setNote(res.explanation);
    } else if (!note.includes(res.explanation)) {
      setNote((prev) => `${prev.trim()} • [AI Sky: ${res.explanation}]`);
    }
    const matched = CONDITIONS.find((c) => c.id === res.conditionId);
    setMsg(`✨ AI Sky Analysis complete: ${matched?.label || res.conditionId} (${res.confidence}% match)`);
    setTimeout(() => setMsg(''), 4500);
  };

  // Quick fill from live station, respecting active unit
  const handleQuickFill = () => {
    if (current) {
      const val = units === 'us' ? Math.round(cToF(current.temperature)) : Math.round(current.temperature);
      setTemperature(val);
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

  // Submit new Timeline Observation (stored normalized to °C so switching units never corrupts data)
  const handleSaveObservation = async () => {
    const nowStamp = Date.now();
    let photoId: string | undefined = undefined;

    if (photo) {
      photoId = `photo_${nowStamp}`;
      await idbSavePhoto(photoId, photo);
      setPhotoCache((prev) => ({ ...prev, [photoId!]: photo }));
    }

    const tempInC = units === 'us' ? Math.round(fToC(Number(temperature))) : Number(temperature);

    const newObservation = {
      id: `obs_${nowStamp}`,
      time: obsTime || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      condition: activeCondition.id,
      conditionLabel: activeCondition.label,
      emoji: activeCondition.emoji,
      severity: activeCondition.severity,
      severityColor: activeCondition.color,
      temperature: tempInC,
      rate: activeRate,
      note: note.trim(),
      photoId,
      location_name: location.name,
      logged_at: new Date().toISOString(),
      aiExplanation: aiDetails?.explanation || undefined,
      aiConfidence: aiDetails?.confidence || undefined,
    };

    try {
      const existing = JSON.parse(localStorage.getItem('weather_logs_safe') || '[]');
      existing.unshift(newObservation);
      localStorage.setItem('weather_logs_safe', JSON.stringify(existing.slice(0, 200)));

      try {
        const displayTemp = units === 'us' ? `${Math.round(cToF(tempInC))}°F` : `${tempInC}°C`;
        await supabase.from('weather_logs').insert({
          note: `[${newObservation.time}] ${activeCondition.emoji} ${activeCondition.label} (${displayTemp}) | ${note}`,
          location_name: location.name,
          logged_at: newObservation.logged_at,
        } as any);
      } catch {}

      setNote('');
      setPhoto(undefined);
      setAiDetails(null);
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

      if (target?.photoId) await idbDeletePhoto(target.photoId);
      if (target?.changes) {
        for (const ch of target.changes) {
          if (ch.photoId) await idbDeletePhoto(ch.photoId);
        }
      }

      loadLogs();
      await refreshStats();
    } catch {
      setMsg('❌ Failed to delete observation');
    }
  };

  const formatLogTemp = (celsiusVal: number | undefined) => {
    if (celsiusVal === undefined || celsiusVal === null) return null;
    if (units === 'us') {
      return `${Math.round(cToF(celsiusVal))}°F`;
    }
    return `${Math.round(celsiusVal)}°C`;
  };

  const filteredLogs = useMemo(() => {
    if (!cityOnly) return logs;
    return logs.filter(
      (l) => !l.location_name || l.location_name.toLowerCase() === location.name.toLowerCase()
    );
  }, [logs, cityOnly, location.name]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px' }}>
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
            padding: '16px',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxImg}
            alt="Enlarged Ground Observation"
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }}
          />
        </div>
      )}

      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
              Ground-Truth Logbook
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              📍 <strong>{location.name}</strong> • Real-time user observations that refine model rankings
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: '#0284c720',
                color: '#38bdf8',
                border: '1px solid #0284c750',
              }}
            >
              📷 {storageStats.count} photos ({storageStats.kb} KB)
            </span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            background: '#0369a1',
            color: 'white',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {msg}
        </div>
      )}

      {/* Form: New Timeline Observation */}
      <div
        style={{
          background: '#0f172a',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
            Log Current Weather
          </h3>
          <button
            onClick={handleQuickFill}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: '#0369a1',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            ⚡ Quick-fill from Station
          </button>
        </div>

        {/* Condition Picker Grid */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
            Select Weather Condition
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            {CONDITIONS.map((cond) => {
              const active = cond.id === selectedCondId;
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
                    background: active ? `${cond.color}25` : '#1e293b',
                    border: active ? `2px solid ${cond.color}` : '1px solid #334155',
                    color: active ? '#ffffff' : '#cbd5e1',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 400,
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
        </div>

        {/* Cues Guide for the selected condition */}
        <div
          style={{
            background: '#1e293b',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '16px',
            borderLeft: `4px solid ${activeCondition.color}`,
            fontSize: '12px',
            color: '#cbd5e1',
          }}
        >
          <div style={{ fontWeight: 'bold', color: activeCondition.color, marginBottom: '2px' }}>
            {activeCondition.emoji} {activeCondition.label} — Ground Verification Cues:
          </div>
          <div>{activeCondition.cues}</div>
          <div style={{ marginTop: '4px', color: '#94a3b8' }}>
            <strong>Expected Rate ({units === 'us' ? 'Imperial' : 'Metric'}):</strong> {activeRate}
          </div>
        </div>

        {/* Time, Temperature, Photo */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Observation Time
            </label>
            <input
              type="time"
              value={obsTime}
              onChange={(e) => setObsTime(e.target.value)}
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
              Observed Temp ({unitLabel})
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
              onChange={(img) => {
                setPhoto(img);
                if (!img) setAiDetails(null);
              }}
              label="📷 Snap / Upload"
              onPreview={(img) => setLightboxImg(img)}
              locationName={location.name}
              onAnalyzed={handleAiAnalyzed}
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
            placeholder="e.g. Roads flooded along Main St, gutters overflowing..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: 'white',
              fontSize: '13px',
            }}
          />
        </div>

        <button
          onClick={handleSaveObservation}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '10px',
            background: '#0284c7',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Save Observation
        </button>
      </div>

      {/* Timeline Observation List */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
            Observation Timeline ({filteredLogs.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cityOnly}
                onChange={(e) => setCityOnly(e.target.checked)}
              />
              Only {location.name}
            </label>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div
            style={{
              background: '#0f172a',
              borderRadius: '12px',
              padding: '32px',
              textAlign: 'center',
              color: '#64748b',
              border: '1px dashed #334155',
            }}
          >
            No observations logged yet for this location. Use the form above to record ground-truth weather.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredLogs.map((log: any) => {
              const condMatch = CONDITIONS.find((c) => c.id === log.condition);
              const badgeColor = log.severityColor || condMatch?.color || '#38bdf8';
              const displayDate = log.logged_at ? new Date(log.logged_at).toLocaleDateString() : '';
              const displayTime = log.time || (log.logged_at ? new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

              return (
                <div
                  key={log.id}
                  style={{
                    padding: '12px 16px',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '18px' }}>{log.emoji || condMatch?.emoji || '🌤️'}</span>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffffff' }}>
                        {log.conditionLabel || condMatch?.label || log.condition}
                      </span>
                      {log.temperature !== undefined && (
                        <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>
                          {formatLogTemp(log.temperature)}
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
                      {log.aiConfidence && (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#38bdf8',
                            fontWeight: 'bold',
                          }}
                        >
                          🤖 AI {log.aiConfidence}%
                        </span>
                      )}
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
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                        title="Delete observation"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {log.note && (
                    <div style={{ fontSize: '12px', color: '#cbd5e1', background: '#0f172a80', padding: '6px 10px', borderRadius: '6px' }}>
                      {log.note}
                    </div>
                  )}

                  {photoCache[log.photoId] && (
                    <div>
                      <img
                        src={photoCache[log.photoId]}
                        alt="Observation attachment"
                        onClick={() => setLightboxImg(photoCache[log.photoId])}
                        style={{
                          width: '80px',
                          height: '80px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          cursor: 'zoom-in',
                          border: '1px solid #334155',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default WeatherLogs;
