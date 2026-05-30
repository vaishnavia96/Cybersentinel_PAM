import Sidebar from './Sidebar'

export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen transition-all duration-400" style={{ background: 'var(--gradient-bg)' }}>
      <Sidebar />
      <main className="transition-all duration-300 min-h-screen p-6" style={{ marginLeft: 72 }}>
        {children}
      </main>
    </div>
  )
}
