import { useState, useEffect, useRef } from 'react'
import api from '../api'
import { Radar, Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'

const statusIcon = {
  up: <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />,
  down: <HelpCircle size={16} style={{ color: 'var(--warning)' }} />,
  error: <XCircle size={16} style={{ color: 'var(--danger)' }} />,
}

const statusLabel = {
  up: 'up',
  down: 'unknown',
  error: 'error',
}

export default function Discovery() {
  const [subnet, setSubnet] = useState('192.168.1.0/24')
  const [credentialId, setCredentialId] = useState('')
  const [credentials, setCredentials] = useState([])
  const [results, setResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    api.get('/credentials').then((r) => setCredentials(r.data)).catch(() => {})
    api.get('/discovery/scan/status').then((r) => {
      if (r.data.running) {
        setScanning(true)
        setSubnet(r.data.subnet || subnet)
        startPolling()
      } else if (r.data.results_count > 0) {
        api.get('/discovery/scan/results').then((r) => setResults(r.data)).catch(() => {})
      }
    }).catch(() => {})
    return () => clearInterval(pollRef.current)
  }, [])

  const startPolling = () => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.get('/discovery/scan/status')
        if (!s.data.running) {
          clearInterval(pollRef.current)
          setScanning(false)
          const r = await api.get('/discovery/scan/results')
          setResults(r.data)
        }
      } catch {}
    }, 2000)
  }

  const runScan = async () => {
    setError(''); setResults([]); setScanning(true)
    try {
      await api.post('/discovery/scan', { subnet, credential_id: credentialId ? Number(credentialId) : null })
      startPolling()
    } catch (err) {
      setError(err.response?.data?.detail || 'Scan failed')
      setScanning(false)
    }
  }

  const upCount = results.filter((r) => r.status === 'up').length
  const downCount = results.filter((r) => r.status !== 'up').length

  return (
    <div className="anim-fade-up">
      <h2 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>Network Discovery</h2>

      {/* Controls */}
      <div
        className="card-glass p-5 mb-6"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Target Subnet</label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.1.0/24"
              className="t-input w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Credential Profile</label>
            <select
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              className="t-input w-full px-3 py-2 rounded-lg text-sm"
            >
              <option value="">All SNMP credentials</option>
              {credentials
                .filter((c) => c.type === 'snmp_v2c' || c.type === 'snmp_v3')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={runScan}
            disabled={scanning || !subnet.trim()}
            className="flex items-center gap-2 px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-300 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {scanning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Radar size={16} />
            )}
            {scanning ? 'Scanning...' : 'Run Active Scan'}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Scanning indicator */}
      {scanning && (
        <div
          className="card-glass p-4 mb-6 flex items-center gap-3"
          style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}
        >
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-sm" style={{ color: 'var(--accent)' }}>
            Scanning <strong>{subnet}</strong> — pinging hosts and running SNMP fingerprinting...
          </span>
        </div>
      )}

      {/* Summary badges */}
      {results.length > 0 && !scanning && (
        <>
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="rounded-lg px-4 py-2 text-sm border" style={{ background: 'var(--success-dim)', borderColor: 'var(--success)' }}>
              <span className="font-semibold" style={{ color: 'var(--success)' }}>{upCount}</span>
              <span className="ml-1" style={{ color: 'var(--success)' }}>hosts up · saved to inventory</span>
            </div>
            <div className="rounded-lg px-4 py-2 text-sm border" style={{ background: 'var(--warning-dim)', borderColor: 'var(--warning)' }}>
              <span className="font-semibold" style={{ color: 'var(--warning)' }}>{downCount}</span>
              <span className="ml-1" style={{ color: 'var(--warning)' }}>no response · stored as unknown · being monitored</span>
            </div>
            <div className="rounded-lg px-4 py-2 text-sm border" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>{results.length}</span>
              <span className="ml-1" style={{ color: 'var(--accent)' }}>total IPs scanned</span>
            </div>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            All {results.length} IPs in <span className="font-mono">{subnet}</span> are now tracked in inventory. The poller will check unknown IPs every 30 seconds and promote them to <span style={{ color: 'var(--success)' }}>up</span> automatically if they come online.
          </p>
        </>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div
          className="card-table overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <table className="w-full text-sm text-left">
            <thead style={{ background: 'var(--bg-hover)' }}>
              <tr>
                <th className="px-5 py-3 w-10 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}></th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>IP Address</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Hostname</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Vendor</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Model</th>
                <th className="px-5 py-3 text-xs uppercase font-medium" style={{ color: 'var(--text-secondary)' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {results
                .sort((a, b) => (a.status === 'up' ? -1 : 1))
                .map((r, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td className="px-5 py-2.5">{statusIcon[r.status] || statusIcon.down}</td>
                    <td className="px-5 py-2.5 font-mono" style={{ color: 'var(--text-primary)' }}>{r.ip}</td>
                    <td className="px-5 py-2.5" style={{ color: 'var(--text-secondary)' }}>{r.hostname || '—'}</td>
                    <td className="px-5 py-2.5" style={{ color: 'var(--text-secondary)' }}>{r.vendor || '—'}</td>
                    <td className="px-5 py-2.5" style={{ color: 'var(--text-secondary)' }}>{r.model || '—'}</td>
                    <td className="px-5 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-2"
                        style={r.status === 'up'
                          ? { background: 'var(--success-dim)', color: 'var(--success)' }
                          : { background: 'var(--warning-dim)', color: 'var(--warning)' }}>
                        {statusLabel[r.status] || 'unknown'}
                      </span>
                      {r.detail || ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
