import React, { useRef, useState, useEffect } from 'react'

export interface ROI {
  id: string
  name: string
  // Display scale coordinates (percentage-based to remain invariant to container size)
  x: number  // 0 to 100
  y: number  // 0 to 100
  w: number  // 0 to 100
  h: number  // 0 to 100
}

interface Props {
  videoUrl: string
  onSave: (rois: { id: string; name: string; polygon: number[][] }[]) => void
  onCancel: () => void
}

const PRESET_NAMES = ['Entrance Zone', 'Exit Zone', 'Parking Area', 'Restricted Area', 'Loading Dock']

export default function RoiSelector({ videoUrl, onSave, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  
  const [rois, setRois] = useState<ROI[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  
  // Video properties
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 360 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Interaction State
  const [action, setAction] = useState<'none' | 'drawing' | 'moving' | 'resizing'>('none')
  const [resizeHandle, setResizeHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [tempRoi, setTempRoi] = useState<ROI | null>(null)
  const [selectedRoiStart, setSelectedRoiStart] = useState<ROI | null>(null)

  // Track video time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const updateTime = () => setCurrentTime(video.currentTime)
    video.addEventListener('timeupdate', updateTime)
    return () => video.removeEventListener('timeupdate', updateTime)
  }, [])

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      })
      setDuration(videoRef.current.duration)
    }
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // Convert client cursor coordinate to relative percentage coordinate inside container
  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    }
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const target = e.target as SVGElement
    const handleType = target.getAttribute('data-handle')
    const { x, y } = getRelativeCoords(e.clientX, e.clientY)

    // 1. Resizing check
    if (handleType && selectedId) {
      const activeRoi = rois.find(r => r.id === selectedId)
      if (activeRoi) {
        setAction('resizing')
        setResizeHandle(handleType as any)
        setDragStart({ x, y })
        setSelectedRoiStart({ ...activeRoi })
        return
      }
    }

    // 2. Click on existing ROI to select/move
    const clickedRoiId = target.getAttribute('data-roi-id')
    if (clickedRoiId) {
      setSelectedId(clickedRoiId)
      const clickedRoi = rois.find(r => r.id === clickedRoiId)
      if (clickedRoi) {
        setAction('moving')
        setDragStart({ x, y })
        setSelectedRoiStart({ ...clickedRoi })
      }
      return
    }

    // 3. Start drawing a new ROI
    const newId = Math.random().toString(36).substring(7)
    setSelectedId(newId)
    const newRoi: ROI = {
      id: newId,
      name: `Zone ${rois.length + 1}`,
      x,
      y,
      w: 0,
      h: 0,
    }
    setAction('drawing')
    setDragStart({ x, y })
    setTempRoi(newRoi)
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (action === 'none') return
    const { x, y } = getRelativeCoords(e.clientX, e.clientY)
    const dx = x - dragStart.x
    const dy = y - dragStart.y

    if (action === 'drawing' && tempRoi) {
      const newX = Math.min(dragStart.x, x)
      const newY = Math.min(dragStart.y, y)
      const newW = Math.abs(x - dragStart.x)
      const newH = Math.abs(y - dragStart.y)
      setTempRoi({
        ...tempRoi,
        x: newX,
        y: newY,
        w: newW,
        h: newH,
      })
    } else if (action === 'moving' && selectedId && selectedRoiStart) {
      let newX = selectedRoiStart.x + dx
      let newY = selectedRoiStart.y + dy
      
      // Keep within bounds
      if (newX < 0) newX = 0
      if (newY < 0) newY = 0
      if (newX + selectedRoiStart.w > 100) newX = 100 - selectedRoiStart.w
      if (newY + selectedRoiStart.h > 100) newY = 100 - selectedRoiStart.h

      setRois(rois.map(r => (r.id === selectedId ? { ...r, x: newX, y: newY } : r)))
    } else if (action === 'resizing' && selectedId && selectedRoiStart) {
      setRois(rois.map(r => {
        if (r.id !== selectedId) return r
        let { x: rx, y: ry, w: rw, h: rh } = selectedRoiStart
        
        if (resizeHandle === 'tl') {
          const newX = Math.min(rx + rw - 1, Math.max(0, rx + dx))
          const newW = rw - (newX - rx)
          const newY = Math.min(ry + rh - 1, Math.max(0, ry + dy))
          const newH = rh - (newY - ry)
          return { ...r, x: newX, y: newY, w: newW, h: newH }
        }
        if (resizeHandle === 'tr') {
          const newW = Math.max(1, Math.min(100 - rx, rw + dx))
          const newY = Math.min(ry + rh - 1, Math.max(0, ry + dy))
          const newH = rh - (newY - ry)
          return { ...r, y: newY, w: newW, h: newH }
        }
        if (resizeHandle === 'bl') {
          const newX = Math.min(rx + rw - 1, Math.max(0, rx + dx))
          const newW = rw - (newX - rx)
          const newH = Math.max(1, Math.min(100 - ry, rh + dy))
          return { ...r, x: newX, w: newW, h: newH }
        }
        if (resizeHandle === 'br') {
          const newW = Math.max(1, Math.min(100 - rx, rw + dx))
          const newH = Math.max(1, Math.min(100 - ry, rh + dy))
          return { ...r, w: newW, h: newH }
        }
        return r
      }))
    }
  }

  const handleMouseUp = () => {
    if (action === 'drawing' && tempRoi) {
      if (tempRoi.w > 2 && tempRoi.h > 2) {
        setRois([...rois, tempRoi])
      } else {
        setSelectedId(null)
      }
      setTempRoi(null)
    }
    setAction('none')
    setResizeHandle(null)
    setSelectedRoiStart(null)
  }

  const updateRoiName = (id: string, name: string) => {
    setRois(rois.map(r => (r.id === id ? { ...r, name } : r)))
  }

  const deleteRoi = (id: string) => {
    setRois(rois.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleProcess = () => {
    // Map percentages to actual video resolution
    const mapped = rois.map(r => {
      const pixelX = Math.round((r.x / 100) * videoDimensions.width)
      const pixelY = Math.round((r.y / 100) * videoDimensions.height)
      const pixelW = Math.round((r.w / 100) * videoDimensions.width)
      const pixelH = Math.round((r.h / 100) * videoDimensions.height)

      return {
        id: r.id,
        name: r.name,
        // Supervision expects polygon coords (clockwise)
        polygon: [
          [pixelX, pixelY],
          [pixelX + pixelW, pixelY],
          [pixelX + pixelW, pixelY + pixelH],
          [pixelX, pixelY + pixelH]
        ]
      }
    })
    onSave(mapped)
  }

  const selectedRoi = rois.find(r => r.id === selectedId)

  // Color helper for rendering bounding paths
  const getRoiColor = (index: number, isSelected: boolean) => {
    const baseColors = [
      'rgba(239, 68, 68, 0.4)', // Red
      'rgba(16, 185, 129, 0.4)', // Green
      'rgba(59, 130, 246, 0.4)', // Blue
      'rgba(245, 158, 11, 0.4)', // Yellow
      'rgba(217, 70, 239, 0.4)', // Purple
    ]
    const borderColors = [
      'rgb(239, 68, 68)',
      'rgb(16, 185, 129)',
      'rgb(59, 130, 246)',
      'rgb(245, 158, 11)',
      'rgb(217, 70, 239)',
    ]
    const idx = index % baseColors.length
    return {
      fill: isSelected ? baseColors[idx] : 'rgba(100, 116, 139, 0.15)',
      stroke: isSelected ? borderColors[idx] : 'rgb(100, 116, 139)',
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Video & Drawing Canvas Column */}
      <div className="lg:col-span-3 flex flex-col">
        <div className="bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800" ref={containerRef}>
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full h-auto block select-none"
            crossOrigin="anonymous"
            preload="auto"
          />

          {/* SVG Overlay layer */}
          <svg
            className="absolute top-0 left-0 w-full h-full cursor-crosshair select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Draw finalized ROIs */}
            {rois.map((roi, idx) => {
              const isSelected = roi.id === selectedId
              const styles = getRoiColor(idx, isSelected)
              return (
                <g key={roi.id}>
                  {/* Bounding box rect */}
                  <rect
                    x={`${roi.x}%`}
                    y={`${roi.y}%`}
                    width={`${roi.w}%`}
                    height={`${roi.h}%`}
                    fill={styles.fill}
                    stroke={styles.stroke}
                    strokeWidth={isSelected ? 3 : 2}
                    data-roi-id={roi.id}
                    className="transition-colors duration-150"
                  />
                  {/* Text Label */}
                  <text
                    x={`${roi.x + 1}%`}
                    y={`${roi.y + 4}%`}
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="bold"
                    className="select-none pointer-events-none drop-shadow-md"
                  >
                    {roi.name}
                  </text>

                  {/* Corner Resize Handles if Selected */}
                  {isSelected && (
                    <>
                      <circle cx={`${roi.x}%`} cy={`${roi.y}%`} r="6" fill="#ffffff" stroke={styles.stroke} strokeWidth="2" data-handle="tl" className="cursor-nwse-resize" />
                      <circle cx={`${roi.x + roi.w}%`} cy={`${roi.y}%`} r="6" fill="#ffffff" stroke={styles.stroke} strokeWidth="2" data-handle="tr" className="cursor-nesw-resize" />
                      <circle cx={`${roi.x}%`} cy={`${roi.y + roi.h}%`} r="6" fill="#ffffff" stroke={styles.stroke} strokeWidth="2" data-handle="bl" className="cursor-nesw-resize" />
                      <circle cx={`${roi.x + roi.w}%`} cy={`${roi.y + roi.h}%`} r="6" fill="#ffffff" stroke={styles.stroke} strokeWidth="2" data-handle="br" className="cursor-nwse-resize" />
                    </>
                  )}
                </g>
              )
            })}

            {/* Draw temporary ROI currently being drawn */}
            {tempRoi && (
              <rect
                x={`${tempRoi.x}%`}
                y={`${tempRoi.y}%`}
                width={`${tempRoi.w}%`}
                height={`${tempRoi.h}%`}
                fill="rgba(59, 130, 246, 0.3)"
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                strokeDasharray="4"
              />
            )}
          </svg>
        </div>

        {/* Video Custom Media Controls */}
        <div className="mt-4 bg-slate-900 text-white rounded-xl p-4 flex flex-col gap-3 border border-slate-800 shadow-lg">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-500 transition-colors shadow"
            >
              {isPlaying ? (
                // Pause SVG
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                // Play SVG
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>

            <span className="text-xs font-mono text-slate-400">
              {new Date(currentTime * 1000).toISOString().substr(11, 8)} /{' '}
              {new Date(duration * 1000).toISOString().substr(11, 8)}
            </span>

            {/* Scrub slider */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.05"
              value={currentTime}
              onChange={handleScrub}
              className="flex-grow accent-sky-600 bg-slate-700 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <p className="text-xs text-slate-400">
            Tip: Pause the video at the frame you wish to analyze, then click and drag on the video preview above to draw ROI zones.
          </p>
        </div>
      </div>

      {/* Control panel & Zone Listing Column */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Surveillance Zones</h3>
          <p className="text-xs text-slate-500 mb-4">Define target areas of monitoring.</p>

          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto mb-4 pr-1">
            {rois.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
                No active zones. Draw directly on the video.
              </div>
            ) : (
              rois.map((roi, idx) => (
                <div
                  key={roi.id}
                  onClick={() => setSelectedId(roi.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedId === roi.id
                      ? 'border-sky-500 bg-sky-50/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 font-mono">ROI #{idx + 1}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteRoi(roi.id)
                      }}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-slate-100"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={roi.name}
                    onChange={(e) => updateRoiName(roi.id, e.target.value)}
                    className="w-full text-sm font-semibold text-slate-700 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none py-1"
                    placeholder="Enter zone name"
                  />

                  {/* Preset Quick Buttons */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PRESET_NAMES.map(preset => (
                      <button
                        key={preset}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateRoiName(roi.id, preset)
                        }}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedRoi && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-600 mb-4">
              <strong>Active Coordinates:</strong>
              <div className="font-mono mt-1 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <div>X: {Math.round(selectedRoi.x)}%</div>
                <div>Y: {Math.round(selectedRoi.y)}%</div>
                <div>W: {Math.round(selectedRoi.w)}%</div>
                <div>H: {Math.round(selectedRoi.h)}%</div>
              </div>
            </div>
          )}
        </div>

        {/* Ingestion Submit Actions */}
        <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
          <button
            onClick={handleProcess}
            disabled={rois.length === 0}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Video Analysis
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
