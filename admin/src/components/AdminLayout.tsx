import { useState, type ReactNode } from 'react'
import {
  Activity, BadgeDollarSign, BarChart3, Bell, Building2, CalendarClock, CalendarDays, ChevronDown,
  ChevronLeft, ChevronRight, ClipboardList, CreditCard, Database, FileChartColumn, FileText,
  GraduationCap, LayoutDashboard, LifeBuoy, LockKeyhole, LogOut, MessageSquareWarning,
  MonitorPlay, Settings2, Shield, UserCog, Users, WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from '../lib/api'

type NavItem = { label: string; path: string; module: string; icon: LucideIcon; superAdminOnly?: boolean }
type NavGroup = { label: string; items: NavItem[] }

const navigation: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', path: '/dashboard', module: 'dashboard', icon: LayoutDashboard }] },
  { label: 'User management', items: [
    { label: 'Students', path: '/students', module: 'students', icon: GraduationCap },
    { label: 'Teachers', path: '/teachers', module: 'teachers', icon: Users },
    { label: 'Admin accounts', path: '/admins', module: 'admins', icon: UserCog },
  ] },
  { label: 'Platform operations', items: [
    { label: 'Bookings', path: '/modules/bookings', module: 'bookings', icon: CalendarDays },
    { label: 'Live classes', path: '/modules/live_classes', module: 'live_classes', icon: MonitorPlay },
    { label: 'Meeting checks', path: '/meeting-checks', module: 'live_classes', icon: CalendarClock },
    { label: 'Chat moderation', path: '/modules/chat_moderation', module: 'chat_moderation', icon: MessageSquareWarning },
    { label: 'Support & complaints', path: '/modules/support', module: 'support', icon: LifeBuoy },
  ] },
  { label: 'Finance', items: [
    { label: 'Transactions', path: '/modules/transactions', module: 'transactions', icon: CreditCard },
    { label: 'Refunds', path: '/modules/refunds', module: 'refunds', icon: WalletCards },
    { label: 'Teacher payouts', path: '/modules/payouts', module: 'payouts', icon: BadgeDollarSign },
    { label: 'Revenue analytics', path: '/modules/revenue_analytics', module: 'revenue_analytics', icon: BarChart3 },
  ] },
  { label: 'Monitoring & reports', items: [
    { label: 'Recordings', path: '/modules/recordings', module: 'recordings', icon: MonitorPlay },
    { label: 'Attendance', path: '/modules/attendance', module: 'attendance', icon: ClipboardList },
    { label: 'Reports & analytics', path: '/modules/reports', module: 'reports', icon: FileChartColumn },
    { label: 'Activity logs', path: '/modules/activity_logs', module: 'activity_logs', icon: Activity },
    { label: 'Backup management', path: '/modules/backups', module: 'backups', icon: Database },
  ] },
  { label: 'Communication', items: [
    { label: 'Notifications', path: '/modules/notifications', module: 'notifications', icon: Bell },
    { label: 'Announcements', path: '/modules/announcements', module: 'announcements', icon: Bell },
    { label: 'Message templates', path: '/modules/templates', module: 'templates', icon: FileText },
  ] },
  { label: 'System control', items: [
    { label: 'Platform configuration', path: '/modules/configuration', module: 'configuration', icon: Settings2 },
    { label: 'Integrations', path: '/modules/integrations', module: 'integrations', icon: Building2 },
    { label: 'Security management', path: '/modules/security', module: 'security', icon: LockKeyhole },
    { label: 'Active sessions', path: '/sessions', module: 'security', icon: MonitorPlay, superAdminOnly: true },
    { label: 'Maintenance mode', path: '/modules/maintenance', module: 'maintenance', icon: Shield },
  ] },
]

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  students: 'Students',
  teachers: 'Teachers',
  admins: 'Admin accounts',
  bookings: 'Bookings',
  live_classes: 'Live classes',
  'meeting-checks': 'Meeting checks',
  chat_moderation: 'Chat moderation',
  support: 'Support & complaints',
  transactions: 'Transactions',
  refunds: 'Refunds',
  payouts: 'Teacher payouts',
  revenue_analytics: 'Revenue analytics',
  recordings: 'Recordings',
  attendance: 'Attendance',
  reports: 'Reports & analytics',
  activity_logs: 'Activity logs',
  notifications: 'Notifications',
  announcements: 'Announcements',
  templates: 'Message templates',
  configuration: 'Platform configuration',
  integrations: 'Integrations',
  security: 'Security management',
  sessions: 'Active sessions',
  backups: 'Backup management',
  maintenance: 'Maintenance mode',
}

export function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, can, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const currentPage = location.pathname.split('/').filter(Boolean).pop() ?? 'dashboard'
  const title = pageTitles[currentPage] ?? 'Dashboard'

  async function handleLogout() {
    try {
      await logout()
      navigate('/sign-in', { replace: true })
    } catch (error) {
      window.alert(getErrorMessage(error))
    }
  }

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="sidebar" id="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo"><span>e</span></div>
          {!collapsed && <div><strong>EdTech</strong><small>ADMIN CONSOLE</small></div>}
          <button type="button" className="sidebar-collapse icon-button" aria-controls="admin-sidebar" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navigation.map((group) => {
            const items = group.items.filter((item) => can(item.module, 'view') && (!item.superAdminOnly || user?.roleCode === 'super_admin'))
            if (!items.length) return null
            return (
              <div className="nav-group" key={group.label}>
                {!collapsed && <div className="nav-group-label">{group.label}</div>}
                {items.map(({ label, path, icon: Icon }) => (
                  <NavLink key={path} to={path} title={label} aria-label={collapsed ? label : undefined} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-heading">
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
                <span className="avatar">{user?.name.slice(0, 1).toUpperCase() ?? 'A'}</span>
                <span className="profile-text"><strong>{user?.name}</strong><small>{user?.role}</small></span>
                <ChevronDown size={16} />
              </button>
              {profileOpen && <div className="profile-menu"><span>{user?.email}</span><button onClick={handleLogout}><LogOut size={15} /> Sign out</button></div>}
            </div>
          </div>
        </header>
        <main className="page-content">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}
