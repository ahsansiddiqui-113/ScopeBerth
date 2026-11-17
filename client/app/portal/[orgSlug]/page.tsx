'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ProjectSummary } from '../../../lib/api';
import { usePortal } from '../../../components/PortalProvider';
import { formatDate, StatusBadge } from '../../../components/StatusBadge';

export default function PortalHome() {
  const { orgId, branding, user } = usePortal();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ projects: ProjectSummary[] }>('/projects', { orgId })
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message));
  }, [orgId]);

  const awaiting = projects?.reduce((n, p) => n + p.pendingApprovals, 0) ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {user.fullName.split(' ')[0]}</h1>
      <p className="mt-1 text-slate-600">Your projects with {branding.name}.</p>

      {awaiting > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {awaiting} {awaiting === 1 ? 'deliverable needs' : 'deliverables need'} your review.
        </div>
      )}

      {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
      {!projects && !error && <p className="mt-6 text-slate-500">Loading projects…</p>}
      {projects?.length === 0 && (
        <div className="card mt-6 p-10 text-center text-slate-500">No projects yet. You&apos;ll see them here once they start.</div>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {projects?.map((p) => {
          const pct = p.milestoneCount ? Math.round((p.approvedCount / p.milestoneCount) * 100) : 0;
          return (
            <li key={p.id}>
              <Link href={`/portal/${branding.slug}/projects/${p.id}`} className="card block p-5 transition hover:border-brand hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{p.title}</h2>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>{p.approvedCount} of {p.milestoneCount} milestones approved</span>
                  {p.dueDate && <span>Due {formatDate(p.dueDate)}</span>}
                </div>
                {p.pendingApprovals > 0 && (
                  <p className="mt-3 text-sm font-medium text-amber-700">Needs your approval →</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
