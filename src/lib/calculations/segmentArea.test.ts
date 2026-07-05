import { describe, expect, it } from 'vitest'
import { calculateSegments, cumulativeArea, type WidthReading } from './segmentArea'

function reading(stationSequence: number, station: number, width: number): WidthReading {
  return { stationSequence, station, width }
}

describe('calculateSegments', () => {
  it('computes a basic trapezoidal segment (680 -> 711, width 4 -> 4)', () => {
    const readings = [reading(1, 680, 4), reading(2, 711, 4)]
    const [segment] = calculateSegments(readings)

    expect(segment.length).toBe(31)
    expect(segment.avgWidth).toBe(4)
    expect(segment.area).toBe(124)
    expect(segment.isRolloverBoundary).toBe(false)
  })

  it('computes a basic trapezoidal segment (740 -> 750, width 2.6 -> 2.6)', () => {
    const readings = [reading(1, 740, 2.6), reading(2, 750, 2.6)]
    const [segment] = calculateSegments(readings)

    expect(segment.length).toBe(10)
    expect(segment.avgWidth).toBe(2.6)
    expect(segment.area).toBe(26)
    expect(segment.isRolloverBoundary).toBe(false)
  })

  it('zeroes out length and flags a rollover boundary (45051.13 -> 19.83)', () => {
    const readings = [reading(1, 45051.13, 3), reading(2, 19.83, 3)]
    const [segment] = calculateSegments(readings)

    expect(segment.length).toBe(0)
    expect(segment.area).toBe(0)
    expect(segment.isRolloverBoundary).toBe(true)
  })

  it('handles a same-station width change (500 -> 500, width 4.0 -> 6.0)', () => {
    const readings = [reading(1, 500, 4.0), reading(2, 500, 6.0)]
    const [segment] = calculateSegments(readings)

    expect(segment.length).toBe(0)
    expect(segment.area).toBe(0)
    expect(segment.isRolloverBoundary).toBe(false)
  })

  it('preserves array (field entry) order rather than sorting by station', () => {
    const readings = [reading(1, 100, 5), reading(2, 50, 5)]
    const [segment] = calculateSegments(readings)

    expect(segment.fromStation).toBe(100)
    expect(segment.toStation).toBe(50)
    expect(segment.length).toBe(50)
  })

  it('throws when readings are not pre-sorted by stationSequence', () => {
    const readings = [reading(1, 100, 5), reading(3, 150, 5), reading(2, 200, 5)]

    expect(() => calculateSegments(readings)).toThrow(
      'WidthReadings must be pre-sorted by stationSequence — received out-of-order input at index 2.',
    )
  })
})

describe('cumulativeArea', () => {
  it('sums area across a multi-segment sequence, excluding the rollover boundary segment', () => {
    // Ascends near the end of a chainage run, rolls over once, then continues
    // ascending in the new range. Only the 45060 -> 20 pair should be flagged.
    const readings = [
      reading(1, 45000, 4),
      reading(2, 45020, 4), // seg1: len 20, width 4   -> area 80   (normal)
      reading(3, 45050, 6), // seg2: len 30, avgWidth 5 -> area 150 (normal)
      reading(4, 45060, 6), // seg3: len 10, width 6   -> area 60   (normal)
      reading(5, 20, 8), // seg4: 45060 -> 20, diff -45040 -> rollover, area 0
      reading(6, 40, 8), // seg5: len 20, width 8   -> area 160 (normal)
      reading(7, 70, 10), // seg6: len 30, avgWidth 9 -> area 270 (normal)
    ]

    const segments = calculateSegments(readings)
    expect(segments).toHaveLength(6)

    const rolloverSegments = segments.filter((s) => s.isRolloverBoundary)
    expect(rolloverSegments).toHaveLength(1)
    expect(rolloverSegments[0].fromStation).toBe(45060)
    expect(rolloverSegments[0].toStation).toBe(20)
    expect(rolloverSegments[0].length).toBe(0)
    expect(rolloverSegments[0].area).toBe(0)

    const areas = segments.map((s) => s.area)
    expect(areas).toEqual([80, 150, 60, 0, 160, 270])

    // Segments before and after the rollover both count normally; only the
    // rollover-spanning segment itself contributes zero.
    expect(cumulativeArea(segments)).toBe(720)
  })
})
