'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, Deliverable, Milestone } from '../../../../../lib/api';
import { usePortal } from '../../../../../components/PortalProvider';
import { DeliverableCard } from '../../../../../components/DeliverableCard';
import { formatDate, StatusBadge } from '../../../../../components/StatusBadge';

type Project = { id: string; title: string; description: string | null; status: string; due_date: string | null };

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { orgId, branding } = usePortal();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        api<{ project: Project; milestones: Milestone[] }>(`/projects/${id}`, { orgId }),
        api<{ deliverables: Deliverable[] }>(`/projects/${id}/deliverables`, { orgId }),
      ]);
      setProject(p.project);
      setMilestones(p.milestones);
      setDeliverables(d.deliverables);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load project');
    }
  }, [id, orgId]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!project) return <p className="text-slate-500">Loading…</p>;

  const unassigned = deliverables.filter((d) => !d.milestoneId);

  return (
    <div>
      <Link href={`/portal/${branding.slug}`} className="text-sm text-slate-500 hover:text-slate-800">← All projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          {project.description && <p className="mt-1 max-w-2xl text-slate-600">{project.description}</p>}
        </div>
        <div className="text-right">
          <StatusBadge status={project.status} />
          {project.due_date && <p className="mt-1 text-xs text-slate-500">Due {formatDate(project.due_date)}</p>}
        </div>
      </div>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Milestones</h2>
      {milestones.length === 0 && <p className="text-slate-500">No milestones have been added yet.</p>}
      <ol className="space-y-6">
        {milestones.map((m, i) => {
          const items = deliverables.filter((d) => d.milestoneId === m.id);
          return (
            <li key={m.id} className="flex gap-4">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  m.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                }`}
                aria-hidden
              >
                {m.status === 'approved' ? '✓' : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-medium">{m.title}</h3>
                  <StatusBadge status={m.status} />
                  {m.dueDate && <span className="text-xs text-slate-500">Due {formatDate(m.dueDate)}</span>}
                </div>
                {m.description && <p className="mt-1 text-sm text-slate-600">{m.description}</p>}
                {items.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {items.map((d) => <DeliverableCard key={d.id} deliverable={d} orgId={orgId} onChanged={load} />)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {unassigned.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 text-lg font-semibold">Files</h2>
          <div className="space-y-3">
            {unassigned.map((d) => <DeliverableCard key={d.id} deliverable={d} orgId={orgId} onChanged={load} />)}
          </div>
        </>
      )}
    </div>
  );
}
