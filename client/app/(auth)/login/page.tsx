'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Me, ORG_KEY, setToken } from '../../../lib/api';

function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(useSearchParams().get('mode') === 'signup' ? 'signup' : 'signin');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', workspace: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { token } = await api<{ token: string }>('/auth/signup', {
          method: 'POST', auth: false,
          body: { email: form.email, password: form.password, fullName: form.fullName },
        });
        setToken(token);
        const { organization } = await api<{ organization: { id: string } }>('/orgs', {
          method: 'POST', body: { name: form.workspace },
        });
        localStorage.setItem(ORG_KEY, organization.id);
        return router.replace('/app');
      }
      const { token } = await api<{ token: string }>('/auth/login', {
        method: 'POST', auth: false, body: { email: form.email, password: form.password },
      });
      setToken(token);
      const me = await api<Me>('/auth/me');
      const staffOrg = me.organizations.find((o) => o.role !== 'client');
      if (staffOrg) localStorage.setItem(ORG_KEY, staffOrg.id);
      router.replace(staffOrg ? '/app' : me.organizations[0] ? `/portal/${me.organizations[0].slug}` : '/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-lg font-semibold text-white">S</div>
          <h1 className="text-xl font-semibold">{mode === 'signin' ? 'Sign in to ServiceFlow' : 'Create your workspace'}</h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="fn" className="mb-1 block text-sm font-medium">Your name</label>
                <input id="fn" className="input" required value={form.fullName} onChange={set('fullName')} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="ws" className="mb-1 block text-sm font-medium">Business name</label>
                <input id="ws" className="input" required value={form.workspace} onChange={set('workspace')} placeholder="Acme Studio" />
              </div>
            </>
          )}
          <div>
            <label htmlFor="em" className="mb-1 block text-sm font-medium">Email</label>
            <input id="em" type="email" className="input" required value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="pw" className="mb-1 block text-sm font-medium">Password</label>
            <input
              id="pw" type="password" className="input" required minLength={mode === 'signup' ? 8 : undefined}
              value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            {mode === 'signup' && <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create workspace'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
          <button className="font-medium text-brand underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}>
            {mode === 'signin' ? 'Create a workspace' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><Login /></Suspense>;
}
