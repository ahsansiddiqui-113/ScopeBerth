'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Branding, Me, setToken } from '../../../lib/api';
import { hexToRgb } from '../../../components/PortalProvider';

function PortalLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const orgSlug = params.get('org');

  const [branding, setBranding] = useState<Branding | null>(null);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'verifying'>(token ? 'verifying' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const verified = useRef(false); // magic tokens are single-use; guard against StrictMode double-invoke

  useEffect(() => {
    if (!orgSlug) return;
    api<{ organization: Branding }>(`/public/orgs/${orgSlug}`, { auth: false })
      .then(({ organization }) => {
        setBranding(organization);
        document.documentElement.style.setProperty('--brand', hexToRgb(organization.brandColor));
      })
      .catch(() => {});
  }, [orgSlug]);

  useEffect(() => {
    if (!token || verified.current) return;
    verified.current = true;
    (async () => {
      try {
        const { token: session } = await api<{ token: string }>('/auth/magic-link/verify', {
          method: 'POST', body: { token }, auth: false,
        });
        setToken(session);
        const me = await api<Me>('/auth/me');
        const target = me.organizations.find((o) => o.slug === orgSlug) ?? me.organizations[0];
        // Invited staff land on the dashboard; clients on the portal.
        router.replace(!target ? '/' : target.role === 'client' ? `/portal/${target.slug}` : '/app');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
        setState('idle');
      }
    })();
  }, [token, orgSlug, router]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api('/auth/magic-link', { method: 'POST', body: { email }, auth: false });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send link');
      setState('idle');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="mx-auto mb-3 h-10 w-auto" />
          ) : (
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-lg font-semibold text-white">
              {branding?.name?.[0] ?? 'S'}
            </div>
          )}
          <h1 className="text-xl font-semibold">{branding ? `${branding.name} client portal` : 'Client portal'}</h1>
        </div>

        {state === 'verifying' && <p className="text-center text-sm text-slate-600">Signing you in…</p>}

        {state === 'sent' && (
          <p className="text-center text-sm text-slate-600">
            If <strong>{email}</strong> has an account, a sign-in link is on its way. It expires in 15 minutes.
          </p>
        )}

        {(state === 'idle' || state === 'sending') && (
          <form onSubmit={requestLink} className="space-y-4">
            <p className="text-center text-sm text-slate-600">Enter your email and we&apos;ll send you a sign-in link. No password needed.</p>
            <input
              type="email" required autoFocus placeholder="you@company.com" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-primary w-full" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PortalLogin />
    </Suspense>
  );
}
