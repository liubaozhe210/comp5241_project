'use client';

import { useState } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="label mb-2">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3" role="tablist">
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === item.value}
          key={item.value}
          onClick={() => onChange(item.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            value === item.value ? 'bg-accent text-ivory-50' : 'bg-ivory-100 text-ink-700 hover:bg-ivory-300'
          }`}
        >
          {item.label}
          {item.count !== undefined ? <span className="ml-1.5 opacity-70">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-ivory-100/70 px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-500">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-red-800/25 bg-red-50 px-4 py-3 text-sm text-red-900">
      {children}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="card flex items-center gap-3 p-5 text-sm text-ink-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
      {label}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" className="btn-ghost px-2 py-1 text-sm" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmButton({
  title,
  message,
  confirmLabel,
  cancelLabel,
  failureLabel = 'The action failed. Please try again.',
  onConfirm,
  danger = false,
  disabled = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  failureLabel?: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setError(failureLabel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={danger ? 'btn-ghost border-red-800/30 px-3 py-2 text-xs text-red-800' : 'btn-ghost px-3 py-2 text-xs'}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {confirmLabel}
      </button>
      {open ? (
        <Modal title={title} onClose={() => !busy && setOpen(false)}>
          <p className="text-sm leading-6 text-ink-700">{message}</p>
          {error ? <div role="alert" className="mt-4 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
              {cancelLabel}
            </button>
            <button type="button" className={danger ? 'btn bg-red-800 hover:bg-red-900' : 'btn'} disabled={busy} onClick={() => void confirm()}>
              {busy ? '…' : confirmLabel}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'badge-ok' : score >= 60 ? 'badge-warn' : 'badge-err';
  return <span className={`badge ${tone}`}>{score}/100</span>;
}

export function formatDate(value: string, locale: 'en' | 'zh') {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-Hans' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
