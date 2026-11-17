'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ClientRow, InvoiceRow, money, StaffProject } from '../../../lib/api';
import { useStaff } from '../../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../../components/ErrorNote';
import { formatDate, StatusBadge } from '../../../components/StatusBadge';

const FILTERS = ['all', 'unpaid', 'overdue', 'paid'] as const;

export default function InvoicesPage() {
  const { orgId } = useStaff();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<StaffProject[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clientUserId: '', projectId: '', amount: '', dueDate: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ invoices: InvoiceRow[] }>('/invoices', { orgId }),
      api<{ clients: ClientRow[] }>('/clients', { orgId }),
      api<{ projects: StaffProject[] }>('/projects', { orgId }),
    ]).then(([i, c, p]) => { setInvoices(i.invoices); setClients(c.clients); setProjects(p.projects); }).catch(setError);
  }, [orgId]);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/invoices', {
        method: 'POST', orgId,
        body: { ...form, amount: Number(form.amount), projectId: form.projectId || undefined, description: form.description || undefined },
      });
      setForm({ clientUserId: '', projectId: '', amount: '', dueDate: '', description: '' });
      setOpen(false);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    setError(null);
    try {
      await api(`/invoices/${id}/mark-paid`, { method: 'POST', orgId });
      load();
    } catch (err) {
      setError(err);
    }
  }

  const shown = invoices?.filter((i) => filter === 'all' || i.status === filter);
  const clientProjects = projects.filter((p) => p.clientUserId === form.clientUserId);

  return (
    <div>
      <PageHeader
        title="Invoices" subtitle="Deposit invoices are created automatically when a proposal is signed."
        action={<button className="btn btn-primary" onClick={() => setOpen(!open)} disabled={clients.length === 0}>{open ? 'Cancel' : 'New invoice'}</button>}
      />

      {open && (
        <form onSubmit={create} className="card mb-6 grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="i-client" className="mb-1 block text-sm font-medium">Client</label>
            <select id="i-client" className="input" required value={form.clientUserId} onChange={(e) => setForm({ ...form, clientUserId: e.target.value, projectId: '' })}>
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.userId} value={c.userId}>{c.fullName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="i-proj" className="mb-1 block text-sm font-medium">Project (optional)</label>
            <select id="i-proj" className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} disabled={!form.clientUserId}>
              <option value="">None</option>
              {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="i-amt" className="mb-1 block text-sm font-medium">Amount (USD)</label>
            <input id="i-amt" type="number" min="0.01" step="0.01" className="input" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label htmlFor="i-due" className="mb-1 block text-sm font-medium">Due date</label>
            <input id="i-due" type="date" className="input" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="i-desc" className="mb-1 block text-sm font-medium">Description</label>
            <input id="i-desc" className="input" placeholder="Milestone 2 — design approval" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create invoice'}</button></div>
        </form>
      )}

      <div role="tablist" aria-label="Filter invoices" className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm capitalize ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >{f}</button>
        ))}
      </div>

      <ErrorNote error={error} />
      {!invoices && !error && <p className="text-slate-500">Loading…</p>}
      {shown?.length === 0 && <div className="card p-10 text-center text-slate-500">No {filter === 'all' ? '' : filter} invoices.</div>}
      {shown && shown.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{i.invoiceNumber}</p>{i.description && <p className="text-xs text-slate-500">{i.description}</p>}</td>
                  <td className="px-4 py-3 text-slate-600">{i.clientName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(i.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(i.amount, i.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-3 text-right">{i.status !== 'paid' && <button className="btn btn-secondary" onClick={() => markPaid(i.id)}>Mark paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
