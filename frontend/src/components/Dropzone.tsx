import React, { useRef } from 'react'

type Props = { onFile: (f: File | null) => void }

export default function Dropzone({ onFile }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return onFile(null)
    const file = filesList[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['mp4', 'avi', 'mov'].includes(ext || '')) {
      return onFile(null)
    }
    onFile(file)
  }

  return (
    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
      <p className="text-slate-500">Drag video here or</p>
      <div className="mt-3">
        <input ref={ref} type="file" accept="video/*" onChange={e => handleFiles(e.target.files)} />
      </div>
    </div>
  )
}
