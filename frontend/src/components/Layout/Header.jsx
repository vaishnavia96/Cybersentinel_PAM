import { useNavigate } from 'react-router-dom'
import { Search, Bell, LogOut, X, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../context/RealtimeContext'

export default function Header() {
  const { user, logout } = useAuth()
  const { alerts, alertBanner, dismissBanner } = useRealtime()
  const navigate = useNavigate()
  const unread = alerts.length

  return (
    <>
      {alertBanner && (
        <div className="px-6 py-2 flex items-center justify-between text-sm font-medium anim-fade-in" style={{ background: alertBanner.severity === 'critical' ? 'var(--danger-dim)' : 'var(--warning-dim)', color: alertBanner.severity === 'critical' ? 'var(--danger)' : 'var(--warning)', borderBottom: '1px solid var(--border)' }}>
          <span className="flex items-center gap-2"><AlertTriangle size={14} /><span className="uppercase tracking-wide text-[10px] font-bold">{alertBanner.severity}</span>{alertBanner.message}</span>
          <button onClick={dismissBanner} className="p-1 opacity-60 hover:opacity-100 transition-opacity"><X size={14} /></button>
        </div>
      )}

      <header className="h-14 flex items-center justify-between px-6 border-b transition-colors duration-300" style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search devices, alerts..." className="bg-transparent text-sm outline-none w-72 t-input border-0" style={{ color: 'var(--text-primary)' }} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/alerts')} className="relative p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Bell size={17} />
            {unread > 0 && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: 'var(--danger)' }}>{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className="w-px h-6" style={{ background: 'var(--border)' }} />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{user?.role}</p>
            </div>
            <button onClick={logout} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-dim)' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
