'use client';

import { useEffect, useState } from 'react';
import { api, Invoice, money } from '../../../../lib/api';
import { usePortal } from '../../../../components/PortalProvider';
import { formatDate, StatusBadge } from '../../../../components/StatusBadge';

export default function InvoicesPage() {
  const { orgId } = usePortal();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ invoices: Invoice[] }>('/invoices', { orgId })
      .then((d) => setInvoices(d.invoices))
      .catch((e) => setError(e.message));
  }, [orgId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Invoices</h1>
      {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
      {!invoices && !error && <p className="mt-6 text-slate-500">Loading…</p>}
      {invoices?.length === 0 && <div className="card mt-6 p-10 text-center text-slate-500">No invoices yet.</div>}
      {invoices && invoices.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{i.invoiceNumber}</p>
                    {i.description && <p className="text-xs text-slate-500">{i.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{i.projectTitle ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(i.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(i.amount, i.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {i.status !== 'paid' && i.paymentUrl && (
                      <a href={i.paymentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Pay now</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
