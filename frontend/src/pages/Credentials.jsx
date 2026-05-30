import { useState, useEffect } from 'react'
import api from '../api'
import { Plus, X, Eye, EyeOff, KeyRound } from 'lucide-react'

const typeLabels = { snmp_v2c: 'SNMP v2c', snmp_v3: 'SNMP v3', ssh: 'SSH' }

export default function Credentials() {
  const [creds, setCreds] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [revealed, setRevealed] = useState({})
  const [form, setForm] = useState({ name: '', type: 'ssh', username: '', password: '', community_string: '' })
  const [error, setError] = useState('')

  const load = () => api.get('/credentials').then((r) => setCreds(r.data))
  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault(); setError('')
    try { await api.post('/credentials', form); setShowModal(false); setForm({ name: '', type: 'ssh', username: '', password: '', community_string: '' }); load() }
    catch (err) { setError(err.response?.data?.detail || 'Failed to create credential') }
  }
  const handleDelete = async (id) => { try { await api.delete(`/credentials/${id}`); load() } catch (err) { alert(err.response?.data?.detail || 'Delete failed') } }

  return (
    <>
    <div className="anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Credentials</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} /> Add Credential
        </button>
      </div>
      <div
        className="card-table overflow-hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <table className="w-full text-sm text-left">
          <thead style={{ background: 'var(--bg-hover)' }}>
            <tr>
              <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Name</th>
              <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Type</th>
              <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Username</th>
              <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Secret</th>
              <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {creds.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  <KeyRound size={32} className="mx-auto mb-2 opacity-40" />
                  No credential profiles yet.
                </td>
              </tr>
            ) : creds.map((c) => (
              <tr
                key={c.id}
                className="transition-colors duration-300"
                style={{ borderTop: '1px solid var(--border)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
              >
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                <td className="px-5 py-3">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    {typeLabels[c.type] || c.type}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{c.username || '—'}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}
                    className="flex items-center gap-1.5 text-xs transition-colors duration-300"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {revealed[c.id]
                      ? <><EyeOff size={14} /><span className="font-mono">[encrypted]</span></>
                      : <><Eye size={14} /><span>••••••••</span></>
                    }
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-xs font-medium"
                    style={{ color: 'var(--danger)' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }}>
          <div
            className="rounded-xl w-full max-w-md p-6 mx-4 transition-colors duration-300"
            style={{ background: 'var(--bg-surface)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Add Credential</h3>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            {error && (
              <div className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Profile Name *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" placeholder="Core Switch SNMP" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Type *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm">
                  <option value="ssh">SSH</option>
                  <option value="snmp_v2c">SNMP v2c</option>
                  <option value="snmp_v3">SNMP v3</option>
                </select>
              </div>
              {(form.type === 'ssh' || form.type === 'snmp_v3') && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Username</label>
                    <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Password</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" />
                  </div>
                </>
              )}
              {(form.type === 'snmp_v2c' || form.type === 'snmp_v3') && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Community String</label>
                  <input type="password" value={form.community_string} onChange={(e) => setForm({ ...form, community_string: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300"
                  style={{ background: 'var(--accent)' }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
