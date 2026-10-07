import { HeaderMenu } from '@/modelcast/components/HeaderMenu';
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <CloudSun className="text-sky-400" size={28} />
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">ModelCast</h1>
              <p className="text-xs text-slate-400">{t('appTagline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SettingsBar />
            <HeaderMenu
              activeView={activeView}
              setActiveView={setActiveView}
              onOpenTrackers={() => setShowTrackers(true)}
              onOpenModels={() => setShowModels(true)}
              onRefresh={() => void handleRefresh()}
              refreshing={refreshing}
              onShare={() => void handleShare()}
              shareCopied={shareCopied}
              onExportBackup={exportBackup}
              onRestoreClick={() => fileInputRef.current?.click()}
              hasLocation={!!location}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </div>
        </div>
      </header>

