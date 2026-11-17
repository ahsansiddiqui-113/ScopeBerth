const STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  active: 'bg-blue-50 text-blue-700',
  in_review: 'bg-amber-50 text-amber-700',
  awaiting_approval: 'bg-amber-50 text-amber-700',
  pending_approval: 'bg-amber-50 text-amber-700',
  changes_requested: 'bg-orange-50 text-orange-700',
  approved: 'bg-green-50 text-green-700',
  completed: 'bg-green-50 text-green-700',
  sent: 'bg-amber-50 text-amber-700',
  signed: 'bg-green-50 text-green-700',
  declined: 'bg-slate-100 text-slate-500',
  unpaid: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
};

const LABELS: Record<string, string> = {
  pending: 'Not started',
  in_review: 'In review',
  awaiting_approval: 'Needs your approval',
  pending_approval: 'Needs your approval',
  changes_requested: 'Changes requested',
  sent: 'Awaiting your signature',
};

export function StatusBadge({ status, label: override }: { status: string; label?: string }) {
  const label = override ?? LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.pending}`}>
      {label}
    </span>
  );
}

export const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

export const formatBytes = (n: number | null) => {
  if (n == null) return '';
  if (n === 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${+(n / 1024 ** 3).toFixed(1)} GB`;
};
