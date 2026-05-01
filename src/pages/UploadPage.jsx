import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AIRCRAFT_TYPES, ORGANIZATIONS, MOCK_PROCEDURE } from '@/lib/mockData'

export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [aircraftType, setAircraftType] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [status, setStatus] = useState('idle') // idle | uploading | processing | done | error
  const [dragOver, setDragOver] = useState(false)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  const canSubmit = selectedFile && aircraftType && organizationId && status === 'idle'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    // Simulate the upload + processing pipeline with mock delays
    setStatus('uploading')
    await delay(1000)

    setStatus('processing')
    await delay(2500)

    // Store mock result and navigate to review
    sessionStorage.setItem('procedureResult', JSON.stringify({
      ...MOCK_PROCEDURE,
      aircraftType: AIRCRAFT_TYPES.find(a => a.value === aircraftType)?.label,
      sourcePdfName: selectedFile.name,
      organizationId,
    }))

    setStatus('done')
    await delay(300)
    navigate('/review')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-primary tracking-widest uppercase">QuickTurn</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Procedure Import</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Upload a maintenance PDF to extract and review.</p>
        </div>

        <div className="border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Upload Procedure PDF</p>
          </div>
          <div className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
                  relative flex flex-col items-center justify-center gap-2 border border-dashed
                  px-6 py-8 cursor-pointer transition-colors
                  ${dragOver
                    ? 'border-primary bg-primary/5'
                    : selectedFile
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <UploadIcon selected={!!selectedFile} />
                {selectedFile ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Drop PDF here or click to browse</p>
                  </div>
                )}
              </div>

              {/* Aircraft type */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Aircraft Type</label>
                <Select value={aircraftType} onValueChange={setAircraftType}>
                  <SelectTrigger className="border-border bg-input rounded-none h-9 text-sm">
                    <SelectValue placeholder="Select aircraft type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {AIRCRAFT_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Organization */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Organization</label>
                <Select value={organizationId} onValueChange={setOrganizationId}>
                  <SelectTrigger className="border-border bg-input rounded-none h-9 text-sm">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {ORGANIZATIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full rounded-none font-mono text-xs tracking-widest uppercase h-10"
                disabled={!canSubmit}
              >
                {(status === 'uploading' || status === 'processing') && <Spinner />}
                {status === 'uploading' && 'Uploading...'}
                {status === 'processing' && 'Parsing Procedure...'}
                {status === 'idle' && 'Parse Procedure'}
                {status === 'done' && 'Done'}
              </Button>

              {status === 'processing' && (
                <p className="text-xs text-center text-muted-foreground font-mono">
                  AI extraction in progress — this may take a minute.
                </p>
              )}
            </form>
          </div>
        </div>

      </div>
    </div>
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function UploadIcon({ selected }) {
  return (
    <svg
      className={`w-7 h-7 ${selected ? 'text-primary' : 'text-muted-foreground'}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
