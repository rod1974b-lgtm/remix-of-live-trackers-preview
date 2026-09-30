// @ts-nocheck - photo picker with auto-compress for WeatherLogs
// Compresses to max 1000px JPEG ~45-75KB for fast loading and low storage
import { useRef, useState } from 'react';

function compressImage(file: File, maxDim = 1000, quality = 0.70): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}

interface ImagePickerProps {
  value?: string;
  onChange?: (dataUrl: string | undefined) => void;
  label?: string;
  onPreview?: (dataUrl: string) => void;
}

export default function ObservationImagePicker({ value, onChange, label = '📷 + Photo', onPreview }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErr('Image only');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const dataUrl = await compressImage(f, 1000, 0.70);
      onChange?.(dataUrl);
    } catch {
      setErr('Failed to compress');
    }
    setBusy(false);
  };

  if (value) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={value}
            alt="Preview"
            onClick={() => onPreview?.(value)}
            title="Click to view full image"
            style={{ height: '36px', width: '36px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #38bdf8', cursor: 'pointer' }}
          />
          <button
            type="button"
            onClick={() => onChange?.(undefined)}
            title="Remove photo"
            style={{
              position: 'absolute',
              top: '-7px',
              right: '-7px',
              height: '18px',
              width: '18px',
              borderRadius: '50%',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              fontSize: '10px',
              cursor: 'pointer',
              lineHeight: '18px',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{ padding: '5px 8px', borderRadius: '6px', background: '#0f172a', border: '1px solid #475569', color: '#cbd5e1', fontSize: '11px', cursor: 'pointer' }}
        >
          Change
        </button>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Upload or take a photo"
        disabled={busy}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          background: 'transparent',
          border: '1px dashed #64748b',
          color: '#cbd5e1',
          fontSize: '11px',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? '⏳ Compressing...' : label}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <span style={{ color: '#f87171', fontSize: '10px' }}>{err}</span>}
    </span>
  );
}
