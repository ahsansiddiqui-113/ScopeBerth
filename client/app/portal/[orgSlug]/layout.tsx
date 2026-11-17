import { PortalProvider } from '../../../components/PortalProvider';

export default function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { orgSlug: string };
}) {
  return <PortalProvider slug={params.orgSlug}>{children}</PortalProvider>;
}
