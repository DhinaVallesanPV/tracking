import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import RoiSelector from '../components/RoiSelector'

export default function RoiSelectionPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!jobId) {
    return <div className="text-red-600 font-medium">Job ID is missing.</div>
  }

  const rawVideoUrl = `${api.defaults.baseURL}/api/downloads/raw/${jobId}?ngrok-skip-browser-warning=1`

  async function handleSaveRois(rois: { id: string; name: string; polygon: number[][] }[]) {
    setError(null)
    setLoading(true)
    try {
      // POST the user selected ROIs to start the backend job
      await api.post(`/api/process/${jobId}`, { rois })
      navigate(`/processing/${jobId}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to initialize processing job.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen py-4">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Set Region of Interest (ROI)</h1>
            <p className="text-slate-500 text-sm">
              Annotate one or more monitoring zones to track and detect entities.
            </p>
          </div>
          <div className="text-xs bg-sky-50 text-sky-700 px-3 py-1.5 rounded-full border border-sky-100 font-medium">
            Job ID: {jobId}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-600 font-medium">Submitting custom ROI zones and queueing video task...</p>
          </div>
        ) : (
          <RoiSelector
            videoUrl={rawVideoUrl}
            onSave={handleSaveRois}
            onCancel={() => navigate('/')}
          />
        )}
      </div>
    </div>
  )
}
