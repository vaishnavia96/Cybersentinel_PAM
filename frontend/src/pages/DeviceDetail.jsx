import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ReactDiffViewer from 'react-diff-viewer-continued'
import api from '../api'
import { useRealtime } from '../context/RealtimeContext'
import { useAuth } from '../context/AuthContext'
import SshTerminal from '../components/SshTerminal'
import { ArrowLeft, Cpu, MemoryStick, Clock, Download, Loader2, FileText, Eye, GitCompare, X, CheckCircle2, AlertCircle, TerminalSquare, HardDrive, Network, Activity, Search } from 'lucide-react'

const TIME_RANGES = [{ label: '1H', hours: 1 }, { label: '6H', hours: 6 }, { label: '24H', hours: 24 }, { label: '7D', hours: 168 }]
const statusBadgeStyle = {
  up: { background: 'var(--success-dim)', color: 'var(--success)' },
  down: { background: 'var(--danger-dim)', color: 'var(--danger)' },
  unknown: { background: 'var(--bg-hover)', color: 'var(--text-muted)' },
}

function formatBytes(b) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg p-3 text-xs border" style={{ background: 'var(--bg-elevated, var(--bg-surface))', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
      <p className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>{entry.name}: {Number(entry.value).toFixed(1)}%</p>
      ))}
    </div>
  )
}

export default function DeviceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { deviceStatuses, latestMetrics } = useRealtime()
  const { token } = useAuth()

  const [device, setDevice] = useState(null)
  const [chartData, setChartData] = useState([])
  const [rangeIdx, setRangeIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('metrics')
  const [deepData, setDeepData] = useState(null)
  const [software, setSoftware] = useState([])
  const [swSearch, setSwSearch] = useState('')
  const [configs, setConfigs] = useState([])
  const [backingUp, setBackingUp] = useState(false)
  const [backupResult, setBackupResult] = useState(null)
  const [viewContent, setViewContent] = useState(null)
  const [viewMeta, setViewMeta] = useState(null)
  const [diffMode, setDiffMode] = useState(false)
  const [diffA, setDiffA] = useState(null)
  const [diffB, setDiffB] = useState(null)
  const [diffContentA, setDiffContentA] = useState('')
  const [diffContentB, setDiffContentB] = useState('')

  useEffect(() => { api.get(`/devices/${id}`).then((r) => setDevice(r.data)).catch(() => navigate('/inventory')).finally(() => setLoading(false)) }, [id, navigate])

  useEffect(() => {
    const range = TIME_RANGES[rangeIdx]; const end = new Date().toISOString(); const start = new Date(Date.now() - range.hours * 3600000).toISOString()
    api.get('/metrics/historical', { params: { device_id: id, start_time: start, end_time: end } }).then((r) => {
      const grouped = {}; for (const m of r.data) { if (m.labels && Object.keys(m.labels).length > 0) continue; const ts = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); if (!grouped[ts]) grouped[ts] = { time: ts }; grouped[ts][m.metric_name] = m.metric_value }
      setChartData(Object.values(grouped))
    }).catch(() => setChartData([]))
  }, [id, rangeIdx])

  const loadDeep = useCallback(() => { api.get(`/metrics/latest/${id}`).then((r) => setDeepData(r.data)).catch(() => {}) }, [id])
  useEffect(() => { if (['interfaces', 'storage', 'processes'].includes(tab)) loadDeep() }, [tab, id, loadDeep])
  useEffect(() => { if (tab === 'software') api.get(`/devices/${id}/software`).then((r) => setSoftware(r.data)).catch(() => {}) }, [tab, id])
  const loadConfigs = () => api.get(`/config/history/${id}`).then((r) => setConfigs(r.data)).catch(() => {})
  useEffect(() => { if (tab === 'config') loadConfigs() }, [tab, id])

  const triggerBackup = async () => { setBackingUp(true); setBackupResult(null); try { const r = await api.post(`/config/backup/trigger?device_id=${id}`); setBackupResult(r.data); loadConfigs() } catch (err) { setBackupResult({ status: 'error', detail: err.response?.data?.detail || 'Failed' }) } finally { setBackingUp(false) } }
  const viewConfig = async (meta) => { try { const r = await api.get(`/config/view/${meta.id}`); setViewContent(r.data); setViewMeta(meta) } catch {} }
  const selectForDiff = (meta) => { if (!diffA) setDiffA(meta); else if (!diffB && meta.id !== diffA.id) setDiffB(meta) }
  useEffect(() => { if (diffA && diffB) { Promise.all([api.get(`/config/view/${diffA.id}`), api.get(`/config/view/${diffB.id}`)]).then(([a, b]) => { setDiffContentA(a.data); setDiffContentB(b.data) }).catch(() => {}) } }, [diffA, diffB])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  )
  if (!device) return null

  const liveStatus = deviceStatuses[device.id] || device.status
  const live = latestMetrics[device.id] || {}
  const filteredSw = software.filter((s) => s.software_name.toLowerCase().includes(swSearch.toLowerCase()))
  const tabs = [
    { key: 'metrics', label: 'Performance' },
    { key: 'interfaces', label: 'Interfaces', icon: Network },
    { key: 'storage', label: 'Storage', icon: HardDrive },
    { key: 'processes', label: 'Processes', icon: Activity },
    { key: 'software', label: 'Software', icon: FileText },
    { key: 'config', label: 'Config' },
    { key: 'ssh', label: 'SSH', icon: TerminalSquare },
  ]

  return (
    <>
    <div className="anim-fade-up">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/inventory')}
          className="p-2 rounded-lg transition-colors duration-300"
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = ''}
        >
          <ArrowLeft size={20} style={{ color: 'var(--text-muted)' }} />
        </button>
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{device.hostname || device.ip_address}</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {device.ip_address}{device.vendor && ` — ${device.vendor}`}{device.model && ` ${device.model}`}{device.location && ` | ${device.location}`}
          </p>
        </div>
        <span
          className="ml-auto inline-block px-3 py-1 rounded-full text-xs font-medium capitalize"
          style={statusBadgeStyle[liveStatus] || statusBadgeStyle.unknown}
        >
          {liveStatus}
        </span>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-lg p-0.5 mb-6 overflow-x-auto"
        style={{ background: 'var(--bg-hover)' }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors duration-300"
            style={tab === t.key
              ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px var(--shadow)' }
              : { color: 'var(--text-secondary)' }}
          >
            {t.icon && <t.icon size={14} />}{t.label}
          </button>
        ))}
      </div>

      {/* Performance tab */}
      {tab === 'metrics' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div
              className="card-glass p-5"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>CPU</span>
                <Cpu size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {live.cpu_utilization != null ? `${Number(live.cpu_utilization).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div
              className="card-glass p-5"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Memory</span>
                <MemoryStick size={18} className="text-purple-400" />
              </div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {live.memory_utilization != null ? `${Number(live.memory_utilization).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div
              className="card-glass p-5"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Uptime</span>
                <Clock size={18} className="text-green-400" />
              </div>
              <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {live.uptime != null ? `${(Number(live.uptime) / 8640000).toFixed(1)} days` : '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>History</h3>
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg-hover)' }}>
              {TIME_RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-300"
                  style={rangeIdx === i
                    ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px var(--shadow)' }
                    : { color: 'var(--text-secondary)' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className="card-glass p-5"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <h4 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>CPU</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cpu_utilization" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              className="card-glass p-5"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <h4 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Memory</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="memory_utilization" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Interfaces tab */}
      {tab === 'interfaces' && (
        <div
          className="card-table overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm text-left">
            <thead style={{ background: 'var(--bg-hover)' }}>
              <tr>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Interface</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>In</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Out</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Err In</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Err Out</th>
              </tr>
            </thead>
            <tbody>
              {(!deepData?.interfaces?.length) ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    <Network size={28} className="mx-auto mb-2 opacity-40" />No interface data.
                  </td>
                </tr>
              ) : deepData.interfaces.map((iface, i) => (
                <tr
                  key={i}
                  className="transition-colors duration-300"
                  style={{ borderTop: '1px solid var(--border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td className="px-5 py-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: iface.if_oper_status === 1 ? 'var(--success)' : 'var(--danger)' }}
                    />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{iface.name}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{formatBytes(iface.if_in_bytes || 0)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{formatBytes(iface.if_out_bytes || 0)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">
                    {iface.if_err_in
                      ? <span style={{ color: 'var(--danger)' }}>{iface.if_err_in}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>0</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs">
                    {iface.if_err_out
                      ? <span style={{ color: 'var(--danger)' }}>{iface.if_err_out}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>0</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Storage tab */}
      {tab === 'storage' && (
        <div className="space-y-3">
          {(!deepData?.storage?.length) ? (
            <div
              className="card-glass p-12 text-center"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <HardDrive size={28} className="mx-auto mb-2 opacity-40" />No storage data.
            </div>
          ) : deepData.storage.map((s, i) => {
            const pct = s.storage_used_pct || 0
            const isRam = s.type === 'ram'
            return (
              <div
                key={i}
                className="card-glass p-4"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isRam
                      ? <MemoryStick size={16} className="text-purple-400" />
                      : <HardDrive size={16} style={{ color: 'var(--accent)' }} />
                    }
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.mount}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                      style={isRam
                        ? { background: '#f3e8ff', color: '#7c3aed' }
                        : { background: 'var(--accent-dim)', color: 'var(--accent)' }
                      }
                    >
                      {s.type}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatBytes(s.storage_used_bytes || 0)} / {formatBytes(s.storage_total_bytes || 0)}
                  </span>
                </div>
                <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : isRam ? '#8b5cf6' : 'var(--accent)',
                    }}
                  />
                </div>
                <p className="text-right text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</p>
              </div>
            )
          })}
          {deepData?.cores?.length > 0 && (
            <div
              className="card-glass p-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Cpu size={16} style={{ color: 'var(--accent)' }} />Per-Core CPU
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {deepData.cores.map((c) => (
                  <div key={c.core} className="text-center">
                    <div className="w-full rounded-full h-2.5 mb-1 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(c.load, 100)}%`,
                          background: c.load > 80 ? 'var(--danger)' : c.load > 50 ? 'var(--warning)' : 'var(--accent)',
                        }}
                      />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Core {c.core}: {c.load.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processes tab */}
      {tab === 'processes' && (
        <div
          className="card-table overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm text-left">
            <thead style={{ background: 'var(--bg-hover)' }}>
              <tr>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>PID</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Process</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Memory (KB)</th>
                <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>CPU Time</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(!deepData?.processes?.length) ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    <Activity size={28} className="mx-auto mb-2 opacity-40" />No process data.
                  </td>
                </tr>
              ) : deepData.processes.map((p, i) => {
                const st = { 1: 'running', 2: 'runnable', 3: 'not-run', 4: 'invalid' }
                return (
                  <tr
                    key={i}
                    className="transition-colors duration-300"
                    style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{p.pid}</td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{(p.proc_mem_kb || 0).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{(p.proc_cpu_time || 0).toLocaleString()}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={p.proc_status === 1
                          ? { background: 'var(--success-dim)', color: 'var(--success)' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
                        }
                      >
                        {st[p.proc_status] || 'unknown'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Software tab */}
      {tab === 'software' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={swSearch}
                onChange={(e) => setSwSearch(e.target.value)}
                placeholder="Search packages..."
                className="t-input w-full pl-9 pr-3 py-2 rounded-lg text-sm"
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filteredSw.length} packages</span>
          </div>
          <div
            className="card-table overflow-hidden max-h-[500px] overflow-y-auto"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0" style={{ background: 'var(--bg-hover)' }}>
                <tr>
                  <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Package</th>
                  <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Discovered</th>
                </tr>
              </thead>
              <tbody>
                {filteredSw.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>No software. Run discovery to collect.</td>
                  </tr>
                ) : filteredSw.map((s) => (
                  <tr
                    key={s.id}
                    className="transition-colors duration-300"
                    style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <td className="px-5 py-2 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{s.software_name}</td>
                    <td className="px-5 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{s.discovered_at ? new Date(s.discovered_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={triggerBackup}
                disabled={backingUp}
                className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300 disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {backingUp ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {backingUp ? 'Backing up...' : 'Trigger Backup'}
              </button>
              <button
                onClick={() => { setDiffMode(!diffMode); setDiffA(null); setDiffB(null); setDiffContentA(''); setDiffContentB('') }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors duration-300"
                style={diffMode
                  ? { background: '#f5f3ff', borderColor: '#a78bfa', color: '#7c3aed' }
                  : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <GitCompare size={16} /> Compare
              </button>
            </div>
            {backupResult && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: backupResult.status === 'error' ? 'var(--danger)' : 'var(--success)' }}
              >
                {backupResult.status === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                {backupResult.detail}
              </div>
            )}
          </div>

          {diffMode && (
            <div
              className="rounded-lg px-4 py-2 mb-4 text-sm border"
              style={{ background: '#f5f3ff', borderColor: '#a78bfa', color: '#7c3aed' }}
            >
              Select two versions.
              {diffA && <span className="ml-2 font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#ede9fe' }}>A: {new Date(diffA.backup_timestamp).toLocaleString()}</span>}
              {diffB && <span className="ml-2 font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#ede9fe' }}>B: {new Date(diffB.backup_timestamp).toLocaleString()}</span>}
            </div>
          )}

          <div
            className="card-table overflow-hidden mb-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <table className="w-full text-sm text-left">
              <thead style={{ background: 'var(--bg-hover)' }}>
                <tr>
                  {diffMode && <th className="px-4 py-3 w-16 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Sel</th>}
                  <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Date</th>
                  <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Checksum</th>
                  <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Change</th>
                  <th className="px-5 py-3 text-xs uppercase font-medium text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.length === 0 ? (
                  <tr>
                    <td colSpan={diffMode ? 5 : 4} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                      <FileText size={32} className="mx-auto mb-2 opacity-40" />No backups.
                    </td>
                  </tr>
                ) : configs.map((c, i) => {
                  const prev = configs[i + 1]
                  const changed = !prev || prev.checksum !== c.checksum
                  const isA = diffA?.id === c.id
                  const isB = diffB?.id === c.id
                  return (
                    <tr
                      key={c.id}
                      className="transition-colors duration-300"
                      style={{
                        borderTop: '1px solid var(--border)',
                        background: isA ? '#f5f3ff' : isB ? 'var(--accent-dim)' : '',
                      }}
                      onMouseEnter={(e) => { if (!isA && !isB) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isA ? '#f5f3ff' : isB ? 'var(--accent-dim)' : '' }}
                    >
                      {diffMode && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => selectForDiff(c)}
                            className="w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold"
                            style={isA
                              ? { borderColor: '#7c3aed', background: '#7c3aed', color: '#fff' }
                              : isB
                                ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' }
                                : { borderColor: 'var(--border)' }
                            }
                          >
                            {isA ? 'A' : isB ? 'B' : ''}
                          </button>
                        </td>
                      )}
                      <td className="px-5 py-3" style={{ color: 'var(--text-primary)' }}>{new Date(c.backup_timestamp).toLocaleString()}</td>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{c.checksum.slice(0, 12)}...</td>
                      <td className="px-5 py-3">
                        {changed
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>Changed</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Same</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => viewConfig(c)}
                          className="text-xs font-medium flex items-center gap-1 ml-auto"
                          style={{ color: 'var(--accent)' }}
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {diffMode && diffContentA && diffContentB && (
            <div
              className="card-table overflow-hidden"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div
                className="px-5 py-3 border-b flex items-center justify-between"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Diff</span>
                <button
                  onClick={() => { setDiffA(null); setDiffB(null); setDiffContentA(''); setDiffContentB('') }}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[500px] overflow-auto text-xs">
                <ReactDiffViewer
                  oldValue={diffContentA}
                  newValue={diffContentB}
                  splitView
                  leftTitle={`A — ${new Date(diffA.backup_timestamp).toLocaleString()}`}
                  rightTitle={`B — ${new Date(diffB.backup_timestamp).toLocaleString()}`}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* SSH tab */}
      {tab === 'ssh' && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <TerminalSquare size={14} className="text-green-400" />
              <span className="text-xs text-gray-300 font-mono">{device.ip_address}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
            </div>
          </div>
          <div className="p-2 h-[calc(100%-2.5rem)]">
            <SshTerminal deviceId={device.id} token={token} savedCred={device.credentials?.find((c) => c.type === 'ssh') || null} />
          </div>
        </div>
      )}

    </div>

      {/* Config Viewer Modal */}
      {viewContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }}>
          <div
            className="rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4 transition-colors duration-300"
            style={{ background: 'var(--bg-surface)' }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Configuration</h3>
                {viewMeta && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{new Date(viewMeta.backup_timestamp).toLocaleString()}</p>
                )}
              </div>
              <button onClick={() => { setViewContent(null); setViewMeta(null) }} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <pre
                className="text-xs font-mono whitespace-pre-wrap rounded-lg p-4 border"
                style={{
                  color: 'var(--text-primary)',
                  background: 'var(--bg-hover)',
                  borderColor: 'var(--border)',
                }}
              >
                {viewContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
