import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function ReviewPage() {
  const navigate = useNavigate()
  const [importStatus, setImportStatus] = useState('idle') // idle | loading | success | error

  const raw = sessionStorage.getItem('procedureResult')
  const procedure = raw ? JSON.parse(raw) : null

  if (!procedure) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <div>
          <p className="text-muted-foreground text-sm mb-4">No procedure data found.</p>
          <Button variant="outline" className="rounded-none font-mono text-xs uppercase tracking-widest" onClick={() => navigate('/upload')}>
            Back to Upload
          </Button>
        </div>
      </div>
    )
  }

  if (procedure.status === 'docling_only') {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-primary tracking-widest uppercase">QuickTurn — Docling Output</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/upload')} className="rounded-none font-mono text-xs uppercase tracking-widest text-muted-foreground h-7 px-2">
            &larr; New Upload
          </Button>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Source: {procedure.sourcePdfName}</p>
          <p className="text-xs font-mono text-yellow-500">GPU EC2 not connected — showing raw Docling markdown</p>
          <pre className="text-xs font-mono text-foreground bg-muted/30 border border-border p-4 whitespace-pre-wrap leading-relaxed">
            {procedure.markdown}
          </pre>
        </div>
      </div>
    )
  }

  async function handleApprove() {
    setImportStatus('loading')
    // TODO: wire up GraphQL mutation importProcedure
    await delay(1500)
    setImportStatus('success')
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Top bar */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-primary tracking-widest uppercase">QuickTurn</span>
          <span className="text-muted-foreground text-xs">|</span>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Review Extracted Procedure</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/upload')}
          className="rounded-none font-mono text-xs uppercase tracking-widest text-muted-foreground h-7 px-2"
        >
          &larr; New Upload
        </Button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        {/* Procedure title */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{procedure.title}</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {procedure.planeType} &nbsp;/&nbsp; {procedure.sourcePdfName}
          </p>
        </div>

        {/* Metadata block */}
        <div className="border border-border">
          <div className="px-4 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Procedure Details</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Description</p>
              <p className="text-sm leading-relaxed">{procedure.description}</p>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Aircraft</p>
                <p className="text-sm font-medium">{procedure.planeType}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Steps</p>
                <p className="text-sm font-medium">{procedure.steps.length}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Zones</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {procedure.zones.map((z) => (
                    <Badge key={z} variant="outline" className="rounded-none text-xs font-mono">{z}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Steps</p>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-px">
            {procedure.steps.map((step) => (
              <div key={step.stepNumber} className="border border-border">
                {/* Step header */}
                <div className="flex items-start gap-0">
                  <div className="flex-none w-12 border-r border-border py-3 flex items-start justify-center">
                    <span className="text-sm font-mono font-bold text-primary">{String(step.stepNumber).padStart(2, '0')}</span>
                  </div>
                  <div className="flex-1 min-w-0 p-3 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-sm">{step.title}</p>
                      {step.zone && (
                        <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5">
                          ZONE {step.zone}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.details}</p>

                    {/* Warnings */}
                    {step.warnings.length > 0 && (
                      <div className="border-l-2 border-destructive bg-destructive/10 px-3 py-2 space-y-1">
                        <p className="text-xs font-mono font-bold text-destructive uppercase tracking-widest">Warning</p>
                        {step.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-destructive">{w}</p>
                        ))}
                      </div>
                    )}

                    {/* Notes + Tools */}
                    {(step.notes.length > 0 || step.requiredTools.length > 0) && (
                      <div className="flex flex-wrap gap-6 pt-1">
                        {step.notes.length > 0 && (
                          <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Note</p>
                            {step.notes.map((n, i) => (
                              <p key={i} className="text-xs text-muted-foreground">{n}</p>
                            ))}
                          </div>
                        )}
                        {step.requiredTools.length > 0 && (
                          <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Required Tools</p>
                            <div className="flex flex-wrap gap-1">
                              {step.requiredTools.map((t, i) => (
                                <span key={i} className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Approve bar */}
        <div className="border-t border-border pt-5 pb-10">
          {importStatus === 'success' ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-green-400 font-mono">// Procedure imported successfully.</p>
              <Button
                variant="outline"
                className="rounded-none font-mono text-xs uppercase tracking-widest"
                onClick={() => navigate('/upload')}
              >
                Upload Another
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Review all steps before importing. This action cannot be undone.
              </p>
              <Button
                onClick={handleApprove}
                disabled={importStatus === 'loading'}
                className="rounded-none font-mono text-xs uppercase tracking-widest shrink-0"
              >
                {importStatus === 'loading' && <Spinner />}
                {importStatus === 'loading' ? 'Importing...' : 'Approve and Import'}
              </Button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
