import { useState, useEffect } from 'react'
import api from '../api'
import { useRealtime } from '../context/RealtimeContext'
import { CheckCircle2, Trash2, Plus, X, ShieldAlert } from 'lucide-react'

const sevBadgeStyle = {
  critical: { background: 'var(--danger-dim)', color: 'var(--danger)' },
  warning: { background: 'var(--warning-dim)', color: 'var(--warning)' },
  info: { background: 'var(--accent-dim)', color: 'var(--accent)' },
}

export default function Alerts() {
  const [activeAlerts, setActiveAlerts] = useState([])
  const [allAlerts, setAllAlerts] = useState([])
  const [rules, setRules] = useState([])
  const [tab, setTab] = useState('active')
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [ruleForm, setRuleForm] = useState({ metric_name: 'cpu_utilization', operator: '>', threshold: 90, severity: 'warning' })
  const { alerts: realtimeAlerts } = useRealtime()

  const loadActive = () => api.get('/alerts/active').then((r) => setActiveAlerts(r.data)).catch(() => {})
  const loadAll = () => api.get('/alerts/all').then((r) => setAllAlerts(r.data)).catch(() => {})
  const loadRules = () => api.get('/alerts/rules').then((r) => setRules(r.data)).catch(() => {})
  useEffect(() => { loadActive(); loadAll(); loadRules() }, [])
  useEffect(() => { loadActive() }, [realtimeAlerts])

  const acknowledge = async (id) => { await api.post(`/alerts/acknowledge/${id}`).catch(() => {}); loadActive(); loadAll() }
  const deleteAlert = async (id) => { await api.delete(`/alerts/${id}`).catch(() => {}); loadActive(); loadAll() }
  const addRule = async (e) => { e.preventDefault(); await api.post('/alerts/rules', ruleForm).catch(() => {}); setShowRuleModal(false); loadRules() }
  const deleteRule = async (id) => { await api.delete(`/alerts/rules/${id}`).catch(() => {}); loadRules() }
  const displayAlerts = tab === 'active' ? activeAlerts : allAlerts

  return (
    <>
    <div className="anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Alert Center</h2>
        <div className="flex gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-hover)' }}>
            {['active', 'all', 'rules'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors duration-300"
                style={tab === t
                  ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px var(--shadow)' }
                  : { color: 'var(--text-secondary)' }}
              >
                {t === 'active' ? `Active (${activeAlerts.length})` : t === 'all' ? 'History' : 'Rules'}
              </button>
            ))}
          </div>
          {tab === 'rules' && (
            <button
              onClick={() => setShowRuleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-300"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={14} /> Add Rule
            </button>
          )}
        </div>
      </div>

      {tab !== 'rules' && (
        <div
          className="card-table overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm text-left">
            <thead style={{ background: 'var(--bg-hover)' }}>
              <tr>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Severity</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Device</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Message</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Triggered</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    <ShieldAlert size={32} className="mx-auto mb-2 opacity-40" />
                    {tab === 'active' ? 'No active alerts' : 'No alert history'}
                  </td>
                </tr>
              ) : displayAlerts.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors duration-300"
                  style={{
                    borderTop: '1px solid var(--border)',
                    background: !a.resolved_at ? 'var(--danger-dim)' : '',
                  }}
                >
                  <td className="px-5 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                      style={sevBadgeStyle[a.severity] || sevBadgeStyle.info}
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{a.device_id}</td>
                  <td className="px-5 py-3 max-w-md truncate" style={{ color: 'var(--text-secondary)' }}>{a.message}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(a.triggered_at).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    {a.resolved_at
                      ? <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>Resolved</span>
                      : <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>Open</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    {!a.resolved_at && (
                      <button
                        onClick={() => acknowledge(a.id)}
                        className="text-xs font-medium"
                        style={{ color: 'var(--success)' }}
                      >
                        <CheckCircle2 size={15} className="inline mr-0.5" /> Ack
                      </button>
                    )}
                    <button
                      onClick={() => deleteAlert(a.id)}
                      className="text-xs font-medium"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={13} className="inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rules' && (
        <div
          className="card-table overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm text-left">
            <thead style={{ background: 'var(--bg-hover)' }}>
              <tr>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Metric</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Condition</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Severity</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-5 py-3 font-mono" style={{ color: 'var(--text-primary)' }}>{r.metric_name}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{r.operator} {r.threshold}</td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                      style={sevBadgeStyle[r.severity] || sevBadgeStyle.info}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => deleteRule(r.id)}
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
      )}

    </div>

      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }}>
          <div
            className="rounded-xl w-full max-w-sm p-6 mx-4 transition-colors duration-300"
            style={{ background: 'var(--bg-surface)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>New Alert Rule</h3>
              <button onClick={() => setShowRuleModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <form onSubmit={addRule} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Metric</label>
                <select value={ruleForm.metric_name} onChange={(e) => setRuleForm({ ...ruleForm, metric_name: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm">
                  <option value="cpu_utilization">CPU Utilization</option>
                  <option value="memory_utilization">Memory Utilization</option>
                  <option value="uptime">Uptime</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Operator</label>
                  <select value={ruleForm.operator} onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm">
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Threshold</label>
                  <input type="number" step="any" value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: parseFloat(e.target.value) })} className="t-input w-full px-3 py-2 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Severity</label>
                <select value={ruleForm.severity} onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm">
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRuleModal(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="submit" className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300" style={{ background: 'var(--accent)' }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
