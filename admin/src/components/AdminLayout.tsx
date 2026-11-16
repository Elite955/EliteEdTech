import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, BadgeDollarSign, BarChart3, Bell, Building2, CalendarDays, ChevronDown,
  ChevronLeft, ChevronRight, ClipboardList, CreditCard, Database, FileChartColumn, FileText,
  GraduationCap, LayoutDashboard, LifeBuoy, LockKeyhole, LogOut, Menu, MessageSquareWarning, Search,
  MonitorPlay, Settings2, Shield, ShieldCheck, UserCog, Users, WalletCards, X,
  type LucideIcon,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { api, getErrorMessage } from '../lib/api'

type NavItem = { label: string; path: string; module: string; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const navigation: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', path: '/dashboard', module: 'dashboard', icon: LayoutDashboard }] },
  { label: 'User management', items: [
    { label: 'Students', path: '/students', module: 'students', icon: GraduationCap },
    { label: 'Teachers', path: '/teachers', module: 'teachers', icon: Users },
    { label: 'Admin accounts', path: '/admins', module: 'admins', icon: UserCog },
    { label: 'Roles & permissions', path: '/roles', module: 'roles', icon: ShieldCheck },
  ] },
  { label: 'Platform operations', items: [
    { label: 'Bookings', path: '/modules/bookings', module: 'bookings', icon: CalendarDays },
    { label: 'Live classes', path: '/modules/live_classes', module: 'live_classes', icon: MonitorPlay },
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
    { label: 'Maintenance mode', path: '/modules/maintenance', module: 'maintenance', icon: Shield },
  ] },
]

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  students: 'Students',
  teachers: 'Teachers',
  admins: 'Admin accounts',
  roles: 'Roles & permissions',
  bookings: 'Bookings',
  live_classes: 'Live classes',
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
  backups: 'Backup management',
  maintenance: 'Maintenance mode',
}

export function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, can, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string; subtitle: string; module: string; path: string }>>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const currentPage = location.pathname.split('/').filter(Boolean).pop() ?? 'dashboard'
  const title = pageTitles[currentPage] ?? 'Dashboard'

  useEffect(() => {
    let active = true
    api<{ status: string }>('/health')
      .then(() => { if (active) setApiStatus('connected') })
      .catch(() => { if (active) setApiStatus('unavailable') })
    return () => { active = false }
  }, [])

  async function handleLogout() {
    try {
      await logout()
      navigate('/sign-in', { replace: true })
    } catch (error) {
      window.alert(getErrorMessage(error))
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (search.trim().length < 2) {
      setSearchError('Enter at least two characters to search.')
      setSearchOpen(true)
      return
    }
    setSearching(true)
    setSearchError('')
    setSearchOpen(true)
    try {
      const result = await api<{ items: typeof searchResults }>(`/admin/search?q=${encodeURIComponent(search.trim())}`)
      setSearchResults(result.items)
    } catch (error) {
      setSearchError(getErrorMessage(error))
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' mobile-nav-open' : ''}`}>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo"><span>e</span></div>
          {!collapsed && <div><strong>EdTech</strong><small>ADMIN CONSOLE</small></div>}
          <button className="sidebar-collapse icon-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
          <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navigation.map((group) => {
            const items = group.items.filter((item) => can(item.module, 'view'))
            if (!items.length) return null
            return (
              <div className="nav-group" key={group.label}>
                {!collapsed && <div className="nav-group-label">{group.label}</div>}
                {items.map(({ label, path, icon: Icon }) => (
                  <NavLink key={path} to={path} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        {!collapsed && (
          <div className="sidebar-status">
            <span className={`status-pulse${apiStatus === 'unavailable' ? ' status-offline' : ''}`} />
            <div><strong>Admin systems</strong><small>{apiStatus === 'checking' ? 'Checking services…' : apiStatus === 'connected' ? 'API and database connected' : 'API or database unavailable'}</small></div>
          </div>
        )}
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-heading">
            <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div><div className="breadcrumbs">EdTech Platform <span>/</span> Admin</div><h1>{title}</h1></div>
          </div>
          <div className="topbar-actions">
            <form className="global-search" role="search" onSubmit={submitSearch}>
              <Search size={16} />
              <input aria-label="Search platform records" placeholder="Search platform…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false) }} onFocus={() => { if (searchResults.length || searchError) setSearchOpen(true) }} />
              {searchOpen && <div className="search-dropdown">
                {searchError ? <p role="alert">{searchError}</p> : searching ? <p>Searching authorized records…</p> : searchResults.length
                  ? searchResults.map((item) => <Link key={`${item.module}-${item.id}`} to={item.path} onClick={() => setSearchOpen(false)}><strong>{item.label}</strong><small>{item.subtitle}</small></Link>)
                  : <p>No matching records.</p>}
              </div>}
            </form>
            <span className="environment-badge"><span /> {user?.role ?? 'Administrator'}</span>
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
