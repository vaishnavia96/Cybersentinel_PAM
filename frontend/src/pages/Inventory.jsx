import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useRealtime } from '../context/RealtimeContext'
import { Plus, X, Server, Search, ChevronUp, ChevronDown, ChevronsUpDown, Filter, ScanLine, Loader2, RefreshCw } from 'lucide-react'

const statusBadge = {
  up: { background: 'var(--success-dim)', color: 'var(--success)' },
  down: { background: 'var(--danger-dim)', color: 'var(--danger)' },
  unknown: { background: 'var(--bg-hover)', color: 'var(--text-muted)' },
}

export default function Inventory() {
  const [devices, setDevices] = useState([])
  const [credentials, setCredentials] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ip_address: '', hostname: '', vendor: '', model: '', credential_ids: [] })
  const [error, setError] = useState('')
  const { deviceStatuses } = useRealtime()
  const navigate = useNavigate()

  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [columnFilters, setColumnFilters] = useState({ ip_address: '', hostname: '', vendor: '', model: '', os_info: '' })
  const [showColumnFilters, setShowColumnFilters] = useState(false)
  const [sortKey, setSortKey] = useState('ip_address')
  const [sortDir, setSortDir] = useState('asc')

  // Force scan state
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [scanningIds, setScanningIds] = useState(new Set())
  const [scanAllLoading, setScanAllLoading] = useState(false)
  const [scanResults, setScanResults] = useState({}) // device_id → { status, detail }

  const loadDevices = () => api.get('/devices').then((r) => setDevices(r.data))
  const loadCredentials = () => api.get('/credentials').then((r) => setCredentials(r.data)).catch(() => {})
  useEffect(() => { loadDevices(); loadCredentials() }, [])

  const handleAdd = async (e) => {
    e.preventDefault(); setError('')
    try { await api.post('/devices', form); setShowModal(false); setForm({ ip_address: '', hostname: '', vendor: '', model: '', credential_ids: [] }); loadDevices() }
    catch (err) { setError(err.response?.data?.detail || 'Failed') }
  }
  const handleDelete = async (e, id) => {
    e.stopPropagation()
    try { await api.delete(`/devices/${id}`); loadDevices() } catch (err) { alert(err.response?.data?.detail || 'Delete failed') }
  }
  const toggleSort = (key) => { if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc') } }
  const setColFilter = (key, val) => setColumnFilters((p) => ({ ...p, [key]: val }))

  const applyResults = useCallback((results) => {
    setScanResults((prev) => {
      const next = { ...prev }
      for (const r of results) next[r.device_id] = r
      return next
    })
    loadDevices()
  }, [])

  const forceScan = useCallback(async (deviceIds, opts = {}) => {
    const ids = deviceIds
    if (!opts.all) ids.forEach(id => setScanningIds(s => new Set([...s, id])))
    else setScanAllLoading(true)
    try {
      const res = await api.post('/devices/rescan', opts.all ? { all: true } : { device_ids: ids })
      applyResults(res.data)
    } catch (err) {
      console.error('Rescan failed', err)
    } finally {
      if (!opts.all) ids.forEach(id => setScanningIds(s => { const n = new Set(s); n.delete(id); return n }))
      else setScanAllLoading(false)
    }
  }, [applyResults])

  const toggleSelect = (id) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(d => d.id)))
  }

  const filtered = useMemo(() => {
    let list = devices.map((d) => ({ ...d, _status: deviceStatuses[d.id] || d.status }))
    if (statusFilter !== 'all') list = list.filter((d) => d._status === statusFilter)
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase()
      list = list.filter((d) => d.ip_address.toLowerCase().includes(q) || (d.hostname || '').toLowerCase().includes(q) || (d.vendor || '').toLowerCase().includes(q) || (d.model || '').toLowerCase().includes(q) || (d.os_info || '').toLowerCase().includes(q) || d.credentials?.some((c) => c.name.toLowerCase().includes(q)))
    }
    for (const [key, val] of Object.entries(columnFilters)) {
      if (val.trim()) { const q = val.toLowerCase(); list = list.filter((d) => (d[key] || '').toLowerCase().includes(q)) }
    }
    list.sort((a, b) => {
      let va = a[sortKey] || '', vb = b[sortKey] || ''
      if (sortKey === 'status') { va = a._status; vb = b._status }
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [devices, deviceStatuses, globalSearch, statusFilter, columnFilters, sortKey, sortDir])

  const statusCounts = useMemo(() => {
    const all = devices.map((d) => deviceStatuses[d.id] || d.status)
    return { all: devices.length, up: all.filter((s) => s === 'up').length, down: all.filter((s) => s === 'down').length, unknown: all.filter((s) => s === 'unknown').length }
  }, [devices, deviceStatuses])

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} style={{ color: 'var(--text-muted)' }} />
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: 'var(--accent)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--accent)' }} />
  }

  const columns = [
    { key: 'ip_address', label: 'IP Address' },
    { key: 'hostname', label: 'Hostname' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'model', label: 'Model' },
    { key: 'os_info', label: 'OS' },
    { key: 'status', label: 'Status' },
    { key: 'snmp_status', label: 'SNMP' },
  ]

  return (
    <>
    <div className="anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Inventory</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{filtered.length} of {devices.length} devices</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} /> Add Device
        </button>
      </div>

      {/* Toolbar */}
      <div
        className="card-glass !rounded-b-none p-3 flex flex-wrap items-center gap-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search all columns..."
            className="t-input w-full pl-9 pr-3 py-1.5 rounded-lg text-sm"
          />
        </div>
        <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-hover)' }}>
          {[{ key: 'all', label: `All (${statusCounts.all})` }, { key: 'up', label: `Up (${statusCounts.up})` }, { key: 'down', label: `Down (${statusCounts.down})` }, { key: 'unknown', label: `Unknown (${statusCounts.unknown})` }].map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-300"
              style={statusFilter === t.key
                ? { background: 'var(--bg-surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px var(--shadow)' }
                : { color: 'var(--text-secondary)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowColumnFilters(!showColumnFilters)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-300"
          style={showColumnFilters
            ? { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent)' }
            : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Filter size={12} /> Filters
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {selectedIds.size > 0 && (
            <button
              onClick={() => forceScan([...selectedIds])}
              disabled={scanningIds.size > 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              {scanningIds.size > 0 ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
              Scan Selected ({selectedIds.size})
            </button>
          )}
          <button
            onClick={() => forceScan([], { all: true })}
            disabled={scanAllLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {scanAllLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {scanAllLoading ? 'Scanning All…' : 'Scan All'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="card-table !rounded-t-none !border-t-0 overflow-hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <table className="w-full text-sm text-left">
          <thead>
            <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
              <th className="pl-4 pr-2 py-3 w-8">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="px-5 py-3 text-xs font-medium uppercase cursor-pointer select-none"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="flex items-center gap-1.5">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-5 py-3 text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Credentials</th>
              <th className="px-5 py-3 text-xs font-medium uppercase text-right" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
            {showColumnFilters && (
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                <th className="pl-4 pr-2 py-2" />
                {columns.map((col) => (
                  <th key={col.key} className="px-5 py-2">
                    {col.key !== 'status' && col.key !== 'snmp_status' && col.key !== 'os_info' ? (
                      <input
                        type="text"
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColFilter(col.key, e.target.value)}
                        placeholder="Filter..."
                        className="t-input w-full px-2 py-1 rounded text-xs"
                      />
                    ) : <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{col.key === 'status' ? 'Use tabs' : ''}</span>}
                  </th>
                ))}
                <th className="px-5 py-2" />
                <th className="px-5 py-2 text-right">
                  <button
                    onClick={() => { setColumnFilters({ ip_address: '', hostname: '', vendor: '', model: '', os_info: '' }); setGlobalSearch(''); setStatusFilter('all') }}
                    className="text-xs font-medium"
                    style={{ color: 'var(--accent)' }}
                  >
                    Clear All
                  </button>
                </th>
              </tr>
            )}
          </thead>
          <tbody style={{ borderTop: 'none' }}>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  <Server size={32} className="mx-auto mb-2 opacity-40" />
                  {devices.length === 0 ? 'No devices found. Add one to get started.' : 'No devices match the current filters.'}
                </td>
              </tr>
            ) : filtered.map((d) => {
              const snmpSt = d.snmp_status === 'on' ? 'on' : 'off'
              const snmpStyle = snmpSt === 'on'
                ? { background: 'var(--success-dim)', color: 'var(--success)' }
                : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
              const isScanning = scanningIds.has(d.id)
              const isSelected = selectedIds.has(d.id)
              const scanResult = scanResults[d.id]
              return (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/inventory/${d.id}`)}
                  className="cursor-pointer transition-colors duration-300"
                  style={{ borderTop: '1px solid var(--border)', background: isSelected ? 'var(--accent-dim)' : undefined }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = '' }}
                >
                  <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(d.id)}
                      className="rounded cursor-pointer"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: 'var(--text-primary)' }}>{d.ip_address}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.hostname || '—'}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.vendor || '—'}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.model || '—'}</td>
                  <td className="px-5 py-3 max-w-[180px]">
                    {d._status === 'up' ? (
                      d.os_info
                        ? <span className="inline-block truncate text-xs font-mono max-w-full" style={{ color: 'var(--text-secondary)' }} title={d.os_info}>{d.os_info}</span>
                        : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending poll</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                      style={statusBadge[d._status] || statusBadge.unknown}
                    >
                      {d._status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={snmpStyle}>
                      {snmpSt === 'on' ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{d.credentials?.map((c) => c.name).join(', ') || '—'}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => forceScan([d.id])}
                        disabled={isScanning || scanAllLoading}
                        title="Force scan this device"
                        className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-40"
                        style={{ color: isScanning ? 'var(--accent)' : scanResult ? (scanResult.status === 'up' ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)' }}
                      >
                        {isScanning
                          ? <Loader2 size={13} className="animate-spin" />
                          : <ScanLine size={13} />}
                        Scan
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, d.id)}
                        className="text-xs font-medium"
                        style={{ color: 'var(--danger)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div
          className="px-5 py-2 flex items-center justify-between text-xs"
          style={{ background: 'var(--bg-hover)', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span>Showing {filtered.length} of {devices.length}</span>
          <span>Sort: {columns.find((c) => c.key === sortKey)?.label} ({sortDir})</span>
        </div>
      </div>

    </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }}>
          <div className="rounded-xl w-full max-w-md p-6 mx-4 transition-colors duration-300" style={{ background: 'var(--bg-surface)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Add Device</h3>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            {error && <div className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>{error}</div>}
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>IP Address *</label>
                <input type="text" required value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" placeholder="192.168.1.1" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Hostname</label>
                <input type="text" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" placeholder="core-switch-01" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Vendor</label>
                  <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" placeholder="Cisco" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Model</label>
                  <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="t-input w-full px-3 py-2 rounded-lg text-sm" placeholder="C9300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Credentials</label>
                <select
                  multiple
                  value={form.credential_ids.map(String)}
                  onChange={(e) => setForm({ ...form, credential_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
                  className="t-input w-full px-3 py-2 rounded-lg text-sm"
                >
                  {credentials.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                </select>
              </div>
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
                  Add Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
