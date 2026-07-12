import { useState } from 'react'
import type { QueuedWidthReading } from '../../lib/db'
import { applyCorrection } from '../../lib/sync/widthReadingsSync'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

export function CorrectionForm({
  entry,
  onClose,
}: {
  entry: QueuedWidthReading
  onClose: () => void
}) {
  const [correctedStation, setCorrectedStation] = useState(String(entry.station))
  const [correctedWidth, setCorrectedWidth] = useState(String(entry.width))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const stationValue = Number(correctedStation)
    const widthValue = Number(correctedWidth)
    if (!Number.isFinite(stationValue)) {
      setError('Enter a valid station.')
      return
    }
    if (!Number.isFinite(widthValue)) {
      setError('Enter a valid width.')
      return
    }
    if (reason.trim() === '') {
      setError('A correction reason is required.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await applyCorrection({
        original: entry,
        correctedStation: stationValue,
        correctedWidth: widthValue,
        reason: reason.trim(),
      })
      onClose()
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save correction.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="milling-correction-backdrop" onClick={onClose}>
      <form
        className="milling-correction-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>Correct Entry</h2>
        <p className="milling-correction-original">
          Original: {entry.station} m, {entry.width} m wide
        </p>

        <label className="milling-field milling-field-large">
          <span>Corrected station (m)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={correctedStation}
            onChange={(e) => setCorrectedStation(e.target.value)}
          />
        </label>

        <label className="milling-field milling-field-large">
          <span>Corrected width (m)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={correctedWidth}
            onChange={(e) => setCorrectedWidth(e.target.value)}
          />
        </label>

        <label className="milling-field">
          <span>Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this being corrected?"
          />
        </label>

        {error && <p className="milling-error">{error}</p>}

        <div className="milling-correction-actions">
          <button type="button" onClick={onClose} className="milling-cancel" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="milling-submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </form>
    </div>
  )
}
