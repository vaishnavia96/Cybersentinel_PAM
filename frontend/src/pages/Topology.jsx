import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, MarkerType, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import api from '../api'
import { useTheme } from '../context/ThemeContext'
import { Trash2, Radar, Loader2, RefreshCw, Maximize2, Minimize2 } from 'lucide-react'

// Vendor accents — same hue in both themes, but tints adapt via CSS opacity in node styling
const vendorAccents = {
  Cisco:    { border: '#3b82f6', text: '#60a5fa' },
  Juniper:  { border: '#22c55e', text: '#4ade80' },
  Arista:   { border: '#f59e0b', text: '#fbbf24' },
  Linux:    { border: '#ec4899', text: '#f472b6' },
  Fortinet: { border: '#ef4444', text: '#f87171' },
  MikroTik: { border: '#6366f1', text: '#818cf8' },
  default:  { border: '#9ca3af', text: '#9ca3af' },
}
const statusDot = { up: '#22c55e', down: '#ef4444', unknown: '#9ca3af' }

function DeviceNode({ data }) {
  const c = vendorAccents[data.vendor] || vendorAccents.default
  const isInfra = data._infra
  return (
    <div
      style={{
        borderColor: c.border,
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        boxShadow: `0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px ${c.border}22`,
      }}
      className={`rounded-lg border-2 px-4 py-3 ${isInfra ? 'min-w-[160px]' : 'min-w-[120px]'}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: c.border, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: c.border, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: c.border, width: 8, height: 8 }} />
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusDot[data.status] || statusDot.unknown }} />
        <span className={`font-semibold truncate ${isInfra ? 'text-xs' : 'text-[10px]'}`} style={{ color: c.text }}>{data.hostname || data.ip_address}</span>
      </div>
      <p className="text-[10px] font-mono leading-tight" style={{ color: 'var(--text-muted)' }}>{data.ip_address}</p>
      {data.vendor && <p className="text-[9px] mt-0.5" style={{ color: c.text }}>{data.vendor}{data.model ? ` ${data.model}` : ''}</p>}
      {isInfra && (
        <p
          className="text-[8px] mt-1 px-1 py-0.5 rounded text-center font-medium uppercase tracking-wider"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {data.snmp_status === 'on' ? 'SNMP' : 'Gateway'}
        </p>
      )}
    </div>
  )
}

const nodeTypes = { device: DeviceNode }

function buildHierarchicalLayout(devices, links) {
  const linkCount = {}
  const connectedTo = {}
  for (const l of links) {
    linkCount[l.source_device_id] = (linkCount[l.source_device_id] || 0) + 1
    linkCount[l.target_device_id] = (linkCount[l.target_device_id] || 0) + 1
    if (!connectedTo[l.source_device_id]) connectedTo[l.source_device_id] = []
    if (!connectedTo[l.target_device_id]) connectedTo[l.target_device_id] = []
    connectedTo[l.source_device_id].push(l.target_device_id)
    connectedTo[l.target_device_id].push(l.source_device_id)
  }

  const infra = devices.filter(d => (linkCount[d.id] || 0) >= 5 || d.snmp_status === 'on')
  const infraIds = new Set(infra.map(d => d.id))
  const endpoints = devices.filter(d => !infraIds.has(d.id))

  const infraSpacing = 250
  const infraY = 80
  const infraStartX = Math.max(50, (endpoints.length * 70) / 2 - (infra.length * infraSpacing) / 2)

  const positions = {}
  infra.forEach((d, i) => {
    positions[d.id] = { x: infraStartX + i * infraSpacing, y: infraY }
  })

  const groups = {}
  for (const d of endpoints) {
    const neighbors = connectedTo[d.id] || []
    const infraNeighbor = neighbors.find(n => infraIds.has(n))
    const group = infraNeighbor || (infra.length > 0 ? infra[0].id : 0)
    if (!groups[group]) groups[group] = []
    groups[group].push(d)
  }

  const rowSpacing = 90
  const colSpacing = 160
  for (const [parentId, children] of Object.entries(groups)) {
    const parentPos = positions[parentId] || { x: 400, y: infraY }
    const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(children.length))))
    const startX = parentPos.x - ((cols - 1) * colSpacing) / 2

    children.forEach((d, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      positions[d.id] = {
        x: startX + col * colSpacing,
        y: parentPos.y + 180 + row * rowSpacing,
      }
    })
  }

  let unconnectedX = 50
  for (const d of devices) {
    if (!positions[d.id]) {
      positions[d.id] = { x: unconnectedX, y: infraY + 500 }
      unconnectedX += 160
    }
  }

  return devices.map(d => ({
    id: String(d.id),
    type: 'device',
    position: positions[d.id],
    data: { ...d, _infra: infraIds.has(d.id) },
  }))
}

function linksToEdges(links, accent) {
  return links.map((l) => ({
    id: `link-${l.id}`,
    source: String(l.source_device_id),
    target: String(l.target_device_id),
    label: [l.source_interface, l.target_interface].filter(Boolean).join(' ↔ ') || undefined,
    type: 'default',
    animated: l.link_type === 'discovered',
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: l.link_type === 'discovered' ? accent : '#9ca3af' },
    data: { linkId: l.id },
    style: { stroke: l.link_type === 'discovered' ? accent : '#9ca3af', strokeWidth: l.link_type === 'discovered' ? 1.5 : 1 },
    labelStyle: { fontSize: 9, fill: 'var(--text-muted)' },
    labelBgStyle: { fill: 'var(--bg-surface)' },
  }))
}

export default function Topology() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const accent = '#FF6B2B'

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoverResult, setDiscoverResult] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef(null)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const [devRes, linkRes] = await Promise.all([api.get('/devices'), api.get('/topology/links')])
      setNodes(buildHierarchicalLayout(devRes.data, linkRes.data))
      setEdges(linksToEdges(linkRes.data, accent))
    } catch {}
  }, [setNodes, setEdges, accent])

  useEffect(() => { if (!loadedRef.current) { loadedRef.current = true; load() } }, [load])

  // Listen for native fullscreen exit (Esc key, etc.)
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {}
  }, [])

  const runDiscovery = async () => {
    setDiscovering(true); setDiscoverResult(null)
    try {
      const res = await api.post('/topology/discover')
      setDiscoverResult(res.data)
      load()
    } catch (err) {
      setDiscoverResult({ error: err.response?.data?.detail || 'Discovery failed' })
    } finally { setDiscovering(false) }
  }

  const onConnect = useCallback(async (params) => {
    try {
      const res = await api.post('/topology/links', { source_device_id: Number(params.source), target_device_id: Number(params.target), link_type: 'manual' })
      setEdges((eds) => addEdge({ id: `link-${res.data.id}`, source: params.source, target: params.target, type: 'default', markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' }, data: { linkId: res.data.id }, style: { stroke: '#9ca3af' } }, eds))
    } catch {}
  }, [setEdges])

  const onEdgeClick = useCallback((_e, edge) => setSelectedEdge(edge), [])
  const deleteSelectedEdge = useCallback(async () => {
    if (!selectedEdge?.data?.linkId) return
    try { await api.delete(`/topology/links/${selectedEdge.data.linkId}`); setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id)); setSelectedEdge(null) } catch {}
  }, [selectedEdge, setEdges])

  return (
    <div
      ref={containerRef}
      className={fullscreen ? 'h-screen w-screen flex flex-col p-4' : 'h-[calc(100vh-3rem)] flex flex-col'}
      style={fullscreen ? { background: 'var(--gradient-bg)' } : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Network Topology</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={runDiscovery}
            disabled={discovering}
            className="flex items-center gap-2 px-4 py-1.5 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all hover:brightness-110"
            style={{ background: 'var(--accent)' }}
          >
            {discovering ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
            {discovering ? 'Discovering...' : 'Auto-Discover'}
          </button>
          <button
            onClick={load}
            title="Refresh"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {selectedEdge && (
            <button
              onClick={deleteSelectedEdge}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {discoverResult && !discoverResult.error && (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              {discoverResult.discovered} links · {discoverResult.infra_nodes} infra nodes
            </span>
          )}
          {discoverResult?.error && <span className="text-xs" style={{ color: 'var(--danger)' }}>{discoverResult.error}</span>}
          <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1"><span className="w-6 h-0.5 inline-block" style={{ background: accent }} /> Auto</span>
            <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-gray-400 inline-block" /> Manual</span>
          </div>
        </div>
      </div>

      <div
        className="flex-1 rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      >
        <ReactFlow
          nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onEdgeClick={onEdgeClick} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.2 }}
          connectionLineStyle={{ stroke: accent, strokeWidth: 2 }}
          defaultEdgeOptions={{ type: 'default' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color={isDark ? '#2a2a2a' : '#EADFD9'} />
          <Controls
            position="bottom-right"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          />
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={(n) => (vendorAccents[n.data?.vendor] || vendorAccents.default).border}
            nodeBorderRadius={4}
            maskColor={isDark ? 'rgba(0,0,0,0.55)' : 'rgba(91,75,122,0.12)'}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>
      </div>
      {!fullscreen && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Infrastructure nodes (SNMP/gateway) sit at the top. Drag nodes to rearrange. Connect by dragging between handles.
        </p>
      )}
    </div>
  )
}
