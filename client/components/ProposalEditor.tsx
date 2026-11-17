'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ClientRow, money } from '../lib/api';
import { ErrorNote } from './ErrorNote';

type Row = { name: string; qty: string; price: string };

/** Dynamic line-item proposal builder. The server recomputes the total; the figure shown here is a preview. */
export function ProposalEditor({ clients, orgId }: { clients: ClientRow[]; orgId: string }) {
  const router = useRouter();
  const [clientUserId, setClientUserId] = useState('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [timeline, setTimeline] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [deposit, setDeposit] = useState(50);
  const [rows, setRows] = useState<Row[]>([{ name: '', qty: '1', price: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const lineTotal = (r: Row) => (Number(r.qty) || 0) * (Number(r.price) || 0);
  const total = rows.reduce((n, r) => n + lineTotal(r), 0);

  async function save(send: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api('/proposals', {
        method: 'POST', orgId,
        body: {
          clientUserId, title, scope: scope || undefined, timeline: timeline || undefined, currency,
          depositPercent: deposit, send,
          lineItems: rows.map((r) => ({ name: r.name, qty: Number(r.qty), price: Number(r.price) })),
        },
      });
      router.push('/app/proposals');
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(true); }} className="space-y-6">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pr-client" className="mb-1 block text-sm font-medium">Client</label>
          <select id="pr-client" className="input" required value={clientUserId} onChange={(e) => setClientUserId(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.userId} value={c.userId}>{c.fullName}{c.companyName ? ` — ${c.companyName}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pr-title" className="mb-1 block text-sm font-medium">Proposal title</label>
          <input id="pr-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website redesign" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pr-scope" className="mb-1 block text-sm font-medium">Scope</label>
          <textarea id="pr-scope" className="input min-h-24" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What's included…" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pr-time" className="mb-1 block text-sm font-medium">Timeline</label>
          <textarea id="pr-time" className="input min-h-16" value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="6 weeks from kickoff…" />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">Line items</h2>
        <p className="mb-4 text-sm text-slate-500">Each line item becomes a milestone when the client signs.</p>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-6">
                {i === 0 && <label className="mb-1 block text-xs text-slate-500">Item</label>}
                <input className="input" aria-label={`Item ${i + 1} name`} required value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
              </div>
              <div className="col-span-3 sm:col-span-2">
                {i === 0 && <label className="mb-1 block text-xs text-slate-500">Qty</label>}
                <input className="input" type="number" min="0.01" step="any" aria-label={`Item ${i + 1} quantity`} required value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
              </div>
              <div className="col-span-5 sm:col-span-2">
                {i === 0 && <label className="mb-1 block text-xs text-slate-500">Price</label>}
                <input className="input" type="number" min="0" step="any" aria-label={`Item ${i + 1} price`} required value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
              </div>
              <div className="col-span-4 flex items-center justify-end gap-2 sm:col-span-2">
                <span className="text-sm font-medium">{money(lineTotal(r), currency)}</span>
                {rows.length > 1 && <button type="button" className="text-slate-400 hover:text-red-600" aria-label={`Remove item ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => setRows([...rows, { name: '', qty: '1', price: '' }])}>+ Add line item</button>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
          <div className="flex gap-4">
            <div>
              <label htmlFor="pr-cur" className="mb-1 block text-xs text-slate-500">Currency</label>
              <select id="pr-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pr-dep" className="mb-1 block text-xs text-slate-500">Deposit %</label>
              <input id="pr-dep" className="input !w-24" type="number" min={1} max={100} step={1} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Total</p>
            <p className="text-2xl font-semibold">{money(total, currency)}</p>
            <p className="text-xs text-slate-500">Deposit invoice: {money((total * deposit) / 100, currency)}</p>
          </div>
        </div>
      </div>

      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Send to client'}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => save(false)}>Save as draft</button>
      </div>
    </form>
  );
}
