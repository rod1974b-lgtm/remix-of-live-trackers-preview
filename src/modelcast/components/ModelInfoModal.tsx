import { X, Globe, Building2, Ruler } from 'lucide-react';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { useSettings } from '@/modelcast/lib/settings';

interface ModelInfoModalProps {
  open: boolean;
  onClose: () => void;
}

export function ModelInfoModal({ open, onClose }: ModelInfoModalProps) {
  const { t } = useSettings();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700/60 bg-slate-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{t('weatherModels')}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-400">
          {t('weatherModelsDesc')}
        </p>

        <div className="space-y-3">
          {WEATHER_MODELS.map((model) => (
            <div key={model.id} className="rounded-2xl border border-slate-700/50 bg-slate-800/60 p-4">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: model.color }} />
                <div>
                  <h3 className="font-semibold text-slate-100">{model.name}</h3>
                  <p className="text-sm text-slate-400">{model.organization}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Globe size={14} className="text-sky-400" />
                  {model.region}
                </span>
                <span className="flex items-center gap-1.5">
                  <Ruler size={14} className="text-emerald-400" />
                  {model.resolution}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-amber-400" />
                  {model.organization}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
