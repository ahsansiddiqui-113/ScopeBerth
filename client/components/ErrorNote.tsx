import Link from 'next/link';
import { ApiError } from '../lib/api';

/** Renders an error; plan-limit errors (402) get an upgrade link — the dashboard's paywall prompt. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const paywall = error instanceof ApiError && (error.code === 'PLAN_LIMIT' || error.code === 'PLAN_FEATURE');
  if (paywall) {
    return (
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {message}{' '}
        <Link href="/app/settings#billing" className="font-semibold underline">See plans</Link>
      </div>
    );
  }
  return <p role="alert" className="text-sm text-red-600">{message}</p>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
