import React from 'react'
import { Outlet, Link } from 'react-router-dom'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-sky-600">Video Tracking System</h1>
          <nav>
            <Link to="/" className="text-sm text-slate-600">Upload Video</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
