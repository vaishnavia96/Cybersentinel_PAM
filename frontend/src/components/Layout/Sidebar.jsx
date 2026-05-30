import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Server, KeyRound, Network, Radar, Bell, ScrollText, Sun, Moon, LogOut, AlertTriangle, X } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../context/RealtimeContext'

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { name: 'Inventory', icon: Server, to: '/inventory' },
  { name: 'Credentials', icon: KeyRound, to: '/credentials' },
  { name: 'Discovery', icon: Radar, to: '/discovery' },
  { name: 'Topology', icon: Network, to: '/topology' },
  { name: 'Alerts', icon: Bell, to: '/alerts' },
  { name: 'Logs', icon: ScrollText, to: '/logs' },
]

export default function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { alerts, alertBanner, dismissBanner } = useRealtime()
  const unread = alerts.length
  const expanded = hovered

  return (
    <>
      {/* Alert banner */}
      {alertBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 px-6 py-2.5 flex items-center justify-between text-sm font-medium anim-fade-in" style={{ background: alertBanner.severity === 'critical' ? 'var(--danger)' : 'var(--warning)', color: '#fff', borderRadius: '0 0 12px 12px' }}>
          <span className="flex items-center gap-2"><AlertTriangle size={14} /><span className="uppercase tracking-wide text-[10px] font-bold">{alertBanner.severity}</span>{alertBanner.message}</span>
          <button onClick={dismissBanner} className="p-1 opacity-70 hover:opacity-100 transition-opacity"><X size={14} /></button>
        </div>
      )}

      {/* Backdrop blur overlay */}
      <div
        className="fixed inset-0 z-30 transition-all duration-300 pointer-events-none"
        style={{
          backdropFilter: expanded ? 'blur(6px)' : 'blur(0px)',
          WebkitBackdropFilter: expanded ? 'blur(6px)' : 'blur(0px)',
          background: expanded ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0)',
          opacity: expanded ? 1 : 0,
        }}
        onClick={() => setHovered(false)}
      />

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed left-3 top-3 bottom-3 z-40 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden"
        style={{
          width: expanded ? 220 : 60,
          background: 'var(--sidebar-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: expanded ? '0 12px 48px var(--card-glow), 0 0 0 1px var(--border)' : '0 2px 16px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-dim)' }}>
            <Network size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="overflow-hidden transition-all duration-300" style={{ width: expanded ? 140 : 0, opacity: expanded ? 1 : 0, marginLeft: expanded ? 10 : 0 }}>
            <h1 className="text-sm font-bold tracking-tight whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>NMS</h1>
            <p className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Network Ops</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden">
          {expanded && <p className="px-2 pb-2 pt-1 text-[9px] font-semibold tracking-widest uppercase anim-fade-in" style={{ color: 'var(--text-muted)' }}>Navigation</p>}
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              end={item.to === '/'}
              title={!expanded ? item.name : undefined}
              className="group flex items-center rounded-xl text-[13px] font-medium transition-all duration-200 relative"
              style={({ isActive }) => ({
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                padding: expanded ? '8px 10px' : '10px 0',
                justifyContent: expanded ? 'flex-start' : 'center',
                gap: expanded ? 10 : 0,
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" style={{ background: 'var(--accent)' }} />}
                  <item.icon size={expanded ? 16 : 18} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  <span className="whitespace-nowrap transition-all duration-300 overflow-hidden" style={{ width: expanded ? 120 : 0, opacity: expanded ? 1 : 0 }}>{item.name}</span>
                  {item.to === '/alerts' && unread > 0 && (
                    <span className="absolute rounded-full text-[8px] font-bold text-white flex items-center justify-center" style={{ background: 'var(--danger)', width: 16, height: 16, top: 4, right: expanded ? 8 : 2 }}>{unread > 9 ? '9+' : unread}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom — theme + user */}
        <div className="px-2 pb-3 space-y-1 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            className="flex items-center w-full rounded-xl text-[13px] font-medium transition-all duration-200"
            style={{ color: 'var(--text-secondary)', padding: expanded ? '8px 10px' : '10px 0', justifyContent: expanded ? 'flex-start' : 'center', gap: expanded ? 10 : 0 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sidebar-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {theme === 'dark' ? <Sun size={expanded ? 16 : 18} className="shrink-0" /> : <Moon size={expanded ? 16 : 18} className="shrink-0" />}
            <span className="whitespace-nowrap transition-all duration-300 overflow-hidden" style={{ width: expanded ? 120 : 0, opacity: expanded ? 1 : 0 }}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <div className="flex items-center rounded-xl transition-all duration-200" style={{ padding: expanded ? '8px 10px' : '10px 0', justifyContent: expanded ? 'flex-start' : 'center', gap: expanded ? 10 : 0 }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white" style={{ background: 'var(--accent)' }}>
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="overflow-hidden transition-all duration-300" style={{ width: expanded ? 100 : 0, opacity: expanded ? 1 : 0 }}>
              <p className="text-[12px] font-semibold whitespace-nowrap truncate" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
              <p className="text-[9px] uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{user?.role}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="shrink-0 p-1.5 rounded-lg transition-all duration-200 overflow-hidden"
              style={{ color: 'var(--text-muted)', width: expanded ? 28 : 0, opacity: expanded ? 1 : 0, marginLeft: expanded ? 'auto' : 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-dim)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
