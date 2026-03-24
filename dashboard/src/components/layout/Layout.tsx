import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store'
import { ToastContainer } from '../ui/Toast'
import { fetchHealth } from '../../lib/api'

type NavItem = {
  to: string
  label: string
  icon: JSX.Element
  /** When set, sidebar active state uses this instead of default NavLink matching. */
  isActivePath?: (pathname: string) => boolean
}

const navItems: NavItem[] = [
  {
    to: '/chat',
    label: 'Chat',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/trace',
    label: 'Trace Viewer',
    isActivePath: (pathname) => pathname === '/trace' || pathname.startsWith('/trace/'),
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 6h6v6H3zM15 3h6v6h-6zM15 15h6v6h-6zM9 9l6-3M9 15l6 3" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/trust',
    label: 'Trust Heatmap',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/models',
    label: 'Models',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 2l9 5-9 5-9-5 9-5zM3 7v10l9 5 9-5V7" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/metrics',
    label: 'Metrics',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 3v4h4" strokeWidth="2" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4l-2.2.7a7.8 7.8 0 0 1-.7 1.7l1.1 2-2.8 2.8-2-1.1c-.5.3-1.1.5-1.7.7L12 21l-1.7-2.2a7.8 7.8 0 0 1-1.7-.7l-2 1.1-2.8-2.8 1.1-2a7.8 7.8 0 0 1-.7-1.7L3 12l2.2-1.7c.2-.6.4-1.2.7-1.7l-1.1-2 2.8-2.8 2 1.1c.5-.3 1.1-.5 1.7-.7L12 3l1.7 2.2c.6.2 1.2.4 1.7.7l2-1.1 2.8 2.8-1.1 2c.3.5.5 1.1.7 1.7z"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    to: '/eval',
    label: 'Eval',
    icon: (
      <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M20 6L9 17l-5-5" strokeWidth="2" />
      </svg>
    ),
  },
]

function Sidebar() {
  const location = useLocation()
  return (
    <aside className="sidebar">
      <ul className="sidebar__nav">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => {
                const active = item.isActivePath
                  ? item.isActivePath(location.pathname)
                  : isActive
                return active ? 'sidebar__link active' : 'sidebar__link'
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}

const ROUTE_NAMES: Record<string, string> = {
  '/chat': 'Chat',
  '/trace': 'Trace Viewer',
  '/trust': 'Trust Heatmap',
  '/models': 'Models',
  '/metrics': 'Metrics',
  '/history': 'History',
  '/settings': 'Settings',
  '/eval': 'Eval',
}

function topBarRouteLabel(pathname: string): string {
  if (pathname === '/trace' || pathname.startsWith('/trace/')) {
    const id = pathname.startsWith('/trace/') ? pathname.slice('/trace/'.length) : ''
    return id ? `Trace Viewer · ${id}` : 'Trace Viewer'
  }
  return ROUTE_NAMES[pathname] ?? ROUTE_NAMES[`/${pathname.split('/')[1]}`] ?? ''
}

function TopBar() {
  const location = useLocation()
  const { theme, setTheme, isConnected } = useAppStore()
  const routeName = topBarRouteLabel(location.pathname)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="topbar">
      <span className="topbar__title">GAIOL</span>
      <span className="topbar__route">{routeName}</span>
      <div className="topbar__actions">
        <button
          className="topbar__theme-btn"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <div
          className={`status-dot ${isConnected ? 'status-dot--connected' : ''}`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
      </div>
    </div>
  )
}

export function Layout() {
  const setConnected = useAppStore((s) => s.setConnected)

  useEffect(() => {
    let alive = true
    const tick = () => {
      void fetchHealth().then((ok) => {
        if (alive) setConnected(ok)
      })
    }
    tick()
    const id = window.setInterval(tick, 15000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [setConnected])

  return (
    <div className="layout">
      <TopBar />
      <div className="layout__body">
        <Sidebar />
        <main className="layout__main">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
