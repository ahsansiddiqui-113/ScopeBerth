'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money, Proposal } from '../../../../lib/api';
import { usePortal } from '../../../../components/PortalProvider';
import { formatDate, StatusBadge } from '../../../../components/StatusBadge';

export default function ProposalsPage() {
  const { orgId, branding } = usePortal();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ proposals: Proposal[] }>('/proposals', { orgId })
      .then((d) => setProposals(d.proposals))
      .catch((e) => setError(e.message));
  }, [orgId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Proposals</h1>
      {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
      {!proposals && !error && <p className="mt-6 text-slate-500">Loading…</p>}
      {proposals?.length === 0 && (
        <div className="card mt-6 p-10 text-center text-slate-500">No proposals yet.</div>
      )}
      <ul className="mt-6 space-y-3">
        {proposals?.map((p) => (
          <li key={p.id}>
            <Link
              href={`/portal/${branding.slug}/proposals/${p.id}`}
              className="card flex flex-wrap items-center justify-between gap-3 p-5 transition hover:border-brand hover:shadow-md"
            >
              <div>
                <p className="font-semibold">{p.title}</p>
                <p className="text-sm text-slate-500">Sent {formatDate(p.sentAt)} · {money(p.totalAmount, p.currency)}</p>
              </div>
              <StatusBadge status={p.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
