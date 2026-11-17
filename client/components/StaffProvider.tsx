'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, Billing, clearToken, getToken, Me, ORG_KEY, OrgRef } from '../lib/api';

type StaffCtx = {
  user: Me['user'];
  org: OrgRef;
  orgs: OrgRef[];
  orgId: string;
  isOwner: boolean;
  billing: Billing | null; // owners only
  refreshBilling: () => Promise<void>;
  switchOrg: (id: string) => void;
  signOut: () => void;
};
const Ctx = createContext<StaffCtx | null>(null);

export const useStaff = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStaff must be used inside StaffProvider');
  return v;
};

const NAV = [
  { href: '/app', label: 'Overview', exact: true },
  { href: '/app/clients', label: 'Clients' },
  { href: '/app/projects', label: 'Projects' },
  { href: '/app/proposals', label: 'Proposals' },
  { href: '/app/invoices', label: 'Invoices' },
  { href: '/app/settings', label: 'Settings' },
];

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!getToken()) return router.replace('/login');
      try {
        const me = await api<Me>('/auth/me');
        const staffOrgs = me.organizations.filter((o) => o.role !== 'client') as OrgRef[];
        if (staffOrgs.length === 0) {
          const clientOrg = me.organizations[0];
          return router.replace(clientOrg ? `/portal/${clientOrg.slug}` : '/login');
        }
        const saved = localStorage.getItem(ORG_KEY);
        setUser(me.user);
        setOrgs(staffOrgs);
        setOrgId(staffOrgs.find((o) => o.id === saved)?.id ?? staffOrgs[0].id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          router.replace('/login');
        } else setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, [router]);

  const org = orgs.find((o) => o.id === orgId) ?? null;
  const isOwner = org?.role === 'owner';

  const refreshBilling = useCallback(async () => {
    if (!orgId || !isOwner) return setBilling(null);
    try {
      setBilling(await api<Billing>('/billing', { orgId }));
    } catch {
      setBilling(null);
    }
  }, [orgId, isOwner]);
  useEffect(() => { refreshBilling(); }, [refreshBilling]);

  const signOut = () => {
    clearToken();
    router.replace('/login');
  };
  const switchOrg = (id: string) => {
    localStorage.setItem(ORG_KEY, id);
    setOrgId(id);
    router.push('/app');
  };

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p role="alert" className="text-slate-700">{error}</p>
        <button className="btn btn-secondary mt-6" onClick={signOut}>Sign out</button>
      </main>
    );
  }
  if (!user || !org || !orgId) return <p className="p-8 text-slate-500">Loading…</p>;

  const banner = billing && planBanner(billing);

  return (
    <Ctx.Provider value={{ user, org, orgs, orgId, isOwner, billing, refreshBilling, switchOrg, signOut }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="shrink-0 border-b border-slate-200 bg-white md:w-60 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">{org.name[0]}</span>
            {orgs.length > 1 ? (
              <select aria-label="Switch workspace" className="input !py-1" value={orgId} onChange={(e) => switchOrg(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <span className="truncate font-semibold">{org.name}</span>
            )}
          </div>
          <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden px-5 py-4 text-xs text-slate-500 md:absolute md:bottom-0 md:block md:w-60">
            <p className="truncate font-medium text-slate-700">{user.fullName}</p>
            <p className="truncate">{user.email}</p>
            <div className="mt-2 flex gap-3">
              <a href={`/portal/${org.slug}`} target="_blank" rel="noopener noreferrer" className="underline">Client portal ↗</a>
              <button onClick={signOut} className="underline">Sign out</button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {banner && (
            <div className={`px-6 py-2.5 text-sm ${banner.tone === 'warn' ? 'bg-red-50 text-red-800' : 'bg-brand/10 text-slate-800'}`}>
              {banner.text}{' '}
              <Link href="/app/settings#billing" className="font-semibold underline">{banner.cta}</Link>
            </div>
          )}
          <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function planBanner(b: Billing): { text: string; cta: string; tone: 'info' | 'warn' } | null {
  if (b.subscriptionStatus === 'past_due') return { text: 'Your last payment failed.', cta: 'Update billing', tone: 'warn' };
  if (b.plan !== 'starter') return null;
  const { clients, projects } = b.usage;
  const days = b.trialEndsAt ? Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / 86400000) : 0;
  const trial = b.subscriptionStatus === 'trialing' && days > 0 ? `${days} days left in your trial. ` : '';
  return {
    text: `${trial}Starter plan: ${clients}/${b.limits.clients} client, ${projects}/${b.limits.projects} projects.`,
    cta: 'Upgrade', tone: 'info',
  };
}
