import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useRealtime } from '../context/RealtimeContext'
import {
  Activity, Wifi, WifiOff, Server, KeyRound, Zap, Play, Square,
  AlertTriangle, Bell, Network, RefreshCw,
  Cpu, MemoryStick, Clock, ChevronRight, CheckCircle2, XCircle, ShieldCheck
} from 'lucide-react'

// ── SVG Donut Ring ───────────────────────────────────────────────────────────
function DonutRing({ up, down, unknown, size = 120 }) {
  const total = up + down + unknown || 1
  const r = 44
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  const upPct = up / total
  const downPct = down / total
  const unknownPct = unknown / total

  const upDash = upPct * circ
  const downDash = downPct * circ
  const unknownDash = unknownPct * circ

  const upOffset = 0
  const downOffset = -(upDash)
  const unknownOffset = -(upDash + downDash)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* bg track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      {unknown > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--warning)" strokeWidth={10}
          strokeDasharray={`${unknownDash} ${circ - unknownDash}`}
          strokeDashoffset={unknownOffset} strokeLinecap="round" />
      )}
      {down > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--danger)" strokeWidth={10}
          strokeDasharray={`${downDash} ${circ - downDash}`}
          strokeDashoffset={downOffset} strokeLinecap="round" />
      )}
      {up > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--success)" strokeWidth={10}
          strokeDasharray={`${upDash} ${circ - upDash}`}
          strokeDashoffset={upOffset} strokeLinecap="round" />
      )}
    </svg>
  )
}

// ── Mini Sparkline ────────────────────────────────────────────────────────────
function MiniBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-hover)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color || 'var(--accent)' }} />
      </div>
      <span className="text-[10px] font-mono w-8 text-right" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Severity badge ─────────────────────────────────────────────────────────
function SevBadge({ sev }) {
  const s = {
    critical: { bg: 'var(--danger-dim)', color: 'var(--danger)' },
    warning: { bg: 'var(--warning-dim)', color: 'var(--warning)' },
    info: { bg: 'var(--success-dim)', color: 'var(--success)' },
  }[sev] || { bg: 'var(--bg-hover)', color: 'var(--text-muted)' }
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={s}>{sev}</span>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status, pulse }) {
  const colors = { up: 'var(--success)', down: 'var(--danger)', unknown: 'var(--warning)' }
  const c = colors[status] || 'var(--text-muted)'
  return <span className={`w-2 h-2 rounded-full shrink-0 inline-block ${pulse ? 'anim-pulse' : ''}`} style={{ background: c }} />
}

// ── Format uptime ─────────────────────────────────────────────────────────────
function fmtUptime(seconds) {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconColor, accent, onClick }) {
  return (
    <div
      className={`card-glass p-4 flex flex-col gap-1 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: iconColor || 'var(--text-muted)' }} />}
      </div>
      <p className="text-3xl font-bold font-mono leading-none" style={{ color: accent || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── Needs Attention ───────────────────────────────────────────────────────────
function NeedsAttention({ devices, deviceStatuses, latestMetrics, navigate }) {
  const items = useMemo(() => {
    const out = []
    for (const d of devices) {
      const status = deviceStatuses[d.id] || d.status || 'unknown'
      const m = latestMetrics[d.id] || {}
      const cpu = m.cpu_utilization ?? m.hrProcessorLoad ?? null
      const mem = m.memory_utilization ?? null
      const name = d.hostname || d.ip_address

      if (status === 'down') {
        out.push({ id: d.id, name, ip: d.ip_address, type: 'offline', label: 'OFFLINE', color: 'var(--danger)', bg: 'var(--danger-dim)', detail: 'Not reachable', priority: 0 })
      } else if (status === 'unknown') {
        out.push({ id: d.id, name, ip: d.ip_address, type: 'unknown', label: 'UNKNOWN', color: 'var(--warning)', bg: 'var(--warning-dim)', detail: 'Pending poll', priority: 2 })
      }
      if (cpu !== null && cpu > 80) {
        out.push({ id: d.id, name, ip: d.ip_address, type: 'cpu', label: 'HIGH CPU', color: cpu > 90 ? 'var(--danger)' : 'var(--warning)', bg: cpu > 90 ? 'var(--danger-dim)' : 'var(--warning-dim)', detail: `${cpu.toFixed(0)}% utilization`, priority: cpu > 90 ? 1 : 3 })
      }
      if (mem !== null && mem > 85) {
        out.push({ id: d.id, name, ip: d.ip_address, type: 'mem', label: 'HIGH MEM', color: mem > 95 ? 'var(--danger)' : 'var(--warning)', bg: mem > 95 ? 'var(--danger-dim)' : 'var(--warning-dim)', detail: `${mem.toFixed(0)}% used`, priority: mem > 95 ? 1 : 3 })
      }
    }
    return out.sort((a, b) => a.priority - b.priority).slice(0, 10)
  }, [devices, deviceStatuses, latestMetrics])

  const icon = { offline: XCircle, unknown: AlertTriangle, cpu: Cpu, mem: MemoryStick }

  return (
    <div className="card-glass p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Needs Attention</p>
        {items.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>{items.length} issue{items.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck size={28} className="opacity-40" style={{ color: 'var(--success)' }} />
          <p className="text-xs font-medium" style={{ color: 'var(--success)' }}>All systems normal</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No offline devices or resource spikes</p>
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 220 }}>
          {items.map((item, i) => {
            const Icon = icon[item.type] || AlertTriangle
            return (
              <div
                key={`${item.id}-${item.type}-${i}`}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer row-hover"
                style={{ background: 'var(--bg-elevated)' }}
                onClick={() => navigate(`/inventory/${item.id}`)}
              >
                <Icon size={12} style={{ color: item.color, shrink: 0 }} />
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ background: item.bg, color: item.color }}>{item.label}</span>
                <span className="flex-1 text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{item.detail}</span>
                <ChevronRight size={11} style={{ color: 'var(--text-muted)', shrink: 0 }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { deviceStatuses, latestMetrics, alerts } = useRealtime()

  const [health, setHealth] = useState(null)
  const [devices, setDevices] = useState([])
  const [credCount, setCredCount] = useState(0)
  const [pollerRunning, setPollerRunning] = useState(false)
  const [pollerLoading, setPollerLoading] = useState(false)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [topoLinks, setTopoLinks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    const [hRes, dRes, cRes, pRes, aRes, tRes] = await Promise.allSettled([
      api.get('/health'),
      api.get('/devices'),
      api.get('/credentials'),
      api.get('/poller/status'),
      api.get('/alerts/active'),
      api.get('/topology/links'),
    ])
    if (hRes.status === 'fulfilled') setHealth(hRes.value.data)
    if (dRes.status === 'fulfilled') setDevices(dRes.value.data)
    if (cRes.status === 'fulfilled') setCredCount(cRes.value.data.length)
    if (pRes.status === 'fulfilled') setPollerRunning(pRes.value.data.running)
    if (aRes.status === 'fulfilled') setActiveAlerts(aRes.value.data)
    if (tRes.status === 'fulfilled') setTopoLinks(tRes.value.data.length)
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const togglePoller = async () => {
    setPollerLoading(true)
    try {
      if (pollerRunning) { await api.post('/poller/stop'); setPollerRunning(false) }
      else { await api.post('/poller/start?interval=30'); setPollerRunning(true) }
    } catch {} finally { setPollerLoading(false) }
  }

  // Derived counts
  const statusCounts = useMemo(() => {
    let up = 0, down = 0, unknown = 0
    for (const d of devices) {
      const st = deviceStatuses[d.id] || d.status || 'unknown'
      if (st === 'up') up++
      else if (st === 'down') down++
      else unknown++
    }
    return { up, down, unknown }
  }, [devices, deviceStatuses])

  const snmpOn = useMemo(() => devices.filter(d => d.snmp_status === 'on').length, [devices])
  const snmpPct = devices.length > 0 ? Math.round((snmpOn / devices.length) * 100) : 0

  // Devices with live metrics — sorted by last poll time
  const metricsDevices = useMemo(() => {
    return devices
      .filter(d => latestMetrics[d.id])
      .map(d => ({ ...d, _m: latestMetrics[d.id], _status: deviceStatuses[d.id] || d.status }))
      .sort((a, b) => (b._m._timestamp > a._m._timestamp ? 1 : -1))
      .slice(0, 8)
  }, [devices, latestMetrics, deviceStatuses])

  const connected = Boolean(health)
  const dbOk = health?.database === 'connected'

  // Alert severity summary from realtime alerts (merged with db active alerts)
  const alertsToShow = useMemo(() => {
    const ws = alerts.slice(0, 15)
    if (ws.length > 0) return ws
    return activeAlerts.slice(0, 15)
  }, [alerts, activeAlerts])

  const critCount = alertsToShow.filter(a => a.severity === 'critical').length
  const warnCount = alertsToShow.filter(a => a.severity === 'warning').length

  return (
    <div className="anim-fade-up space-y-4">

      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Overview</h2>
          {lastRefresh && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Last refreshed {fmtTime(lastRefresh)}
            </p>
          )}
        </div>
        <button onClick={fetchAll} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 anim-stagger">
        <KpiCard label="Total Devices" value={devices.length} icon={Server} sub={`${credCount} credential${credCount !== 1 ? 's' : ''}`} onClick={() => navigate('/inventory')} />
        <KpiCard label="Online" value={statusCounts.up} icon={CheckCircle2} iconColor="var(--success)" accent="var(--success)" sub="Reachable" />
        <KpiCard label="Offline" value={statusCounts.down} icon={XCircle} iconColor="var(--danger)" accent={statusCounts.down > 0 ? 'var(--danger)' : 'var(--text-primary)'} sub="Not reachable" onClick={statusCounts.down > 0 ? () => navigate('/inventory') : undefined} />
        <KpiCard label="Active Alerts" value={alertsToShow.length} icon={Bell} iconColor={critCount > 0 ? 'var(--danger)' : 'var(--warning)'} accent={critCount > 0 ? 'var(--danger)' : 'var(--text-primary)'} sub={critCount > 0 ? `${critCount} critical` : warnCount > 0 ? `${warnCount} warning` : 'All clear'} onClick={() => navigate('/alerts')} />
        <KpiCard label="SNMP Coverage" value={`${snmpPct}%`} icon={Wifi} iconColor={snmpPct >= 70 ? 'var(--success)' : 'var(--warning)'} accent={snmpPct >= 70 ? 'var(--success)' : 'var(--warning)'} sub={`${snmpOn} / ${devices.length} devices`} />
        <KpiCard label="Topo Links" value={topoLinks} icon={Network} sub="Mapped connections" onClick={() => navigate('/topology')} />
      </div>

      {/* ── Row 2: Device health + live metrics ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Device health donut */}
        <div className="card-glass p-5 flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Device Health</p>
          <div className="flex items-center gap-6 flex-1">
            <div className="relative shrink-0">
              <DonutRing up={statusCounts.up} down={statusCounts.down} unknown={statusCounts.unknown} size={110} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{devices.length}</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>total</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              {[
                { label: 'Online', count: statusCounts.up, color: 'var(--success)' },
                { label: 'Offline', count: statusCounts.down, color: 'var(--danger)' },
                { label: 'Unknown', count: statusCounts.unknown, color: 'var(--warning)' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="text-sm font-bold font-mono" style={{ color }}>{count}</span>
                </div>
              ))}
              <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <Wifi size={10} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>SNMP On</span>
                  <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>{snmpOn}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Metrics Table */}
        <div className="card-glass p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Live Metrics</p>
            {Object.keys(latestMetrics).length === 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>Waiting for poller…</span>
            )}
          </div>
          {metricsDevices.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <Cpu size={28} className="opacity-30" />
              <p className="text-xs">No live data yet — start the SNMP poller below</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 220 }}>
              {metricsDevices.map(d => {
                const m = d._m
                const cpu = m.cpu_utilization ?? m.hrProcessorLoad ?? null
                const mem = m.memory_utilization ?? null
                const uptime = m.sysUpTimeSeconds ?? null
                return (
                  <div
                    key={d.id}
                    className="grid gap-2 items-center px-2 py-2 rounded-lg cursor-pointer row-hover"
                    style={{ gridTemplateColumns: '8px 120px 1fr 1fr 60px', borderTop: '1px solid var(--border-subtle)' }}
                    onClick={() => navigate(`/inventory/${d.id}`)}
                  >
                    <StatusDot status={d._status} pulse={d._status === 'up'} />
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{d.hostname || d.ip_address}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Cpu size={9} style={{ color: 'var(--text-muted)' }} />
                        <MiniBar value={cpu} color={cpu > 80 ? 'var(--danger)' : cpu > 60 ? 'var(--warning)' : 'var(--success)'} />
                      </div>
                      <div className="flex items-center gap-1">
                        <MemoryStick size={9} style={{ color: 'var(--text-muted)' }} />
                        <MiniBar value={mem} color={mem > 85 ? 'var(--danger)' : mem > 70 ? 'var(--warning)' : 'var(--accent)'} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={9} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{fmtUptime(uptime)}</span>
                    </div>
                    <span className="text-[10px] font-mono text-right" style={{ color: 'var(--text-muted)' }}>{fmtTime(m._timestamp)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Alerts + Syslogs + System Status ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Active Alerts */}
        <div className="card-glass p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Active Alerts</p>
            <button className="flex items-center gap-1 text-[11px] transition-colors" style={{ color: 'var(--accent)' }} onClick={() => navigate('/alerts')}>
              View all <ChevronRight size={11} />
            </button>
          </div>
          {alertsToShow.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <CheckCircle2 size={28} className="opacity-30" />
              <p className="text-xs">No active alerts</p>
            </div>
          ) : (
            <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 220 }}>
              {alertsToShow.map((a, i) => (
                <div key={a.id || i} className="flex items-start gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: a.severity === 'critical' ? 'var(--danger)' : 'var(--warning)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{a.message || a.metric_name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{a.ip_address || ''} {a.triggered_at ? fmtTime(a.triggered_at) : fmtTime(a.timestamp)}</p>
                  </div>
                  <SevBadge sev={a.severity} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Needs Attention */}
        <NeedsAttention devices={devices} deviceStatuses={deviceStatuses} latestMetrics={latestMetrics} navigate={navigate} />

        {/* System Status + Poller */}
        <div className="card-glass p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>System Status</p>

          {/* Status items */}
          <div className="space-y-2">
            {[
              { label: 'Backend API', ok: connected, icon: Activity },
              { label: 'Database', ok: dbOk, icon: connected ? Wifi : WifiOff },
              { label: 'SNMP Poller', ok: pollerRunning, icon: Zap },
            ].map(({ label, ok, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                <Icon size={13} style={{ color: ok ? 'var(--success)' : 'var(--text-muted)' }} />
                <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>{label}</span>
                <span className={`w-2 h-2 rounded-full ${ok ? 'anim-pulse' : ''}`} style={{ background: ok ? 'var(--success)' : 'var(--bg-hover)' }} />
                <span className="text-[10px]" style={{ color: ok ? 'var(--success)' : 'var(--text-muted)' }}>{ok ? 'OK' : 'Off'}</span>
              </div>
            ))}
          </div>

          {/* Poller control */}
          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>SNMP Poller</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{pollerRunning ? 'Polling every 30s' : 'Stopped'}</p>
              </div>
              <button
                onClick={togglePoller}
                disabled={pollerLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
                style={{
                  color: pollerRunning ? 'var(--danger)' : 'var(--success)',
                  borderColor: pollerRunning ? 'var(--danger)' : 'var(--success)',
                  background: pollerRunning ? 'var(--danger-dim)' : 'var(--success-dim)',
                }}
              >
                {pollerRunning ? <><Square size={12} /> Stop</> : <><Play size={12} /> Start</>}
              </button>
            </div>
          </div>

          {/* Credentials + Topology quick stat */}
          <div className="grid grid-cols-2 gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <button className="flex flex-col items-center gap-1 py-2 rounded-lg transition-colors" style={{ background: 'var(--bg-elevated)' }} onClick={() => navigate('/credentials')}>
              <KeyRound size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{credCount}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Credentials</span>
            </button>
            <button className="flex flex-col items-center gap-1 py-2 rounded-lg transition-colors" style={{ background: 'var(--bg-elevated)' }} onClick={() => navigate('/topology')}>
              <Network size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{topoLinks}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Topo Links</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
