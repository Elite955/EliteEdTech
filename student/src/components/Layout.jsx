import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GlobalChat from './GlobalChat'
import PageLoader from './PageLoader'
import ProfileDialog from './ProfileDialog'
import { Icon } from './icons'

const navigation = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }]
  },
  {
    label: 'Learning',
    items: [
      { to: '/teachers', label: 'Browse Teachers', icon: 'search' },
      { to: '/bookings', label: 'My Bookings', icon: 'calendar' },
      { to: '/sessions', label: 'Sessions', icon: 'video' }
    ]
  },
  {
    label: 'Account',
    items: [
      { to: '/payments', label: 'Payments', icon: 'card' },
      { to: '/feedback', label: 'Feedback', icon: 'star' }
    ]
  }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const profileButtonRef = useRef(null)
  const [chatOpen, setChatOpen] = useState(false)
  const initial = user?.name?.charAt(0).toUpperCase() ?? 'S'

  useEffect(() => {
    setProfileOpen(false)
    setProfileDialogOpen(false)
    setChatOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function toggleChat() {
    setProfileOpen(false)
    setChatOpen((value) => !value)
  }

  return (
    <div className={`student-shell${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="sidebar" id="student-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo"><span>e</span></div>
          {!collapsed && <div><strong>EdTech</strong><small>STUDENT CONSOLE</small></div>}
          <button
            type="button"
            className="sidebar-collapse icon-button"
            aria-controls="student-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={17} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Student navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  aria-label={collapsed ? item.label : undefined}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={item.icon} /><span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-heading">
            <div className="topbar-title">Student portal</div>
          </div>
          <div className="topbar-actions">
            <div className="profile-wrap">
              <button
                type="button"
                ref={profileButtonRef}
                className="profile-button"
                onClick={() => setProfileOpen((value) => !value)}
                aria-expanded={profileOpen}
              >
                <span className="avatar">{initial}</span>
                <span className="profile-text"><strong>{user?.name}</strong><small>{user?.role}</small></span>
                <Icon name="chevronDown" size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <span>{user?.email}</span>
                  <button
                    type="button"
                    className="profile-menu-edit"
                    onClick={() => {
                      setProfileOpen(false)
                      setChatOpen(false)
                      setProfileDialogOpen(true)
                    }}
                  >
                    <Icon name="profile" size={15} /> Edit profile
                  </button>
                  <button type="button" onClick={handleLogout}><Icon name="logout" size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {!chatOpen && (
        <button
          type="button"
          className="chat-launcher"
          aria-label="Open global chat"
          aria-controls="global-chat"
          data-ui-sound="open"
          onClick={toggleChat}
        >
          <Icon name="chat" size={19} />
          <span>Chat</span>
        </button>
      )}
      {profileDialogOpen && <ProfileDialog returnFocusRef={profileButtonRef} onClose={() => setProfileDialogOpen(false)} />}
      {chatOpen && <GlobalChat onClose={() => setChatOpen(false)} />}
    </div>
  )
}
