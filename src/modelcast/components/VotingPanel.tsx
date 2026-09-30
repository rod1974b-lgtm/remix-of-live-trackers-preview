import { useState } from 'react';
import { Star, ThumbsUp, Loader2, Check } from 'lucide-react';
import type { GeoLocation, VoteAggregate } from '@/modelcast/lib/types';
import { WEATHER_MODELS } from '@/modelcast/lib/weatherModels';
import { supabase } from '@/modelcast/lib/supabase';
import { useSettings } from '@/modelcast/lib/settings';

interface VotingPanelProps {
  location: GeoLocation;
  votes: VoteAggregate[];
  onVoted: () => void;
}

export function VotingPanel({ location, votes, onVoted }: VotingPanelProps) {
  const { t } = useSettings();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voteMap = new Map(votes.map((v) => [v.model_id, v]));

  const handleSubmit = async () => {
    if (!selectedModel || rating === 0) return;
    setSubmitting(true);
    setError(null);

    const model = WEATHER_MODELS.find((m) => m.id === selectedModel);
    if (!model) return;

    try {
      const { error: insertError } = await supabase.from('model_votes').insert({
        model_id: model.id,
        model_name: model.name,
        location_name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        country: location.country,
        rating,
      });

      if (insertError) throw insertError;

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setSelectedModel(null);
        setRating(0);
        onVoted();
      }, 1500);
    } catch {
      setError(t('voteFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const ratingLabel = (r: number) =>
    r === 5 ? t('excellent') : r === 4 ? t('good') : r === 3 ? t('average') : r === 2 ? t('poor') : t('veryPoor');

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{t('voteTitle', { location: location.name })}</h3>
        <p className="text-sm text-slate-400">{t('voteDesc')}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WEATHER_MODELS.map((model) => {
          const agg = voteMap.get(model.id);
          const selected = selectedModel === model.id;
          return (
            <button
              key={model.id}
              onClick={() => setSelectedModel(model.id)}
              className={`rounded-2xl border p-3 text-left transition-all ${
                selected
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: model.color }} />
                <span className="truncate text-sm font-medium text-slate-200">{model.shortName}</span>
              </div>
              {agg && (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span>{agg.avg_rating.toFixed(1)}</span>
                  <span className="text-slate-600">({agg.vote_count})</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedModel && (
        <div className="mb-4 rounded-2xl bg-slate-800/60 p-4">
          <p className="mb-2 text-sm text-slate-300">
            {t('rateModel')}{' '}
            <span className="font-semibold text-white">
              {WEATHER_MODELS.find((m) => m.id === selectedModel)?.name}
            </span>
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={
                    (hoverRating || rating) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-600'
                  }
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm font-medium text-amber-400">
                {ratingLabel(rating)}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!selectedModel || rating === 0 || submitting || submitted}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-3 font-semibold text-white transition-all hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
      >
        {submitted ? (
          <>
            <Check size={20} />
            {t('voteSubmitted')}
          </>
        ) : submitting ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            {t('submitting')}
          </>
        ) : (
          <>
            <ThumbsUp size={20} />
            {t('submitVote')}
          </>
        )}
      </button>
    </div>
  );
}
