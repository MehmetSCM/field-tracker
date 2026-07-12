import Dexie, { type EntityTable } from 'dexie'

/**
 * Local, offline-first store for width_readings. This is the single source
 * of truth the milling screen renders from — both server-confirmed rows
 * (imported on load) and locally-queued not-yet-synced entries live here,
 * so the UI never has to reconcile two separate lists.
 */
export interface QueuedWidthReading {
  localId?: number
  /** width_readings.id once synced to Supabase; null while only queued locally. */
  serverId: string | null
  roadSegmentId: string
  direction: string
  /** paving_date, in YYYY-MM-DD form. */
  date: string
  stationSequence: number
  station: number
  width: number
  isCorrection: boolean
  /** serverId of the row that superseded this one, once known. */
  supersededBy: string | null
  correctionReason: string | null
  status: 'queued' | 'synced' | 'error'
  lastError: string | null
  createdAt: number
}

/**
 * Local, offline-first store for "extra area" surface_lifecycle_events
 * (entry_method='manual_area_entry') — tie-ins, driveways, and other areas
 * outside the main continuous station/width walk. Same "one local table is
 * the whole source of truth" pattern as widthReadingsQueue above: both
 * server-imported and locally-queued-not-yet-synced rows live here
 * together.
 */
export interface QueuedExtraAreaEntry {
  localId?: number
  /** surface_lifecycle_events.id once synced; null while only queued locally. */
  serverId: string | null
  roadSegmentId: string
  /** event_date, in YYYY-MM-DD form. */
  date: string
  eventType: string
  quantity: number
  locationDescription: string
  /** Field-entered station, if given — display only; may differ from fromStation/toStation once a coordinator refines the range on review. */
  station: number | null
  /** Always set (from_station/to_station are NOT NULL) — station if given, else the segment's own bounds as a rough placeholder a coordinator narrows down during review. */
  fromStation: number
  toStation: number
  fieldNarrative: string | null
  /** null until this entry has synced and its server-side review_status is known. */
  reviewStatus: 'pending_review' | 'confirmed' | null
  status: 'queued' | 'synced' | 'error'
  lastError: string | null
  createdAt: number
}

const db = new Dexie('field-tracker') as Dexie & {
  widthReadingsQueue: EntityTable<QueuedWidthReading, 'localId'>
  extraAreaQueue: EntityTable<QueuedExtraAreaEntry, 'localId'>
}

db.version(1).stores({
  widthReadingsQueue: '++localId, serverId, roadSegmentId, date, status',
})

db.version(2).stores({
  widthReadingsQueue: '++localId, serverId, roadSegmentId, date, status',
  extraAreaQueue: '++localId, serverId, roadSegmentId, date, status',
})

export { db }
