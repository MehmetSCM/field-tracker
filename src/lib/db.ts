import Dexie, { type EntityTable } from 'dexie'

interface QueuedRecord {
  id?: number
  createdAt: number
  synced: boolean
  payload: unknown
}

const db = new Dexie('field-tracker') as Dexie & {
  queue: EntityTable<QueuedRecord, 'id'>
}

db.version(1).stores({
  queue: '++id, createdAt, synced',
})

export type { QueuedRecord }
export { db }
