import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  
  const [status, setStatus] = useState('pending')
  const [progress, setProgress] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/status/${jobId}`)
        setStatus(res.data.status)
        setProgress(res.data.progress || 0)
        setCurrentFrame(res.data.current_frame || 0)
        setTotalFrames(res.data.total_frames || 0)
        
        if (res.data.status === 'completed') {
          clearInterval(interval)
          navigate(`/results/${jobId}`)
        }
        if (res.data.status === 'failed') {
          clearInterval(interval)
          setErrorDetail(res.data.detail || 'Video processing encountered an unexpected AI error.')
        }
      } catch (err: any) {
        console.error('Error polling status:', err)
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [jobId, navigate])

  const percent = Math.round(progress * 100)

  return (
    <div className="max-w-2xl mx-auto mt-12 bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="text-center">
        {status === 'failed' ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Analysis Failed</h2>
            <p className="text-sm text-slate-500 mb-6">Something went wrong while running YOLO object tracking.</p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left font-mono text-xs text-red-600 overflow-x-auto max-h-48 mb-6">
              {errorDetail}
            </div>
            
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors shadow"
            >
              Back to Upload
            </button>
          </>
        ) : (
          <>
            {/* Spinning Loader */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-slate-800 text-sm">
                {percent}%
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-800 mb-1">Analyzing Video Feed...</h2>
            <p className="text-sm text-slate-500 mb-6">
              YOLO object detection and ByteTrack are processing frames inside custom ROIs.
            </p>

            {/* Progress Bar Container */}
            <div className="w-full bg-slate-100 rounded-full h-3.5 mb-4 overflow-hidden border border-slate-200/50 shadow-inner">
              <div
                className="bg-gradient-to-r from-sky-500 to-sky-600 h-full rounded-full transition-all duration-300 shadow-md"
                style={{ width: `${percent}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm">
              <div className="text-left border-r border-slate-200 pr-2">
                <span className="text-xs text-slate-400 block uppercase font-semibold">Frame Telemetry</span>
                <span className="text-slate-700 font-bold font-mono">
                  {currentFrame} / {totalFrames}
                </span>
              </div>
              <div className="text-left pl-2">
                <span className="text-xs text-slate-400 block uppercase font-semibold">Job State</span>
                <span className="text-sky-600 font-bold capitalize">{status}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
