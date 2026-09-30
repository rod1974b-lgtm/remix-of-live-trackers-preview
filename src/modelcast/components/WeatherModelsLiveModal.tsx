import { useMemo, useState } from 'react';
import { BarChart3, FlaskConical, Search, Star, Trophy, X } from 'lucide-react';
import type { DailyForecast, GeoLocation, ModelAccuracy, VoteAggregate } from '@/modelcast/lib/types';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { VotingPanel } from '@/modelcast/components/VotingPanel';
import { DailyForecastComparison } from '@/modelcast/components/DailyForecastComparison';
import { RankMedal } from '@/modelcast/components/RankMedal';

interface WeatherModelsLiveModalProps {
  open: boolean;
  onClose: () => void;
  location: GeoLocation;
  localVotes: VoteAggregate[];
  globalVotes: VoteAggregate[];
  accuracy: ModelAccuracy[];
  onVoted: () => void;
  daily?: DailyForecast | null;
}

interface ModelScore {
  id: string;
  name: string;
  shortName: string;
  color: string;
  score: number;
  voteRating: number;
  voteCount: number;
  accuracyScore: number | null;
  accuracyRank: number | null;
}

export function WeatherModelsLiveModal({
  open,
  onClose,
  location,
  localVotes,
  globalVotes,
  accuracy,
  onVoted,
  daily,
}: WeatherModelsLiveModalProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setTab] = useState<'forecast' | 'ranking'>('forecast');

  const scoredModels = useMemo<ModelScore[]>(() => {
    return WEATHER_MODELS.map((model) => {
      const localVote = localVotes.find((vote) => vote.model_id === model.id);
      const globalVote = globalVotes.find((vote) => vote.model_id === model.id);
      const vote = localVote ?? globalVote;
      const voteWeight = localVote ? 50 : globalVote ? 30 : 0;
      const accuracyResult = accuracy.find((result) => result.modelId === model.id && result.hasData);
      const accuracyWeight = accuracyResult ? 50 : 0;
      const voteScore = vote ? (vote.avg_rating / 5) * voteWeight : 0;
      const accuracyScore = accuracyResult?.overallScore ?? null;

      return {
        id: model.id,
        name: model.name,
        shortName: model.shortName,
        color: model.color,
        score: voteScore + (accuracyResult ? (accuracyResult.overallScore / 100) * 50 : 0),
        voteRating: vote?.avg_rating ?? 0,
        voteCount: vote?.vote_count ?? 0,
        accuracyScore,
        accuracyRank: accuracyResult?.rank ?? null,
      };
    }).sort((a, b) => b.score - a.score);
  }, [accuracy, globalVotes, localVotes]);

  const filteredModels = scoredModels.filter((model) => {
    const query = search.trim().toLowerCase();
    return !query || model.name.toLowerCase().includes(query) || model.shortName.toLowerCase().includes(query);
  });
  const topModel = scoredModels[0];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-700/70 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">Live model comparison</p>
            <h2 className="mt-1 text-2xl font-bold text-white">Weather models</h2>
            <p className="mt-1 text-sm text-slate-400">
              {location.name} · Top model: <span className="font-semibold text-emerald-400">{topModel?.name ?? 'Waiting for data'}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {([
              { id: 'forecast' as const, label: '7-Day Multi-Model Forecast' },
              { id: 'ranking' as const, label: 'Accuracy & Rankings' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-white'
                    : 'border border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'forecast' && (
            <section>
              <h3 className="mb-3 text-lg font-bold text-white">7-day model comparison · {location.name}</h3>
              {daily ? (
                <DailyForecastComparison data={daily} />
              ) : (
                <p className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-6 text-center text-sm text-slate-400">
                  Loading the forecast for {location.name}…
                </p>
              )}
            </section>
          )}

          {activeTab === 'ranking' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-white"><BarChart3 size={19} className="text-sky-400" /> Combined ranking</h3>
                  <p className="mt-1 text-sm text-slate-400">Historical accuracy and votes each contribute to the ranking.</p>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-400">
                  <Search size={16} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models" className="w-32 bg-transparent text-white outline-none placeholder:text-slate-500" />
                </label>
              </div>

              <div className="space-y-2">
                {filteredModels.map((model, index) => (
                  <div key={model.id} className={`rounded-2xl border p-4 ${index === 0 && !search ? 'border-amber-400/70 bg-amber-400/5' : 'border-slate-700/60 bg-slate-800/40'}`}>
                    <div className="flex items-center gap-3">
                      {index < 3 && !search ? (
                        <RankMedal rank={index + 1} className="h-8 w-8" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-300">
                          {index + 1}
                        </div>
                      )}
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: model.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">{model.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400" /> {model.voteRating > 0 ? `${model.voteRating.toFixed(1)} (${model.voteCount})` : 'No votes'}</span>
                          <span className="flex items-center gap-1"><FlaskConical size={12} className="text-emerald-400" /> {model.accuracyScore !== null ? `${model.accuracyScore.toFixed(1)}/100${model.accuracyRank ? ` · #${model.accuracyRank}` : ''}` : 'Accuracy pending'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-emerald-400">{model.score.toFixed(1)}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">combined</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside>
              <VotingPanel location={location} votes={localVotes} onVoted={onVoted} />
            </aside>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
