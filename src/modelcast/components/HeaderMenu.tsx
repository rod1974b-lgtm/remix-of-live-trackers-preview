import { useState, useRef, useEffect } from 'react';
import {
  Menu,
  X,
  Radar,
  Layers,
  BookOpen,
  CloudSun,
  RefreshCw,
  Share2,
  Check,
  Download,
  Upload,
} from 'lucide-react';
import { useSettings } from '@/modelcast/lib/settings';

interface HeaderMenuProps {
  activeView: 'forecast' | 'logs';
  setActiveView: (view: 'forecast' | 'logs') => void;
  onOpenTrackers: () => void;
  onOpenModels: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onShare: () => void;
  shareCopied: boolean;
  onExportBackup: () => void;
  onRestoreClick: () => void;
  hasLocation: boolean;
}

export function HeaderMenu({
  activeView,
  setActiveView,
  onOpenTrackers,
  onOpenModels,
  onRefresh,
  refreshing,
  onShare,
  shareCopied,
  onExportBackup,
  onRestoreClick,
  hasLocation,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useSettings();

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Toggle menu"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${
          open
            ? 'border-sky-500 bg-sky-500/20 text-sky-200'
            : 'border-slate-700/80 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
        }`}
      >
        {open ? <X size={15} /> : <Menu size={15} />}
        <span>Menu</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
          {/* Section: Views & Modals */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Views & Analysis
          </div>

          <button
            onClick={() => handleAction(onOpenTrackers)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/15 sm:text-sm"
          >
            <Radar size={16} className="text-rose-400 shrink-0" />
            <span className="flex-1">{t('liveTrackers')}</span>
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
              LIVE
            </span>
          </button>

          <button
            onClick={() => handleAction(onOpenModels)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/15 sm:text-sm"
          >
            <Layers size={16} className="text-sky-400 shrink-0" />
            <span className="flex-1">{t('weatherModelsLive')}</span>
          </button>

          <button
            onClick={() =>
              handleAction(() =>
                setActiveView(activeView === 'logs' ? 'forecast' : 'logs')
              )
            }
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 sm:text-sm"
          >
            {activeView === 'logs' ? (
              <>
                <CloudSun size={16} className="text-amber-400 shrink-0" />
                <span>{t('forecast')}</span>
              </>
            ) : (
              <>
                <BookOpen size={16} className="text-indigo-400 shrink-0" />
                <span>{t('logs')}</span>
              </>
            )}
          </button>

          <div className="my-1.5 border-t border-slate-800" />

          {/* Section: Actions */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Actions
          </div>

          <button
            disabled={!hasLocation || refreshing}
            onClick={() => handleAction(onRefresh)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors sm:text-sm ${
              !hasLocation || refreshing
                ? 'cursor-not-allowed text-slate-500'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <RefreshCw
              size={16}
              className={`shrink-0 ${refreshing ? 'animate-spin text-sky-400' : 'text-slate-400'}`}
            />
            <span>{refreshing ? 'Updating...' : t('refresh')}</span>
          </button>

          <button
            onClick={onShare}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 sm:text-sm"
          >
            {shareCopied ? (
              <>
                <Check size={16} className="text-emerald-400 shrink-0" />
                <span className="text-emerald-400">{t('copied')}</span>
              </>
            ) : (
              <>
                <Share2 size={16} className="text-emerald-400 shrink-0" />
                <span>{t('share')}</span>
              </>
            )}
          </button>

          <div className="my-1.5 border-t border-slate-800" />

          {/* Section: Data Management */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Data
          </div>

          <button
            onClick={() => handleAction(onExportBackup)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 sm:text-sm"
          >
            <Download size={16} className="text-teal-400 shrink-0" />
            <span>{t('backup')}</span>
          </button>

          <button
            onClick={() => handleAction(onRestoreClick)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 sm:text-sm"
          >
            <Upload size={16} className="text-amber-400 shrink-0" />
            <span>{t('restore')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
