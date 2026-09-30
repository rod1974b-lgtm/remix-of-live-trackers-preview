import { Trophy, Star, Users } from 'lucide-react';
import type { VoteAggregate } from '@/modelcast/lib/types';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { useSettings } from '@/modelcast/lib/settings';
import { RankMedal } from '@/modelcast/components/RankMedal';

interface LeaderboardProps {
  votes: VoteAggregate[];
  scope: 'global' | 'local';
  locationName?: string;
}

export function Leaderboard({ votes, scope, locationName }: LeaderboardProps) {
  const { t } = useSettings();
  const sorted = [...votes].sort((a, b) => {
    if (b.avg_rating !== a.avg_rating) return b.avg_rating - a.avg_rating;
    return b.vote_count - a.vote_count;
  });

  const modelColor = (id: string) => WEATHER_MODELS.find((m) => m.id === id)?.color ?? '#64748b';

  const title = scope === 'local' && locationName
    ? t('bestModelLocal', { location: locationName })
    : t('globalBest');

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={20} className="text-amber-400" />
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center">
          <Users size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">
            {scope === 'local' ? t('noVotesLocal') : t('noVotesGlobal')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((vote, i) => (
            <div
              key={vote.model_id}
              className={`flex items-center gap-3 rounded-2xl p-3 transition-colors ${
                i === 0
                  ? 'bg-amber-500/10 border border-amber-500/30'
                  : 'bg-slate-800/40'
              }`}
            >
              {i < 3 ? (
                <RankMedal rank={i + 1} className="h-8 w-8" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-slate-300">
                  {i + 1}
                </div>
              )}
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: modelColor(vote.model_id) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-200">{vote.model_name}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-100">{vote.avg_rating.toFixed(1)}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {vote.vote_count} {vote.vote_count === 1 ? t('vote') : t('votes')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
