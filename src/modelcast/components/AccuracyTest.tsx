import { useState } from 'react';
import { FlaskConical, Loader2, Award, TrendingDown, TrendingUp, Info } from 'lucide-react';
import type { ModelAccuracy } from '@/modelcast/lib/types';
import type { GeoLocation } from '@/modelcast/lib/types';
import { testModelAccuracy } from '@/modelcast/lib/accuracyApi';
import { useSettings } from '@/modelcast/lib/settings';
import {
  tempUnitLabel,
  windUnitLabel,
} from '@/modelcast/lib/units';

interface AccuracyTestProps {
  location: GeoLocation;
}

export function AccuracyTest({ location }: AccuracyTestProps) {
  const { t, units } = useSettings();
  const [results, setResults] = useState<ModelAccuracy[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const data = await testModelAccuracy(location.latitude, location.longitude);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test accuracy');
    } finally {
      setTesting(false);
    }
  };

  const hasResults = results !== null && results.some((r) => r.hasData);

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-slate-800/40 p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <FlaskConical size={20} className="text-emerald-400" />
            {t('accuracyTitle')}
          </h3>
          <p className="mt-1 text-sm text-slate-400">{t('accuracyDesc')}</p>
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 font-semibold text-white transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          {testing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {t('testing')}
            </>
          ) : (
            <>
              <FlaskConical size={18} />
              {t('testAccuracy')}
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      )}

      {hasResults && results && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-700/60">
                <th className="p-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyRank')}
                </th>
                <th className="p-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyModel')}
                </th>
                <th className="p-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyTemp')} ({tempUnitLabel(units)})
                </th>
                <th className="p-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyHumidity')} (%)
                </th>
                <th className="p-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyWind')} ({windUnitLabel(units)})
                </th>
                <th className="p-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('accuracyOverall')}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.filter((r) => r.hasData).map((r) => (
                <tr
                  key={r.modelId}
                  className={`border-b border-slate-700/30 transition-colors hover:bg-slate-700/20 ${
                    r.rank === 1 ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="p-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      r.rank === 1 ? 'bg-emerald-400 text-emerald-950' :
                      r.rank === 2 ? 'bg-slate-300 text-slate-800' :
                      r.rank === 3 ? 'bg-orange-700 text-orange-100' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {r.rank <= 3 ? <Award size={14} /> : r.rank}
                    </div>
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-sm font-medium text-slate-200">{r.shortName}</span>
                    </div>
                  </td>
                  <td className="p-2.5 text-center">
                    <MetricCell metric={r.temperature} units={units} isTemp />
                  </td>
                  <td className="p-2.5 text-center">
                    <MetricCell metric={r.humidity} units={units} />
                  </td>
                  <td className="p-2.5 text-center">
                    <MetricCell metric={r.windSpeed} units={units} isWind />
                  </td>
                  <td className="p-2.5 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className={`text-lg font-bold ${
                        r.overallScore >= 75 ? 'text-emerald-400' :
                        r.overallScore >= 50 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {r.overallScore.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-500">/100</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <TrendingDown size={12} className="text-emerald-400" />
              {t('accuracyRMSE')}: {t('accuracyLowerBetter')}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp size={12} className="text-sky-400" />
              {t('accuracyOverall')}: {t('accuracyScoreBetter')}
            </span>
          </div>
        </div>
      )}

      {results && !hasResults && !error && (
        <div className="py-8 text-center">
          <Info size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">{t('accuracyNoData')}</p>
        </div>
      )}

      {!results && !testing && !error && (
        <div className="py-8 text-center">
          <FlaskConical size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-500">
            {t('accuracyDesc')}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCell({
  metric,
  units,
  isTemp = false,
  isWind = false,
}: {
  metric: { rmse: number; bias: number; count: number };
  units: 'metric' | 'us';
  isTemp?: boolean;
  isWind?: boolean;
}) {
  if (metric.count === 0 || isNaN(metric.rmse)) {
    return <span className="text-sm text-slate-600">—</span>;
  }

  let rmseDisplay = metric.rmse;
  let biasDisplay = metric.bias;

  if (isTemp && units === 'us') {
    rmseDisplay = metric.rmse * 1.8;
    biasDisplay = metric.bias * 1.8;
  }
  if (isWind && units === 'us') {
    rmseDisplay = metric.rmse * 0.621371;
    biasDisplay = metric.bias * 0.621371;
  }

  const biasSign = biasDisplay >= 0 ? '+' : '';
  const biasColor = Math.abs(biasDisplay) < 0.5 ? 'text-emerald-400' : Math.abs(biasDisplay) < 2 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className="text-sm font-semibold text-slate-200">
        {rmseDisplay.toFixed(isTemp ? 1 : 1)}
      </span>
      <span className={`text-xs ${biasColor}`}>
        {biasSign}{biasDisplay.toFixed(1)}
      </span>
    </div>
  );
}
