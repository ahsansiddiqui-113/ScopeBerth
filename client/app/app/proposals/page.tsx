'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money, ProposalRow } from '../../../lib/api';
import { useStaff } from '../../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../../components/ErrorNote';
import { formatDate, StatusBadge } from '../../../components/StatusBadge';

export default function ProposalsPage() {
  const { orgId, refreshBilling } = useStaff();
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    api<{ proposals: ProposalRow[] }>('/proposals', { orgId }).then((d) => setProposals(d.proposals)).catch(setError);
  }, [orgId]);
  useEffect(load, [load]);

  async function send(id: string) {
    setError(null);
    try {
      await api(`/proposals/${id}/send`, { method: 'POST', orgId });
      load();
      refreshBilling();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Proposals" subtitle="Itemised proposals clients can accept and sign online."
        action={<Link href="/app/proposals/new" className="btn btn-primary">New proposal</Link>}
      />
      <ErrorNote error={error} />
      {!proposals && !error && <p className="text-slate-500">Loading…</p>}
      {proposals?.length === 0 && <div className="card p-10 text-center text-slate-500">No proposals yet. Create one and send it to a client.</div>}
      {proposals && proposals.length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Proposal</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{p.title}</p><p className="text-xs text-slate-500">{p.status === 'signed' ? `Signed by ${p.signedByName} on ${formatDate(p.signedAt)}` : `Created ${formatDate(p.createdAt)}`}</p></td>
                  <td className="px-4 py-3 text-slate-600">{p.clientName}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(p.totalAmount, p.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} label={p.status === 'sent' ? 'Awaiting signature' : undefined} /></td>
                  <td className="px-4 py-3 text-right">{p.status === 'draft' && <button className="btn btn-primary" onClick={() => send(p.id)}>Send</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
