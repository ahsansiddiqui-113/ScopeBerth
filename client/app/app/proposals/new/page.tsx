'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ClientRow } from '../../../../lib/api';
import { useStaff } from '../../../../components/StaffProvider';
import { PageHeader } from '../../../../components/ErrorNote';
import { ProposalEditor } from '../../../../components/ProposalEditor';

export default function NewProposal() {
  const { orgId } = useStaff();
  const [clients, setClients] = useState<ClientRow[] | null>(null);

  useEffect(() => {
    api<{ clients: ClientRow[] }>('/clients', { orgId }).then((d) => setClients(d.clients)).catch(() => setClients([]));
  }, [orgId]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/proposals" className="text-sm text-slate-500 hover:text-slate-800">← All proposals</Link>
      <div className="mt-3"><PageHeader title="New proposal" /></div>
      {!clients && <p className="text-slate-500">Loading…</p>}
      {clients?.length === 0 && (
        <div className="card p-8 text-center text-slate-600">
          You need a client first. <Link href="/app/clients" className="font-medium text-brand underline">Invite one</Link>.
        </div>
      )}
      {clients && clients.length > 0 && <ProposalEditor clients={clients} orgId={orgId} />}
    </div>
  );
}
