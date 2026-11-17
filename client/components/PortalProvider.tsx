'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, Branding, clearToken, getToken, Me } from '../lib/api';

type PortalCtx = { branding: Branding; orgId: string; user: Me['user'] };
const Ctx = createContext<PortalCtx | null>(null);

export const usePortal = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortal must be used inside PortalProvider');
  return v;
};

export function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '37 99 235';
}

/** Loads org branding (public), applies its color, then guards the portal behind a signed-in membership. */
export function PortalProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [ctx, setCtx] = useState<PortalCtx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { organization } = await api<{ organization: Branding }>(`/public/orgs/${slug}`, { auth: false });
        if (cancelled) return;
        setBranding(organization);
        document.documentElement.style.setProperty('--brand', hexToRgb(organization.brandColor));

        if (!getToken()) return router.replace(`/portal-login?org=${slug}`);
        const me = await api<Me>('/auth/me');
        const membership = me.organizations.find((o) => o.slug === slug);
        if (!membership) {
          if (!cancelled) setError("Your account doesn't have access to this workspace.");
          return;
        }
        if (!cancelled) setCtx({ branding: organization, orgId: membership.id, user: me.user });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          router.replace(`/portal-login?org=${slug}`);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug, router]);

  const signOut = () => {
    clearToken();
    router.replace(`/portal-login?org=${slug}`);
  };

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-slate-700">{error}</p>
        <button className="btn btn-secondary mt-6" onClick={signOut}>Sign in with a different account</button>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href={`/portal/${slug}`} className="flex items-center gap-3">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.name} className="h-8 w-auto" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
                {branding?.name?.[0] ?? ''}
              </span>
            )}
            <span className="font-semibold">{branding?.name ?? ''}</span>
          </a>
          {ctx && (
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="hidden sm:inline">{ctx.user.fullName}</span>
              <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {ctx && (
        <nav className="border-b border-slate-200 bg-white" aria-label="Portal">
          <div className="mx-auto flex max-w-5xl gap-6 px-6">
            {[['Projects', ''], ['Proposals', '/proposals'], ['Invoices', '/invoices']].map(([label, href]) => {
              const full = `/portal/${slug}${href}`;
              const active = href === '' ? pathname === full || pathname.startsWith(`${full}/projects`) : pathname.startsWith(full);
              return (
                <Link
                  key={label} href={full} aria-current={active ? 'page' : undefined}
                  className={`-mb-px border-b-2 py-3 text-sm font-medium ${active ? 'border-brand text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {ctx ? <Ctx.Provider value={ctx}>{children}</Ctx.Provider> : <p className="text-slate-500">Loading…</p>}
      </main>

      {branding && !branding.whiteLabel && (
        <footer className="py-6 text-center text-xs text-slate-400">
          Powered by <a href="/" className="font-medium hover:text-slate-600">ServiceFlow</a>
        </footer>
      )}
    </div>
  );
}
