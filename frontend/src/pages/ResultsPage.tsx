import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

interface AnalyticsEvent {
  id: string
  job_id: string
  tracker_id: number
  object_type: string
  roi_id: string
  roi_name: string
  entry_time: string
  exit_time: string | null
  stay_duration: string | null
  frame_count: number
  snapshot_url: string | null
}

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [csvUrl, setCsvUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState('')
  const [roiFilter, setRoiFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sortField, setSortField] = useState<'entry' | 'duration'>('entry')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // Selected event for detail panel
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    
    api.get(`/api/results/${jobId}`)
      .then(res => {
        setVideoUrl(res.data.video_url)
        setDownloadUrl(res.data.download_url)
        setCsvUrl(res.data.csv_url)
        setEvents(res.data.events || [])
      })
      .catch(err => {
        console.error('Error fetching results:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [jobId])

  // Helper parsers for calculations
  function durationToSeconds(durStr: string | null): number {
    if (!durStr) return 0
    const parts = durStr.split(':').map(Number)
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return 0
  }

  function secondsToDuration(totalSec: number): string {
    const m = Math.floor(totalSec / 60)
    const s = Math.round(totalSec % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Calculate stats
  const totalObjects = new Set(events.map(e => e.tracker_id)).size
  const peopleCount = new Set(events.filter(e => e.object_type === 'Person').map(e => e.tracker_id)).size
  const vehicleCount = totalObjects - peopleCount
  const totalEntries = events.length
  const totalExits = events.filter(e => e.exit_time !== null).length
  
  // Average stay duration (only for completed exits)
  const completedDurations = events
    .filter(e => e.stay_duration)
    .map(e => durationToSeconds(e.stay_duration))
  const avgStaySeconds = completedDurations.length > 0 
    ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length 
    : 0
  const avgStayFormatted = secondsToDuration(avgStaySeconds)

  // Unique ROI and Object Type lists for filters
  const uniqueRois = Array.from(new Set(events.map(e => e.roi_name)))
  const uniqueTypes = Array.from(new Set(events.map(e => e.object_type)))

  // Sort & Filter logic
  const filteredEvents = events.filter(e => {
    const matchesSearch = 
      e.tracker_id.toString().includes(searchQuery) ||
      e.roi_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.object_type.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRoi = roiFilter === 'All' || e.roi_name === roiFilter
    const matchesType = typeFilter === 'All' || e.object_type === typeFilter
    return matchesSearch && matchesRoi && matchesType
  }).sort((a, b) => {
    let comparison = 0
    if (sortField === 'entry') {
      comparison = a.entry_time.localeCompare(b.entry_time)
    } else if (sortField === 'duration') {
      const durA = durationToSeconds(a.stay_duration)
      const durB = durationToSeconds(b.stay_duration)
      comparison = durA - durB
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const selectedEvent = events.find(e => e.id === selectedEventId)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-sky-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Fetching dashboard analytics telemetry...</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 min-h-screen pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Surveillance Operations Center</h1>
          <p className="text-slate-500 text-sm">Zone tracking telemetry and AI object detection metrics.</p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Process New Feed
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Download MP4
            </a>
          )}
          {csvUrl && (
            <a
              href={csvUrl}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* KPI 1: Objects */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Monitored Objects</span>
            <div className="p-1 bg-sky-50 text-sky-600 rounded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalObjects}</div>
          <div className="text-[10px] text-slate-400 mt-1 flex gap-2">
            <span>People: <strong>{peopleCount}</strong></span>
            <span>•</span>
            <span>Vehicles: <strong>{vehicleCount}</strong></span>
          </div>
        </div>

        {/* KPI 2: Total Entries */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Entries</span>
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1"/></svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalEntries}</div>
          <div className="text-[10px] text-emerald-600 mt-1 font-medium">✓ Logged interactions</div>
        </div>

        {/* KPI 3: Total Exits */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed Exits</span>
            <div className="p-1 bg-amber-50 text-amber-600 rounded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1"/></svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{totalExits}</div>
          <div className="text-[10px] text-slate-400 mt-1">
            Active remaining: <strong>{totalEntries - totalExits}</strong>
          </div>
        </div>

        {/* KPI 4: Avg Dwell Time */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Dwell Time</span>
            <div className="p-1 bg-indigo-50 text-indigo-600 rounded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">{avgStayFormatted}</div>
          <div className="text-[10px] text-slate-400 mt-1">Minutes : Seconds</div>
        </div>
      </div>

      {/* Main Grid: Video Player + Occupancy Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Video Player Column */}
        <div className="lg:col-span-2">
          <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-900 shadow-lg relative aspect-video">
            {videoUrl ? (
              <video
                controls
                preload="metadata"
                crossOrigin="anonymous"
                className="w-full h-full object-contain"
              >
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support local video playback.
              </video>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                Video player not initialized.
              </div>
            )}
          </div>
        </div>

        {/* Zone occupancy detail list */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Zone Traffic Density
          </h3>
          <div className="flex flex-col gap-4 overflow-y-auto flex-grow max-h-80">
            {uniqueRois.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No zones detected.</div>
            ) : (
              uniqueRois.map(roiName => {
                const zoneEvents = events.filter(e => e.roi_name === roiName)
                const activeInZone = zoneEvents.filter(e => e.exit_time === null).length
                const completedInZone = zoneEvents.length - activeInZone
                
                // Color mapping index
                const colors = ['bg-red-500', 'bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500']
                const idx = uniqueRois.indexOf(roiName) % colors.length
                
                return (
                  <div key={roiName} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-3 h-3 rounded-full ${colors[idx]}`}></span>
                      <h4 className="font-semibold text-slate-700 text-sm">{roiName}</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>
                        Total Ingress: <strong>{zoneEvents.length}</strong>
                      </div>
                      <div>
                        Currently Inside: <strong className="text-sky-600">{activeInZone}</strong>
                      </div>
                      <div className="col-span-2 mt-1">
                        Completed passages: <strong>{completedInZone}</strong>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Analytics Event Tracking Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-800 text-lg">Active ROI Event Logs</h3>

          {/* Search, Filter, and Sorting Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search IDs/Zones/Types..."
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-500 w-44 md:w-56"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>

            {/* Filter by Zone */}
            <select
              value={roiFilter}
              onChange={(e) => setRoiFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:border-sky-500"
            >
              <option value="All">All Zones</option>
              {uniqueRois.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* Filter by Object Type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:border-sky-500"
            >
              <option value="All">All Object Types</option>
              {uniqueTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="p-4 w-20">Snapshot</th>
                <th className="p-4">Object ID</th>
                <th className="p-4">Type</th>
                <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => {
                  setSortField('entry')
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                }}>
                  Entry Time {sortField === 'entry' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th className="p-4">Exit Time</th>
                <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => {
                  setSortField('duration')
                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                }}>
                  Stay Duration {sortField === 'duration' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th className="p-4">Zone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No analytics events match filters.
                  </td>
                </tr>
              ) : (
                filteredEvents.map(event => (
                  <tr
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="p-3">
                      {event.snapshot_url ? (
                        <img
                          src={event.snapshot_url}
                          alt={`T_${event.tracker_id}`}
                          className="w-12 h-12 rounded object-cover border border-slate-200 shadow-sm"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                          N/A
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-700">
                      {event.object_type}_{event.tracker_id.toString().padStart(3, '0')}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        event.object_type === 'Person' ? 'bg-sky-50 text-sky-700' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {event.object_type}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-semibold text-slate-600">{event.entry_time}</td>
                    <td className="p-4 font-mono text-slate-500">{event.exit_time || <span className="text-sky-600 font-medium animate-pulse">Inside</span>}</td>
                    <td className="p-4 font-mono text-slate-600 font-medium">{event.stay_duration || '-'}</td>
                    <td className="p-4 text-slate-700 font-semibold">{event.roi_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-out Sidebar Panel Overlay for Selected Event Details */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop transparent layer */}
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedEventId(null)}
          ></div>

          {/* Sidebar Drawer body */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200/80 animate-slide-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">
                  Object #{selectedEvent.tracker_id} Detailed Analysis
                </h3>
                <span className="text-xs text-slate-400 font-mono">Job ID: {jobId}</span>
              </div>
              <button
                onClick={() => setSelectedEventId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Sidebar Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-grow flex flex-col gap-6">
              {/* Snapshot Display */}
              <div className="flex flex-col items-center">
                {selectedEvent.snapshot_url ? (
                  <img
                    src={selectedEvent.snapshot_url}
                    alt="cropped target"
                    className="w-full max-h-56 rounded-xl object-contain border border-slate-200 bg-slate-950 p-2 shadow-sm"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-40 bg-slate-50 border border-dashed rounded-xl flex items-center justify-center text-slate-400 text-sm">
                    No image crop available
                  </div>
                )}
                <span className="text-xs text-slate-400 mt-2 font-mono">YOLO Cropped Ingress Frame</span>
              </div>

              {/* Data Specs Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200/60">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Identified As</span>
                  <span className="font-semibold text-slate-700 text-sm capitalize">{selectedEvent.object_type}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Zone Intersect</span>
                  <span className="font-semibold text-slate-700 text-sm">{selectedEvent.roi_name}</span>
                </div>
                <hr className="col-span-2 border-slate-200" />
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Stay Duration</span>
                  <span className="font-semibold text-slate-700 text-sm font-mono">{selectedEvent.stay_duration || 'Active'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Frames Tracked</span>
                  <span className="font-semibold text-slate-700 text-sm font-mono">{selectedEvent.frame_count} frames</span>
                </div>
              </div>

              {/* Surveillance Timeline */}
              <div>
                <h4 className="font-bold text-slate-800 text-sm mb-4">Ingress-Egress Timeline</h4>
                <div className="relative border-l-2 border-slate-100 pl-5 ml-2.5 flex flex-col gap-6">
                  {/* Item 1: Entry */}
                  <div className="relative">
                    <span className="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-500 ring-4 ring-emerald-50"></span>
                    <h5 className="font-bold text-slate-700 text-xs">ROI Zone Ingress Registered</h5>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Object crossed coordinates at video time{' '}
                      <strong className="font-mono text-slate-600">{selectedEvent.entry_time}</strong>.
                    </p>
                  </div>

                  {/* Item 2: Activity */}
                  <div className="relative">
                    <span className="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-indigo-500 ring-4 ring-indigo-50"></span>
                    <h5 className="font-bold text-slate-700 text-xs">Continuous Track Invariant</h5>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Detected continuously across{' '}
                      <strong className="font-mono text-slate-600">{selectedEvent.frame_count}</strong> video frames.
                    </p>
                  </div>

                  {/* Item 3: Exit */}
                  <div className="relative">
                    <span className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ring-4 ${
                      selectedEvent.exit_time ? 'bg-amber-500 ring-amber-50' : 'bg-sky-500 ring-sky-50 animate-pulse'
                    }`}></span>
                    <h5 className="font-bold text-slate-700 text-xs">
                      {selectedEvent.exit_time ? 'ROI Zone Egress Logged' : 'Still Active'}
                    </h5>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {selectedEvent.exit_time ? (
                        <>
                          Departed target monitoring region at video time{' '}
                          <strong className="font-mono text-slate-600">{selectedEvent.exit_time}</strong>.
                        </>
                      ) : (
                        'Object is currently inside the zone boundaries.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button
                onClick={() => setSelectedEventId(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors text-sm text-center"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
