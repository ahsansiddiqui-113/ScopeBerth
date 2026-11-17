'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ClientRow, StaffProject } from '../../../lib/api';
import { useStaff } from '../../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../../components/ErrorNote';
import { formatDate, StatusBadge } from '../../../components/StatusBadge';

export default function ProjectsPage() {
  const { orgId, refreshBilling } = useStaff();
  const [projects, setProjects] = useState<StaffProject[] | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clientUserId: '', title: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ projects: StaffProject[] }>('/projects', { orgId }),
      api<{ clients: ClientRow[] }>('/clients', { orgId }),
    ]).then(([p, c]) => { setProjects(p.projects); setClients(c.clients); }).catch(setError);
  }, [orgId]);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/projects', { method: 'POST', orgId, body: { ...form, dueDate: form.dueDate || undefined } });
      setForm({ clientUserId: '', title: '', dueDate: '' });
      setOpen(false);
      load();
      refreshBilling();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects" subtitle="Work in progress across all clients."
        action={<button className="btn btn-primary" onClick={() => setOpen(!open)} disabled={clients.length === 0} title={clients.length === 0 ? 'Invite a client first' : undefined}>{open ? 'Cancel' : 'New project'}</button>}
      />

      {open && (
        <form onSubmit={create} className="card mb-6 grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <label htmlFor="p-client" className="mb-1 block text-sm font-medium">Client</label>
            <select id="p-client" className="input" required value={form.clientUserId} onChange={(e) => setForm({ ...form, clientUserId: e.target.value })}>
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.userId} value={c.userId}>{c.fullName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="p-title" className="mb-1 block text-sm font-medium">Title</label>
            <input id="p-title" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="p-due" className="mb-1 block text-sm font-medium">Due date (optional)</label>
            <input id="p-due" type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="sm:col-span-3"><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button></div>
        </form>
      )}

      <ErrorNote error={error} />
      {!projects && !error && <p className="text-slate-500">Loading…</p>}
      {projects?.length === 0 && <div className="card p-10 text-center text-slate-500">No projects yet. They&apos;re created automatically when a client signs a proposal, or you can add one manually.</div>}
      {projects && projects.length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Project</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Progress</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 font-medium">Status</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium"><Link href={`/app/projects/${p.id}`} className="hover:underline">{p.title}</Link></td>
                  <td className="px-4 py-3 text-slate-600">{p.clientName}</td>
                  <td className="px-4 py-3 text-slate-600">{p.approvedCount}/{p.milestoneCount} milestones{p.pendingApprovals > 0 && <span className="ml-2 text-amber-700">· {p.pendingApprovals} to approve</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.dueDate) ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
