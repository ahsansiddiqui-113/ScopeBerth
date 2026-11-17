import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-white">S</div>
      <h1 className="text-4xl font-semibold tracking-tight">ServiceFlow</h1>
      <p className="mt-4 text-lg text-slate-600">
        One branded portal for your proposals, client approvals, files, and invoices.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login?mode=signup" className="btn btn-primary">Start free</Link>
        <Link href="/login" className="btn btn-secondary">Sign in</Link>
      </div>
      <p className="mt-10 text-sm text-slate-500">
        Are you a client? Open the portal link your provider sent you, e.g. <code>/portal/your-agency</code>.
      </p>
    </main>
  );
}
