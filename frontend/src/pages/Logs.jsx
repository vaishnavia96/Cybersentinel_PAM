import { useState, useEffect } from 'react'
import api from '../api'
import { ScrollText, Search } from 'lucide-react'

const sevColors = {
  emergency: { background: '#7f1d1d', color: '#fff' },
  alert: { background: '#991b1b', color: '#fff' },
  critical: { background: 'var(--danger)', color: '#fff' },
  error: { background: 'var(--danger-dim)', color: 'var(--danger)' },
  warning: { background: 'var(--warning-dim)', color: 'var(--warning)' },
  notice: { background: 'var(--accent-dim)', color: 'var(--accent)' },
  info: { background: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  debug: { background: 'var(--bg-hover)', color: 'var(--text-muted)' },
}
const SEV_OPTIONS = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [severity, setSeverity] = useState('')
  const [keyword, setKeyword] = useState('')
  const [hours, setHours] = useState(24)

  useEffect(() => { api.get('/devices').then((r) => setDevices(r.data)).catch(() => {}) }, [])

  const loadLogs = async () => {
    setLoading(true)
    const params = { limit: 500, start_time: new Date(Date.now() - hours * 3600000).toISOString() }
    if (deviceId) params.device_id = deviceId
    if (severity) params.severity = severity
    if (keyword.trim()) params.keyword = keyword.trim()
    try { const r = await api.get('/syslogs', { params }); setLogs(r.data) } catch { setLogs([]) } finally { setLoading(false) }
  }
  useEffect(() => { loadLogs() }, [deviceId, severity, hours])
  const deviceName = (id) => { const d = devices.find((d) => d.id === id); return d ? (d.hostname || d.ip_address) : `#${id}` }

  return (
    <div className="anim-fade-up">
      <h2 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>System Logs</h2>

      <div
        className="card-glass p-4 mb-4"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Device</label>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="t-input w-full px-3 py-2 rounded-lg text-sm">
              <option value="">All devices</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname || d.ip_address}</option>)}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="t-input w-full px-3 py-2 rounded-lg text-sm">
              <option value="">All</option>
              {SEV_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Time Range</label>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="t-input w-full px-3 py-2 rounded-lg text-sm">
              <option value={1}>Last 1 hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Keyword Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                placeholder="e.g. Interface Down"
                className="t-input flex-1 px-3 py-2 rounded-lg text-sm"
              />
              <button
                onClick={loadLogs}
                className="px-3 py-2 text-white rounded-lg transition-colors duration-300"
                style={{ background: 'var(--accent)' }}
              >
                <Search size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{logs.length} log entries</span>
        {loading && <span className="text-xs" style={{ color: 'var(--accent)' }}>Loading...</span>}
      </div>

      <div
        className="card-table overflow-hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          <table className="w-full text-xs text-left font-mono">
            <thead
              className="sticky top-0"
              style={{ background: 'var(--bg-hover)' }}
            >
              <tr>
                <th className="px-4 py-2.5 w-40 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Timestamp</th>
                <th className="px-4 py-2.5 w-28 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Device</th>
                <th className="px-4 py-2.5 w-24 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Severity</th>
                <th className="px-4 py-2.5 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm font-sans" style={{ color: 'var(--text-muted)' }}>
                    <ScrollText size={32} className="mx-auto mb-2 opacity-40" />
                    No log entries found.
                  </td>
                </tr>
              ) : logs.map((l, i) => (
                <tr
                  key={i}
                  className="transition-colors duration-300"
                  style={{ borderTop: '1px solid var(--border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{deviceName(l.device_id)}</td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      style={sevColors[l.severity] || sevColors.info}
                    >
                      {l.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2 break-all" style={{ color: 'var(--text-primary)' }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
