'use client';

import { useState } from 'react';
import { api, Deliverable } from '../lib/api';
import { formatBytes, formatDate, StatusBadge } from './StatusBadge';

export function DeliverableCard({
  deliverable: d, orgId, onChanged,
}: {
  deliverable: Deliverable;
  orgId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAsking(false);
      setFeedback('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const download = () =>
    run(async () => {
      const { url } = await api<{ url: string }>(`/deliverables/${d.id}/download`, { orgId });
      window.open(url, '_blank', 'noopener');
    });

  const approve = () => run(() => api(`/deliverables/${d.id}/approve`, { method: 'POST', orgId }));
  const requestChanges = () =>
    run(() => api(`/deliverables/${d.id}/request-changes`, { method: 'POST', orgId, body: { feedback } }));

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{d.title}</p>
          <p className="text-xs text-slate-500">
            Uploaded {formatDate(d.createdAt)}{d.fileSizeBytes ? ` · ${formatBytes(d.fileSizeBytes)}` : ''}
          </p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {d.status === 'changes_requested' && d.clientFeedback && (
        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <span className="font-medium">Your feedback:</span> {d.clientFeedback}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-secondary" onClick={download} disabled={busy}>Download</button>
        {d.status === 'pending_approval' && !asking && (
          <>
            <button className="btn btn-primary" onClick={approve} disabled={busy}>Approve</button>
            <button className="btn btn-secondary" onClick={() => setAsking(true)} disabled={busy}>Request changes</button>
          </>
        )}
      </div>

      {asking && (
        <div className="mt-4 space-y-2">
          <textarea
            className="input min-h-24" placeholder="What should be changed?" autoFocus
            value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={requestChanges} disabled={busy || !feedback.trim()}>Send feedback</button>
            <button className="btn btn-secondary" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
