'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, Deliverable, Milestone } from '../../../../lib/api';
import { useStaff } from '../../../../components/StaffProvider';
import { ErrorNote } from '../../../../components/ErrorNote';
import { formatBytes, formatDate, StatusBadge } from '../../../../components/StatusBadge';

type Project = { id: string; title: string; description: string | null; status: string; due_date: string | null };
const STATUSES = ['active', 'in_review', 'completed', 'archived'];

export default function StaffProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { orgId, refreshBilling } = useStaff();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [newMilestone, setNewMilestone] = useState('');
  const [upload, setUpload] = useState<{ title: string; milestoneId: string; file: File | null }>({ title: '', milestoneId: '', file: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        api<{ project: Project; milestones: Milestone[] }>(`/projects/${id}`, { orgId }),
        api<{ deliverables: Deliverable[] }>(`/projects/${id}/deliverables`, { orgId }),
      ]);
      setProject(p.project); setMilestones(p.milestones); setDeliverables(d.deliverables);
    } catch (e) { setError(e); }
  }, [id, orgId]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); refreshBilling(); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const setStatus = (status: string) => run(() => api(`/projects/${id}`, { method: 'PATCH', orgId, body: { status } }));
  const addMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api(`/projects/${id}/milestones`, { method: 'POST', orgId, body: { title: newMilestone } });
      setNewMilestone('');
    });
  };

  // Direct-to-storage upload: presign -> PUT file -> register deliverable for client approval.
  const uploadFile = (e: React.FormEvent) => {
    e.preventDefault();
    const file = upload.file;
    if (!file) return;
    run(async () => {
      const { uploadUrl, fileKey } = await api<{ uploadUrl: string; fileKey: string }>(
        `/projects/${id}/deliverables/upload-url`,
        { method: 'POST', orgId, body: { fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size } }
      );
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      if (!put.ok) throw new Error('Upload to storage failed');
      await api(`/projects/${id}/deliverables`, {
        method: 'POST', orgId,
        body: { title: upload.title || file.name, fileKey, fileSizeBytes: file.size, milestoneId: upload.milestoneId || undefined },
      });
      setUpload({ title: '', milestoneId: '', file: null });
    });
  };

  if (!project) return error ? <ErrorNote error={error} /> : <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <Link href="/app/projects" className="text-sm text-slate-500 hover:text-slate-800">← All projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          {project.description && <p className="mt-1 max-w-2xl text-slate-600">{project.description}</p>}
          {project.due_date && <p className="mt-1 text-sm text-slate-500">Due {formatDate(project.due_date)}</p>}
        </div>
        <label className="text-sm">
          <span className="mr-2 text-slate-500">Status</span>
          <select className="input !inline-block !w-auto" value={project.status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4"><ErrorNote error={error} /></div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Milestones</h2>
      <div className="card divide-y divide-slate-100">
        {milestones.length === 0 && <p className="p-5 text-sm text-slate-500">No milestones yet.</p>}
        {milestones.map((m, i) => (
          <div key={m.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{i + 1}. {m.title}</p>
              <StatusBadge status={m.status === 'awaiting_approval' ? 'in_review' : m.status} />
            </div>
            <div className="mt-2 space-y-2">
              {deliverables.filter((d) => d.milestoneId === m.id).map((d) => <DeliverableRow key={d.id} d={d} />)}
            </div>
          </div>
        ))}
        <form onSubmit={addMilestone} className="flex gap-2 p-4">
          <input className="input" placeholder="Add a milestone…" aria-label="New milestone title" required value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} />
          <button className="btn btn-secondary" disabled={busy}>Add</button>
        </form>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Send a deliverable for approval</h2>
      <form onSubmit={uploadFile} className="card grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <label htmlFor="d-file" className="mb-1 block text-sm font-medium">File</label>
          <input id="d-file" type="file" required className="text-sm" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} />
        </div>
        <div>
          <label htmlFor="d-title" className="mb-1 block text-sm font-medium">Title</label>
          <input id="d-title" className="input" placeholder="Defaults to file name" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} />
        </div>
        <div>
          <label htmlFor="d-ms" className="mb-1 block text-sm font-medium">Milestone</label>
          <select id="d-ms" className="input" value={upload.milestoneId} onChange={(e) => setUpload({ ...upload, milestoneId: e.target.value })}>
            <option value="">None</option>
            {milestones.filter((m) => m.status !== 'approved').map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3"><button className="btn btn-primary" disabled={busy || !upload.file}>{busy ? 'Uploading…' : 'Upload & request approval'}</button></div>
      </form>

      {deliverables.some((d) => !d.milestoneId) && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Other files</h2>
          <div className="card space-y-2 p-4">{deliverables.filter((d) => !d.milestoneId).map((d) => <DeliverableRow key={d.id} d={d} />)}</div>
        </>
      )}
    </div>
  );
}

function DeliverableRow({ d }: { d: Deliverable }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{d.title} <span className="text-xs text-slate-500">{formatBytes(d.fileSizeBytes)}</span></span>
        <StatusBadge status={d.status === 'pending_approval' ? 'in_review' : d.status} />
      </div>
      {d.clientFeedback && <p className="mt-1 text-orange-800">Client feedback: {d.clientFeedback}</p>}
    </div>
  );
}
