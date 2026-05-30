import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, LogIn, User, Lock } from 'lucide-react'

export default function SshTerminal({ deviceId, token, savedCred }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const wsRef = useRef(null)

  const [phase, setPhase] = useState('login')
  const [username, setUsername] = useState(savedCred?.username || '')
  const [password, setPassword] = useState('')
  const [useProfileCreds, setUseProfileCreds] = useState(false)
  const [connectTrigger, setConnectTrigger] = useState(0)

  useEffect(() => {
    if (savedCred?.username) setUsername(savedCred.username)
  }, [savedCred])

  // This effect runs after phase leaves 'login' and the container div is in the DOM
  useEffect(() => {
    if (connectTrigger === 0 || phase === 'login') return
    const container = containerRef.current
    if (!container || !deviceId || !token) return

    if (termRef.current) {
      termRef.current.dispose()
      termRef.current = null
    }
    container.innerHTML = ''

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", Consolas, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
      },
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    let wsUrl = `${proto}://${window.location.host}/api/ws/ssh/${deviceId}?token=${encodeURIComponent(token)}`
    if (!useProfileCreds && username) {
      wsUrl += `&ssh_user=${encodeURIComponent(username)}&ssh_pass=${encodeURIComponent(password)}`
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln('\x1b[90m--- Establishing SSH session... ---\x1b[0m')
      setPhase('connected')
    }

    ws.onmessage = (event) => {
      term.write(event.data)
    }

    ws.onclose = () => {
      term.writeln('')
      term.writeln('\x1b[90m--- Session ended ---\x1b[0m')
      setPhase('disconnected')
    }

    ws.onerror = () => {
      term.writeln('\x1b[31m--- Connection error ---\x1b[0m')
      setPhase('disconnected')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
      termRef.current = null
    }
  }, [connectTrigger])

  const handleConnect = (e) => {
    e.preventDefault()
    setPhase('connecting')
    // Small delay to let React render the container div before we try to use it
    setTimeout(() => setConnectTrigger((c) => c + 1), 50)
  }

  const handleReconnect = () => {
    setConnectTrigger((c) => c + 1)
  }

  const handleNewLogin = () => {
    wsRef.current?.close()
    setPhase('login')
    setPassword('')
  }

  if (phase === 'login') {
    return (
      <div className="w-full h-full min-h-[400px] rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1a1b26' }}>
        <form onSubmit={handleConnect} className="w-full max-w-xs space-y-4">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-800 mb-3">
              <LogIn size={22} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-200">SSH Login</h3>
            <p className="text-xs text-gray-500 mt-1">Enter credentials or use saved profile</p>
          </div>

          {savedCred && (
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-800/60 border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
              <input
                type="checkbox"
                checked={useProfileCreds}
                onChange={(e) => setUseProfileCreds(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-300">
                Use saved profile: <span className="font-mono text-blue-400">{savedCred.name}</span>
                <span className="text-gray-500 ml-1">({savedCred.username})</span>
              </span>
            </label>
          )}

          {!useProfileCreds && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="root"
                    required={!useProfileCreds}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn size={16} />
            Connect
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] rounded-lg overflow-hidden"
        style={{ backgroundColor: '#1a1b26' }}
      />
      {phase === 'disconnected' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          <button
            onClick={handleReconnect}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg transition-colors"
          >
            <RotateCcw size={16} />
            Reconnect
          </button>
          <button
            onClick={handleNewLogin}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg shadow-lg transition-colors"
          >
            <LogIn size={16} />
            New Login
          </button>
        </div>
      )}
    </div>
  )
}
