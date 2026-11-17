'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, InvoiceRow, money, ProposalRow, StaffProject } from '../../lib/api';
import { useStaff } from '../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../components/ErrorNote';
import { formatDate, StatusBadge } from '../../components/StatusBadge';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Overview() {
  const { orgId, user } = useStaff();
  const [projects, setProjects] = useState<StaffProject[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      api<{ projects: StaffProject[] }>('/projects', { orgId }),
      api<{ invoices: InvoiceRow[] }>('/invoices', { orgId }),
      api<{ proposals: ProposalRow[] }>('/proposals', { orgId }),
    ])
      .then(([p, i, pr]) => { setProjects(p.projects); setInvoices(i.invoices); setProposals(pr.proposals); })
      .catch(setError);
  }, [orgId]);

  if (error) return <ErrorNote error={error} />;
  if (!projects || !invoices || !proposals) return <p className="text-slate-500">Loading…</p>;

  const sum = (list: InvoiceRow[]) => list.reduce((n, i) => n + Number(i.amount), 0);
  const paid = sum(invoices.filter((i) => i.status === 'paid'));
  const outstanding = sum(invoices.filter((i) => i.status !== 'paid'));
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const active = projects.filter((p) => p.status === 'active' || p.status === 'in_review');
  const pending = projects.reduce((n, p) => n + p.pendingApprovals, 0);
  const awaitingSignature = proposals.filter((p) => p.status === 'sent');
  const drafts = proposals.filter((p) => p.status === 'draft');

  return (
    <div>
      <PageHeader title={`Welcome back, ${user.fullName.split(' ')[0]}`} subtitle="Here's where things stand." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collected" value={money(paid)} />
        <Stat label="Outstanding" value={money(outstanding)} hint={overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'} />
        <Stat label="Active projects" value={active.length} hint={`${pending} awaiting client approval`} />
        <Stat label="Proposals" value={awaitingSignature.length} hint={`awaiting signature · ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Projects</h2>
            <Link href="/app/projects" className="text-sm text-slate-500 hover:text-slate-800">View all →</Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {active.length === 0 && <p className="p-5 text-sm text-slate-500">No active projects yet.</p>}
            {active.slice(0, 5).map((p) => (
              <Link key={p.id} href={`/app/projects/${p.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="text-xs text-slate-500">{p.clientName} · {p.approvedCount}/{p.milestoneCount} milestones</p>
                </div>
                {p.pendingApprovals > 0 ? <StatusBadge status="pending_approval" /> : <StatusBadge status={p.status} />}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent invoices</h2>
            <Link href="/app/invoices" className="text-sm text-slate-500 hover:text-slate-800">View all →</Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {invoices.length === 0 && <p className="p-5 text-sm text-slate-500">No invoices yet. They&apos;re created when a client signs a proposal.</p>}
            {invoices.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{i.invoiceNumber} · {money(i.amount, i.currency)}</p>
                  <p className="truncate text-xs text-slate-500">{i.clientName} · due {formatDate(i.dueDate)}</p>
                </div>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
