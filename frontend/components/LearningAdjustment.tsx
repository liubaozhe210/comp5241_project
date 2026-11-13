'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, errorText } from '@/lib/api';

type Adjustment = { id: string; kind: string; reason: string; applied: boolean; applied_at: string | null;
  stale: boolean; read_only: boolean; original_budget: number; extra_minutes: number;
  before_minutes: number; after_minutes: number;
  new_tasks: { title: string; instructions: string; minutes: number }[];
  changes: { task_id: string; title: string; before: number; after: number }[] };
type State = { adjustment: Adjustment | null; latest: boolean; read_only: boolean };

export function LearningAdjustment({ pathId, attemptId, onApplied }: { pathId: string; attemptId: string; onApplied?: () => void }) {
  const t = useTranslations();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extraConfirmed, setExtraConfirmed] = useState(false);
  const [retry, setRetry] = useState(0);
  const epoch = useRef(0);
  const base = `/learning-paths/${pathId}/attempts/${attemptId}/adjustment`;
  useEffect(() => {
    const current = ++epoch.current;
    setState(null); setError(''); setBusy(false); setExtraConfirmed(false);
    apiFetch<State>(base).then((value) => { if (current === epoch.current) setState(value); })
      .catch((err) => { if (current === epoch.current) setError(errorText(err, t)); });
    return () => { epoch.current += 1; };
  }, [base, t, retry]);

  async function preview() {
    const current = epoch.current;
    setBusy(true); setError(''); setExtraConfirmed(false);
    try {
      const adjustment = await apiFetch<Adjustment>(base, { method: 'POST' });
      if (current === epoch.current) setState({ adjustment, latest: true, read_only: adjustment.read_only });
    } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
    finally { if (current === epoch.current) setBusy(false); }
  }

  async function apply() {
    if (!state?.adjustment || busy) return;
    const current = epoch.current;
    setBusy(true); setError('');
    try {
      const adjustment = await apiFetch<Adjustment>(`/learning-paths/${pathId}/adjustments/${state.adjustment.id}/apply`, {
        method: 'POST', body: JSON.stringify({ allow_extra_time: extraConfirmed }),
      });
      if (current === epoch.current) { setState({ ...state, adjustment }); onApplied?.(); }
    } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
    finally { if (current === epoch.current) setBusy(false); }
  }

  const item = state?.adjustment;
  return <section className="card space-y-4 p-5">
    <h3 className="text-xl font-semibold">{t('adjustment.title')}</h3>
    <p className="text-sm text-ink-500">{t('adjustment.note')}</p>
    {error && <div role="alert"><p className="text-red-800">{error}</p>{!state && <button className="btn-ghost mt-2" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button>}</div>}
    {state && (!state.latest || state.read_only) && <p>{t('adjustment.historyOnly')}</p>}
    {state && !item && state.latest && !state.read_only && <button className="btn" disabled={busy} onClick={() => void preview()}>{t(busy ? 'common.loading' : 'adjustment.preview')}</button>}
    {item && <>
      <p>{item.reason}</p>
      <p className="text-sm">{t('adjustment.total')} {item.before_minutes} → {item.after_minutes} min · {t('adjustment.budget')} {item.original_budget} min</p>
      {item.new_tasks.map((task, index) => <article className="rounded-lg border border-black/10 p-3" key={index}>
        <p className="font-semibold">{t('adjustment.add')} {task.title} · {task.minutes} min</p><p className="mt-2 whitespace-pre-wrap text-sm text-ink-500">{task.instructions}</p>
      </article>)}
      {item.changes.length > 0 && <div><h4 className="font-semibold">{t('adjustment.timeChanges')}</h4><ul className="mt-2 space-y-2 text-sm">{item.changes.map((change) => <li key={change.task_id}>{change.title}：{change.before} → {change.after} min</li>)}</ul></div>}
      {item.stale && !item.applied && <p>{t('adjustment.stale')}</p>}
      {item.applied ? <p role="status" className="font-semibold text-accent">{t('adjustment.applied')}</p> : item.kind === 'continue' ? <p>{t('adjustment.continue')}</p> : <>
        {item.extra_minutes > 0 && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm"><input className="mt-1" type="checkbox" checked={extraConfirmed} onChange={(event) => setExtraConfirmed(event.target.checked)} />{t('adjustment.extra')} {item.extra_minutes} min</label>}
        {state?.latest && !state.read_only && <div className="flex flex-wrap gap-3">
          <button className="btn" disabled={busy || item.stale || (item.extra_minutes > 0 && !extraConfirmed)} onClick={() => void apply()}>{t(busy ? 'common.loading' : 'adjustment.apply')}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void preview()}>{t('adjustment.refresh')}</button>
        </div>}
      </>}
      {!item.applied && item.kind === 'continue' && state?.latest && !state.read_only && <button className="btn-ghost" disabled={busy} onClick={() => void preview()}>{t('adjustment.refresh')}</button>}
    </>}
  </section>;
}
