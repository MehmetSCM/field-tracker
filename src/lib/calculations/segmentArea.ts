const ROLLOVER_THRESHOLD = 5000

export interface WidthReading {
  /** field entry order — the array must stay in this order, never sorted by station number */
  stationSequence: number
  /** metres from LKI origin, can reset (rollover) */
  station: number
  /** metres */
  width: number
}

export interface Segment {
  fromStation: number
  toStation: number
  length: number
  avgWidth: number
  area: number
  /** true when this segment's length was zeroed due to rollover */
  isRolloverBoundary: boolean
  /** width at fromStation — needed to solve for a station partway through a segment (width varies linearly, not just the average) */
  fromWidth: number
  /** width at toStation */
  toWidth: number
}

export function calculateSegments(readings: WidthReading[]): Segment[] {
  for (let i = 0; i < readings.length - 1; i++) {
    if (readings[i].stationSequence >= readings[i + 1].stationSequence) {
      throw new Error(
        `WidthReadings must be pre-sorted by stationSequence — received out-of-order input at index ${i + 1}.`,
      )
    }
  }

  const segments: Segment[] = []

  for (let i = 0; i < readings.length - 1; i++) {
    const a = readings[i]
    const b = readings[i + 1]

    const rawDiff = b.station - a.station
    const isRolloverBoundary = Math.abs(rawDiff) > ROLLOVER_THRESHOLD
    const length = isRolloverBoundary ? 0 : Math.abs(rawDiff)
    const avgWidth = (a.width + b.width) / 2
    const area = avgWidth * length

    segments.push({
      fromStation: a.station,
      toStation: b.station,
      length,
      avgWidth,
      area,
      isRolloverBoundary,
      fromWidth: a.width,
      toWidth: b.width,
    })
  }

  return segments
}

export function cumulativeArea(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.area, 0)
}
