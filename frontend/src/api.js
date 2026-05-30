import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nms_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('nms_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
