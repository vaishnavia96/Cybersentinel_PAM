import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { RealtimeProvider } from './context/RealtimeContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/Layout/MainLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import DeviceDetail from './pages/DeviceDetail'
import Credentials from './pages/Credentials'
import Discovery from './pages/Discovery'
import Topology from './pages/Topology'
import Alerts from './pages/Alerts'
import Logs from './pages/Logs'

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <RealtimeProvider>
                    <MainLayout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/inventory/:id" element={<DeviceDetail />} />
                        <Route path="/credentials" element={<Credentials />} />
                        <Route path="/discovery" element={<Discovery />} />
                        <Route path="/topology" element={<Topology />} />
                        <Route path="/alerts" element={<Alerts />} />
                        <Route path="/logs" element={<Logs />} />
                      </Routes>
                    </MainLayout>
                  </RealtimeProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
