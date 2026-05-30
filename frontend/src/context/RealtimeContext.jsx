import { createContext, useContext, useState, useCallback } from 'react'
import useWebSocket from '../hooks/useWebSocket'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
  const [deviceStatuses, setDeviceStatuses] = useState({})
  const [latestMetrics, setLatestMetrics] = useState({})
  const [lastEvent, setLastEvent] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [alertBanner, setAlertBanner] = useState(null)

  const handleMessage = useCallback((data) => {
    if (data.type === 'poll_result') {
      setDeviceStatuses((prev) => ({ ...prev, [data.device_id]: data.status }))
      if (data.metrics && Object.keys(data.metrics).length > 0) {
        setLatestMetrics((prev) => ({
          ...prev,
          [data.device_id]: { ...prev[data.device_id], ...data.metrics, _timestamp: data.timestamp },
        }))
      }
      setLastEvent(data)
    }
    if (data.type === 'alert') {
      setAlerts((prev) => [data, ...prev].slice(0, 50))
      setAlertBanner(data)
      setTimeout(() => setAlertBanner(null), 8000)
    }
  }, [])

  useWebSocket(handleMessage)

  const dismissBanner = useCallback(() => setAlertBanner(null), [])

  return (
    <RealtimeContext.Provider value={{
      deviceStatuses, latestMetrics, lastEvent,
      alerts, alertBanner, dismissBanner,
    }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  return useContext(RealtimeContext)
}
