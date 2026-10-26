import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Dropzone from '../components/Dropzone'
import api from '../services/api'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const navigate = useNavigate()

  async function handleUpload() {
    if (!file) return
    setError(null)
    setUploading(true)
    setUploadProgress(0)
    try {
      const form = new FormData()
      form.append('video_file', file)
      const res = await api.post('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.total) return
          setUploadProgress(Math.round((event.loaded / event.total) * 100))
        },
      })
      const jobId = res.data.job_id
      navigate(`/roi-select/${jobId}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-xl font-medium mb-4">Upload Video</h2>
      <Dropzone onFile={setFile} />

      {file && <div className="mt-4">Selected: <strong>{file.name}</strong></div>}

      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-sky-600 h-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && <div className="mt-3 text-red-600">{error}</div>}

      <div className="mt-6">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading...' : 'Process Video'}
        </button>
      </div>
    </div>
  )
}
