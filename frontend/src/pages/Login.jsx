import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Network, ArrowRight, Sun, Moon } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSubmitting(true)
    try { await login(username, password); navigate('/', { replace: true }) }
    catch (err) { setError(err.response?.data?.detail || err.message || 'Login failed') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 transition-all duration-400" style={{ background: 'var(--gradient-bg)' }}>
      <button onClick={toggle} className="absolute top-6 right-6 p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-sm anim-fade-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: 'var(--accent-dim)' }}>
            <Network size={26} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>NMS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Network Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="card-glass p-7 space-y-5">
          {error && <div className="text-sm rounded-lg px-4 py-2.5" style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>{error}</div>}

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-colors t-input" placeholder="Enter username" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-colors t-input" placeholder="Enter password" required />
          </div>

          <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 hover:brightness-110" style={{ background: 'var(--accent)' }}>
            {submitting ? 'Signing in...' : <><span>Sign In</span><ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    </div>
  )
}
