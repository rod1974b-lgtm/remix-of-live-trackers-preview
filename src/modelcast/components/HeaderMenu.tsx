// @ts-nocheck
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
  onToggleView?: () => void;
  setActiveView?: (view: 'forecast' | 'logs') => void;
  onOpenTrackers?: () => void;
  onOpenModels?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onShare?: () => void;
  shareCopied?: boolean;
  onBackup?: () => void;
  onExportBackup?: () => void;
  onRestore?: () => void;
  onRestoreClick?: () => void;
  hasLocation?: boolean;
}

export function HeaderMenu({
  activeView,
  onToggleView,
  setActiveView,
  onOpenTrackers,
  onOpenModels,
  onRefresh,
  refreshing = false,
  onShare,
  shareCopied = false,
  onBackup,
  onExportBackup,
  onRestore,
  onRestoreClick,
  hasLocation = true,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useSettings();

  // Close when tapping/clicking anywhere outside on phone or desktop
  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Safe action trigger that guarantees the menu closes without throwing
  const trigger = (action?: () => void) => {
    setOpen(false);
    if (typeof action === 'function') {
      try {
        action();
      } catch (err) {
        console.error('Menu action failed:', err);
      }
    }
  };

  const handleToggleView = () => {
    trigger(() => {
      if (typeof onToggleView === 'function') {
        onToggleView();
      } else if (typeof setActiveView === 'function') {
        setActiveView(activeView === 'logs' ? 'forecast' : 'logs');
      }
    });
  };

  const handleBackup = () => {
    trigger(onBackup || onExportBackup);
  };

  const handleRestore = () => {
    trigger(onRestore || onRestoreClick);
  };

  const handleRefresh = () => {
    if (refreshing || !hasLocation) return;
    trigger(onRefresh);
  };

  const handleShare = () => {
    trigger(onShare);
  };

  return (
    <div ref={menuRef} className="relative touch-manipulation">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Toggle menu"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all sm:px-3 sm:text-sm active:scale-95 ${
          open
            ? 'border-sky-500 bg-sky-500/20 text-sky-200'
            : 'border-slate-700/80 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
        }`}
      >
        {open ? <X size={15} /> : <Menu size={15} />}
        <span>Menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-md animate-in fade-in duration-150"
        >
          {/* Section: Views & Analysis */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Views & Analysis
          </div>

          <button
            type="button"
            onClick={() => trigger(onOpenTrackers)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/15 active:bg-rose-500/25 sm:py-2 sm:text-sm"
          >
            <Radar size={16} className="text-rose-400 shrink-0" />
            <span className="flex-1">{t('liveTrackers') || 'Live Trackers'}</span>
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
              LIVE
            </span>
          </button>

          <button
            type="button"
            onClick={() => trigger(onOpenModels)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/15 active:bg-sky-500/25 sm:py-2 sm:text-sm"
          >
            <Layers size={16} className="text-sky-400 shrink-0" />
            <span className="flex-1">{t('weatherModelsLive') || 'Weather Models Live'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleView}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-700 sm:py-2 sm:text-sm"
          >
            {activeView === 'logs' ? (
              <>
                <CloudSun size={16} className="text-amber-400 shrink-0" />
                <span>{t('forecast') || 'Forecast'}</span>
              </>
            ) : (
              <>
                <BookOpen size={16} className="text-indigo-400 shrink-0" />
                <span>{t('logs') || 'Weather Logs'}</span>
              </>
            )}
          </button>

          <div className="my-1.5 border-t border-slate-800" />

          {/* Section: Actions */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Actions
          </div>

          <button
            type="button"
            disabled={!hasLocation || refreshing}
            onClick={handleRefresh}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium transition-colors sm:py-2 sm:text-sm ${
              !hasLocation || refreshing
                ? 'cursor-not-allowed opacity-50 text-slate-500'
                : 'text-slate-200 hover:bg-slate-800 active:bg-slate-700'
            }`}
          >
            <RefreshCw
              size={16}
              className={`shrink-0 ${refreshing ? 'animate-spin text-sky-400' : 'text-slate-400'}`}
            />
            <span>{refreshing ? 'Updating...' : (t('refresh') || 'Refresh')}</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-700 sm:py-2 sm:text-sm"
          >
            {shareCopied ? (
              <>
                <Check size={16} className="text-emerald-400 shrink-0" />
                <span className="text-emerald-400">{t('copied') || 'Link Copied!'}</span>
              </>
            ) : (
              <>
                <Share2 size={16} className="text-emerald-400 shrink-0" />
                <span>{t('share') || 'Share'}</span>
              </>
            )}
          </button>

          <div className="my-1.5 border-t border-slate-800" />

          {/* Section: Data Management */}
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Data
          </div>

          <button
            type="button"
            onClick={handleBackup}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-700 sm:py-2 sm:text-sm"
          >
            <Download size={16} className="text-teal-400 shrink-0" />
            <span>{t('backup') || 'Backup'}</span>
          </button>

          <button
            type="button"
            onClick={handleRestore}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 active:bg-slate-700 sm:py-2 sm:text-sm"
          >
            <Upload size={16} className="text-amber-400 shrink-0" />
            <span>{t('restore') || 'Restore'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
