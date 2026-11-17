const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'sf_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** Fetch wrapper: injects the bearer token and, when given, the active x-organization-id. */
export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; orgId?: string; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  if (opts.orgId) headers['x-organization-id'] = opts.orgId;

  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong');
  return data as T;
}

export type Branding = { name: string; slug: string; logoUrl: string | null; brandColor: string; whiteLabel: boolean };
export type Me = {
  user: { id: string; email: string; fullName: string };
  organizations: { id: string; name: string; slug: string; role: string }[];
};
export type ProjectSummary = {
  id: string; title: string; status: string; dueDate: string | null; clientName: string;
  milestoneCount: number; approvedCount: number; pendingApprovals: number;
};
export type Milestone = {
  id: string; title: string; description: string | null; position: number;
  status: 'pending' | 'awaiting_approval' | 'approved'; dueDate: string | null; approvedAt: string | null;
};
export type Deliverable = {
  id: string; milestoneId: string | null; title: string; fileSizeBytes: number | null;
  status: 'pending_approval' | 'approved' | 'changes_requested'; clientFeedback: string | null;
  approvedAt: string | null; createdAt: string;
};

export type LineItem = { name: string; qty: number; price: number };
export type Proposal = {
  id: string; title: string; scope: string | null; timeline: string | null; lineItems: LineItem[];
  totalAmount: string; currency: string; depositPercent: number;
  status: 'draft' | 'sent' | 'signed' | 'declined';
  signedByName: string | null; signedAt: string | null; sentAt: string | null; createdAt: string;
};
export type Invoice = {
  id: string; invoiceNumber: string; projectId: string | null; projectTitle: string | null;
  amount: string; currency: string; status: 'unpaid' | 'paid' | 'overdue';
  dueDate: string; description: string | null; paymentUrl: string | null; paidAt: string | null;
};

export const money = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
