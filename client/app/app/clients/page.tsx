'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ClientRow } from '../../../lib/api';
import { useStaff } from '../../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../../components/ErrorNote';
import { formatDate } from '../../../components/StatusBadge';

export default function ClientsPage() {
  const { orgId, refreshBilling } = useStaff();
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', companyName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ clients: ClientRow[] }>('/clients', { orgId }).then((d) => setClients(d.clients)).catch(setError);
  }, [orgId]);
  useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/clients', { method: 'POST', orgId, body: { ...form, companyName: form.companyName || undefined } });
      setNotice(`Invite sent to ${form.email}.`);
      setForm({ fullName: '', email: '', companyName: '' });
      setOpen(false);
      load();
      refreshBilling();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resend(c: ClientRow) {
    setError(null);
    try {
      await api(`/clients/${c.userId}/resend-invite`, { method: 'POST', orgId });
      setNotice(`Invite re-sent to ${c.email}.`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients" subtitle="People who can sign in to your branded portal."
        action={<button className="btn btn-primary" onClick={() => { setOpen(!open); setNotice(null); }}>{open ? 'Cancel' : 'Invite client'}</button>}
      />

      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      {open && (
        <form onSubmit={invite} className="card mb-6 grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <label htmlFor="c-name" className="mb-1 block text-sm font-medium">Name</label>
            <input id="c-name" className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="c-email" className="mb-1 block text-sm font-medium">Email</label>
            <input id="c-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="c-co" className="mb-1 block text-sm font-medium">Company (optional)</label>
            <input id="c-co" className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
            <p className="mt-2 text-xs text-slate-500">They&apos;ll get a passwordless sign-in link to your portal.</p>
          </div>
        </form>
      )}

      <ErrorNote error={error} />
      {!clients && !error && <p className="text-slate-500">Loading…</p>}
      {clients?.length === 0 && <div className="card p-10 text-center text-slate-500">No clients yet. Invite your first client to get started.</div>}
      {clients && clients.length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Projects</th><th className="px-4 py-3 font-medium">Added</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.userId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{c.fullName}</p><p className="text-xs text-slate-500">{c.email}</p></td>
                  <td className="px-4 py-3 text-slate-600">{c.companyName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.projectCount}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right"><button className="btn btn-secondary" onClick={() => resend(c)}>Resend invite</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
