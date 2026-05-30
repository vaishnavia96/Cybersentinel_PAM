import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('nms_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      api
        .get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          setToken(null)
          localStorage.removeItem('nms_token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (username, password) => {
    const res = await api.post('/auth/login/json', { username, password })
    const accessToken = res.data.access_token
    localStorage.setItem('nms_token', accessToken)
    setToken(accessToken)
    const me = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setUser(me.data)
  }

  const logout = () => {
    localStorage.removeItem('nms_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
