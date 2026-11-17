'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Billing, formatLimit, TeamMember } from '../../../lib/api';
import { useStaff } from '../../../components/StaffProvider';
import { ErrorNote, PageHeader } from '../../../components/ErrorNote';
import { formatBytes } from '../../../components/StatusBadge';

type OrgDetail = { id: string; name: string; slug: string; logo_url: string | null; brand_color: string; customDomain?: string | null };

export default function SettingsPage() {
  const { isOwner } = useStaff();
  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="card p-8 text-center text-slate-600">Only the workspace owner can change branding, team and billing settings.</div>
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <PageHeader title="Settings" />
      <Branding />
      <Team />
      <BillingSection />
    </div>
  );
}

function Branding() {
  const { orgId, billing, refreshBilling } = useStaff();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [form, setForm] = useState({ name: '', brandColor: '#2563EB', logoUrl: '', customDomain: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ organization: OrgDetail }>('/orgs/current', { orgId }).then(({ organization: o }) => {
      setOrg(o);
      setForm({ name: o.name, brandColor: o.brand_color, logoUrl: o.logo_url ?? '', customDomain: billing?.customDomain ?? '' });
    }).catch(setError);
  }, [orgId, billing?.customDomain]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      const body: Record<string, unknown> = { name: form.name, brandColor: form.brandColor, logoUrl: form.logoUrl || null };
      if (form.customDomain !== (billing?.customDomain ?? '')) body.customDomain = form.customDomain || null;
      await api('/orgs/current', { method: 'PATCH', orgId, body });
      setSaved(true);
      refreshBilling();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Branding</h2>
      <p className="mb-4 text-sm text-slate-500">How your client portal looks{org ? ` at /portal/${org.slug}` : ''}.</p>
      <form onSubmit={save} className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="b-name" className="mb-1 block text-sm font-medium">Business name</label>
          <input id="b-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="b-color" className="mb-1 block text-sm font-medium">Brand color</label>
          <div className="flex items-center gap-2">
            <input id="b-color" type="color" className="h-10 w-14 cursor-pointer rounded border border-slate-300" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} />
            <code className="text-sm text-slate-600">{form.brandColor}</code>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="b-logo" className="mb-1 block text-sm font-medium">Logo URL (https)</label>
          <input id="b-logo" type="url" pattern="https://.*" className="input" placeholder="https://…/logo.png" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="b-domain" className="mb-1 block text-sm font-medium">
            Custom domain {billing && !billing.features.customDomain && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Agency plan</span>}
          </label>
          <input
            id="b-domain" className="input" placeholder="portal.youragency.com" value={form.customDomain}
            disabled={!!billing && !billing.features.customDomain}
            onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save branding'}</button>
          {saved && <span role="status" className="text-sm text-green-700">Saved.</span>}
        </div>
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
      </form>
    </section>
  );
}

function Team() {
  const { orgId, refreshBilling } = useStaff();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    api<{ team: TeamMember[] }>('/team', { orgId }).then((d) => setTeam(d.team)).catch(setError);
  }, [orgId]);
  useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/team', { method: 'POST', orgId, body: form });
      setForm({ fullName: '', email: '' });
      load(); refreshBilling();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  async function remove(m: TeamMember) {
    if (!window.confirm(`Remove ${m.fullName} from your team?`)) return;
    setError(null);
    try {
      await api(`/team/${m.userId}`, { method: 'DELETE', orgId });
      load(); refreshBilling();
    } catch (err) { setError(err); }
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Team</h2>
      <p className="mb-4 text-sm text-slate-500">Staff can manage clients, projects, proposals and invoices.</p>
      <div className="card divide-y divide-slate-100">
        {team?.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-medium">{m.fullName}</p><p className="truncate text-xs text-slate-500">{m.email}</p></div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs capitalize text-slate-600">{m.role}</span>
              {m.role === 'staff' && <button className="text-sm text-red-600 hover:underline" onClick={() => remove(m)}>Remove</button>}
            </div>
          </div>
        ))}
        <form onSubmit={invite} className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" aria-label="Team member name" placeholder="Name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className="input" aria-label="Team member email" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button className="btn btn-secondary" disabled={busy}>Invite</button>
        </form>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
    </section>
  );
}

function Meter({ label, used, limit, format = String }: { label: string; used: number; limit: number | null; format?: (n: number) => string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="text-slate-500">{format(used)} / {limit == null ? 'Unlimited' : format(limit)}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (e: string) => void };
      Initialize: (o: { token: string; eventCallback?: (e: { name: string }) => void }) => void;
      Checkout: { open: (o: unknown) => void };
    };
  }
}

function loadPaddle(): Promise<NonNullable<Window['Paddle']>> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle failed to load')));
    s.onerror = () => reject(new Error('Could not load the Paddle checkout'));
    document.head.appendChild(s);
  });
}

function BillingSection() {
  const { orgId, billing, refreshBilling } = useStaff();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function upgrade(plan: string) {
    setBusy(plan); setError(null);
    try {
      const cfg = await api<{ environment: string; clientToken: string; priceId: string; customerEmail: string; customData: unknown }>(
        '/billing/checkout', { method: 'POST', orgId, body: { plan } }
      );
      const paddle = await loadPaddle();
      paddle.Environment.set(cfg.environment);
      // Checkout completes in Paddle's overlay; the webhook flips the plan, so poll billing shortly after.
      paddle.Initialize({ token: cfg.clientToken, eventCallback: (e) => { if (e.name === 'checkout.completed') setTimeout(refreshBilling, 3000); } });
      paddle.Checkout.open({ items: [{ priceId: cfg.priceId, quantity: 1 }], customer: { email: cfg.customerEmail }, customData: cfg.customData });
    } catch (err) { setError(err); } finally { setBusy(null); }
  }

  async function manage() {
    setBusy('portal'); setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/portal', { method: 'POST', orgId });
      window.location.href = url;
    } catch (err) { setError(err); setBusy(null); }
  }

  if (!billing) return <section id="billing"><h2 className="text-lg font-semibold">Billing</h2><p className="mt-2 text-slate-500">Loading…</p></section>;
  const b: Billing = billing;

  return (
    <section id="billing" className="scroll-mt-6">
      <h2 className="mb-1 text-lg font-semibold">Plan &amp; billing</h2>
      <p className="mb-4 text-sm text-slate-500">
        You&apos;re on <strong className="capitalize">{b.plan}</strong>
        {b.subscriptionStatus === 'past_due' && ' · payment failed'}.
      </p>

      <div className="card space-y-4 p-5">
        <Meter label="Clients" used={b.usage.clients} limit={b.limits.clients} />
        <Meter label="Projects" used={b.usage.projects} limit={b.limits.projects} />
        <Meter label="Team seats" used={b.usage.seats} limit={b.limits.seats} />
        <Meter label="File storage" used={b.usage.storageBytes} limit={b.limits.storageBytes} format={(n) => formatBytes(n) || '0 KB'} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {b.plans.map((p) => {
          const current = p.key === b.plan;
          return (
            <div key={p.key} className={`card flex flex-col p-5 ${current ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{p.label}</h3>
                {current && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Current</span>}
              </div>
              <p className="mt-2 text-3xl font-semibold">${p.priceUsd}<span className="text-sm font-normal text-slate-500">/mo</span></p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
                <li>{formatLimit(p.limits.clients, 'client')}</li>
                <li>{formatLimit(p.limits.projects, 'project')}</li>
                <li>{formatLimit(p.limits.seats, 'team seat')}</li>
                <li>{formatBytes(p.limits.storageBytes ?? 0).replace(/\.0 /, ' ')} file storage</li>
                {p.features.customDomain && <li>Custom domain</li>}
                {p.features.whiteLabel && <li>White-label portal</li>}
              </ul>
              {p.key !== 'starter' && !current && (
                <button className="btn btn-primary mt-5" disabled={busy !== null || b.hasSubscription} onClick={() => upgrade(p.key)}>
                  {busy === p.key ? 'Opening…' : `Upgrade to ${p.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {b.hasSubscription && (
          <button className="btn btn-secondary" disabled={busy !== null} onClick={manage}>{busy === 'portal' ? 'Opening…' : 'Manage subscription'}</button>
        )}
        <ErrorNote error={error} />
      </div>
    </section>
  );
}
