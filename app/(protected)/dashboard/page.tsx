import type { Metadata } from 'next';
import DashboardPage from '@/features/dashboard/DashboardPage'

export const metadata: Metadata = { title: 'Dashboard | Macboot CRM' };

export default function Dashboard() {
    return <DashboardPage />
}
