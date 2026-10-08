// @ts-nocheck - photo picker with auto-compress & built-in AI Sky Analysis
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

export interface AnalysisResult {
  explanation: string;
  conditionId: string;
  confidence: number;
}

interface ImagePickerProps {
  value?: string;
  onChange?: (dataUrl: string | undefined) => void;
  label?: string;
  onPreview?: (dataUrl: string) => void;
  locationName?: string;
  onAnalyzed?: (result: AnalysisResult) => void;
}

export default function ObservationImagePicker({
  value,
  onChange,
  label = '📷 + Photo',
  onPreview,
  locationName,
  onAnalyzed,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [err, setErr] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErr('Image only');
      return;
    }
    setBusy(true);
    setErr('');
    setAnalysis(null);
    try {
      const dataUrl = await compressImage(f, 1000, 0.70);
      onChange?.(dataUrl);
    } catch {
      setErr('Failed to compress');
    }
    setBusy(false);
  };

  const handleAnalyze = async () => {
    if (!value || analyzing) return;
    setAnalyzing(true);
    setErr('');
    try {
      const res = await fetch('/api/public/analyze-weather-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: value, locationName }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Analysis failed');
      }
      const result: AnalysisResult = {
        explanation: data.explanation,
        conditionId: data.conditionId,
        confidence: data.confidence ?? 80,
      };
      setAnalysis(result);
      onAnalyzed?.(result);
    } catch (e: any) {
      setErr(e?.message || 'Could not analyze photo');
    } finally {
      setAnalyzing(false);
    }
  };

  if (value) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={value}
              alt="Weather observation"
              onClick={() => onPreview?.(value)}
              title="Click to view full image"
              style={{
                height: '42px',
                width: '42px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '1px solid #38bdf8',
                cursor: 'pointer',
              }}
            />
            <button
              type="button"
              onClick={() => {
                onChange?.(undefined);
                setAnalysis(null);
              }}
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
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: analyzing ? '#1e293b' : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              border: '1px solid #38bdf8',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '600',
              cursor: analyzing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {analyzing ? '⏳ Analyzing Sky...' : '✨ Explain with AI'}
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              background: '#0f172a',
              border: '1px solid #475569',
              color: '#cbd5e1',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Change
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {/* AI Explanation Card */}
        {analysis && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'rgba(2, 132, 199, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              fontSize: '11px',
              color: '#e2e8f0',
              lineHeight: '1.4',
            }}
          >
            <div style={{ fontWeight: '600', color: '#38bdf8', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>🤖 AI Sky Analysis</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>({analysis.confidence}% confidence)</span>
            </div>
            <div>{analysis.explanation}</div>
          </div>
        )}

        {err && (
          <div style={{ fontSize: '11px', color: '#f87171' }}>
            {err}
          </div>
        )}
      </div>
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
          background: '#0f172a',
          border: '1px dashed #475569',
          color: '#cbd5e1',
          fontSize: '12px',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Compressing...' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {err && <span style={{ fontSize: '11px', color: '#f87171' }}>{err}</span>}
    </span>
  );
}
