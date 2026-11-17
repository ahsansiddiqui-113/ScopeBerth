'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, money, Proposal } from '../../../../../lib/api';
import { usePortal } from '../../../../../components/PortalProvider';
import { formatDate, StatusBadge } from '../../../../../components/StatusBadge';

export default function ProposalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { orgId, branding, user } = usePortal();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ proposal: Proposal }>(`/proposals/${id}`, { orgId })
      .then((d) => setProposal(d.proposal))
      .catch((e) => setError(e.message));
  }, [id, orgId]);
  useEffect(load, [load]);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ projectId: string }>(`/proposals/${id}/sign`, {
        method: 'POST', orgId, body: { signedName: name },
      });
      router.push(`/portal/${branding.slug}/projects/${res.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
      setBusy(false);
    }
  }

  async function decline() {
    if (!window.confirm('Decline this proposal? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/proposals/${id}/decline`, { method: 'POST', orgId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusy(false);
    }
  }

  if (error && !proposal) return <p role="alert" className="text-red-600">{error}</p>;
  if (!proposal) return <p className="text-slate-500">Loading…</p>;

  const deposit = (Number(proposal.totalAmount) * proposal.depositPercent) / 100;
  const nameMatches = name.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/portal/${branding.slug}/proposals`} className="text-sm text-slate-500 hover:text-slate-800">← All proposals</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{proposal.title}</h1>
        <StatusBadge status={proposal.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">Prepared for {user.fullName} by {branding.name}</p>

      {proposal.scope && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Scope</h2>
          <p className="whitespace-pre-wrap text-slate-700">{proposal.scope}</p>
        </section>
      )}
      {proposal.timeline && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Timeline</h2>
          <p className="whitespace-pre-wrap text-slate-700">{proposal.timeline}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Investment</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Qty</th><th className="px-4 py-3 text-right font-medium">Price</th><th className="px-4 py-3 text-right font-medium">Amount</th></tr>
            </thead>
            <tbody>
              {proposal.lineItems.map((li, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">{li.name}</td>
                  <td className="px-4 py-3 text-right">{li.qty}</td>
                  <td className="px-4 py-3 text-right">{money(li.price, proposal.currency)}</td>
                  <td className="px-4 py-3 text-right">{money(li.qty * li.price, proposal.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-4 py-3" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right">{money(proposal.totalAmount, proposal.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          A {proposal.depositPercent}% deposit ({money(deposit, proposal.currency)}) is invoiced when you sign.
        </p>
      </section>

      {proposal.status === 'sent' && (
        <form onSubmit={sign} className="card mt-8 space-y-4 p-6">
          <h2 className="text-lg font-semibold">Accept &amp; sign</h2>
          <div>
            <label htmlFor="sig" className="mb-1 block text-sm font-medium">Type your full name</label>
            <input id="sig" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={255} />
            {nameMatches && <p className="mt-2 font-serif text-2xl italic text-slate-700" aria-hidden>{name}</p>}
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to the scope and pricing above. Typing my name is my legal signature; the date, time and IP address are recorded.</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || !nameMatches || !agree}>{busy ? 'Signing…' : 'Accept & sign'}</button>
            <button type="button" className="btn btn-secondary" onClick={decline} disabled={busy}>Decline</button>
          </div>
        </form>
      )}

      {proposal.status === 'signed' && (
        <div className="mt-8 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Signed by <strong>{proposal.signedByName}</strong> on {formatDate(proposal.signedAt)}.
        </div>
      )}
      {proposal.status === 'declined' && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600">You declined this proposal.</div>
      )}
    </div>
  );
}
