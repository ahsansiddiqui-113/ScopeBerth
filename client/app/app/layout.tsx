import { StaffProvider } from '../../components/StaffProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <StaffProvider>{children}</StaffProvider>;
}
