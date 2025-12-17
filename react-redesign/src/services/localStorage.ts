// Local Storage Service - replicates IndexedDB behavior from original frontend
import { Animal } from './api'

const STORAGE_KEY = 'farm-register-db'

export interface LocalRecord extends Animal {
  id: number
  synced: boolean
  backendId?: number
  createdAt: string
}

class LocalStorageService {
  private getStorage(): LocalRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Error reading from localStorage:', error)
      return []
    }
  }

  private setStorage(records: LocalRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch (error) {
      console.error('Error writing to localStorage:', error)
    }
  }

  private getNextId(): number {
    const records = this.getStorage()
    const maxId = records.reduce((max, record) => Math.max(max, record.id || 0), 0)
    return maxId + 1
  }

  async addRecord(record: Omit<Animal, 'id'>): Promise<LocalRecord> {
    const records = this.getStorage()
    const nowIso = new Date().toISOString()
    const newRecord: LocalRecord = {
      ...record,
      id: this.getNextId(),
      synced: false,
      createdAt: nowIso
    }
    
    records.push(newRecord)
    this.setStorage(records)
    
    console.log('Added local record:', newRecord)
    return newRecord
  }

  async getRecords(options: { unsyncedOnly?: boolean } = {}): Promise<LocalRecord[]> {
    const records = this.getStorage()
    
    if (options.unsyncedOnly) {
      return records.filter(r => !r.synced)
    }
    
    return records
  }

  async getRecordById(id: number): Promise<LocalRecord | null> {
    const records = this.getStorage()
    return records.find(r => r.id === id) || null
  }

  async markAsSynced(id: number, backendId?: number): Promise<void> {
    const records = this.getStorage()
    const recordIndex = records.findIndex(r => r.id === id)
    
    if (recordIndex !== -1) {
      records[recordIndex].synced = true
      if (backendId) {
        records[recordIndex].backendId = backendId
      }
      this.setStorage(records)
      console.log('Marked record as synced:', { id, backendId })
    }
  }

  async updateRecord(id: number, updates: Partial<Animal>): Promise<void> {
    const records = this.getStorage()
    const recordIndex = records.findIndex(r => r.id === id)
    
    if (recordIndex !== -1) {
      records[recordIndex] = { ...records[recordIndex], ...updates, synced: false }
      this.setStorage(records)
      console.log('Updated local record:', { id, updates })
    }
  }

  async deleteRecord(id: number): Promise<void> {
    const records = this.getStorage()
    const filteredRecords = records.filter(r => r.id !== id)
    this.setStorage(filteredRecords)
    console.log('Deleted local record:', id)
  }

  async importFromServer(serverData: { count: number, items: Animal[] } | Animal[]): Promise<void> {
    const localRecords = this.getStorage()
    const nowIso = new Date().toISOString()
    
    // Handle both response formats
    const serverRecords = Array.isArray(serverData) ? serverData : serverData.items || []
    
    // Build sets for deduplication - use BOTH backendId AND animal_number
    const existingBackendIds = new Set(localRecords.map(r => r.backendId).filter(Boolean))
    const existingAnimalNumbers = new Set(localRecords.map(r => r.animal_number).filter(Boolean))
    
    // Filter out duplicates BEFORE creating local records
    const newServerRecords = serverRecords.filter(record => {
      // Skip if we already have this record by backendId
      if (record.id && existingBackendIds.has(record.id)) {
        return false
      }
      // Skip if we already have this animal_number (primary dedup key)
      if (record.animal_number && existingAnimalNumbers.has(record.animal_number)) {
        return false
      }
      return true
    })
    
    // Convert only NEW server records to local format
    const baseId = this.getNextId()
    const newRecordsAsLocal: LocalRecord[] = newServerRecords.map((record, index) => ({
      ...record,
      id: baseId + index,
      synced: true,
      backendId: record.id,
      createdAt: record.created_at || nowIso
    }))
    
    const mergedRecords = [...localRecords, ...newRecordsAsLocal]
    this.setStorage(mergedRecords)
    
    console.log('[LocalStorage] Import from server:', { 
      serverTotal: serverRecords.length, 
      newRecords: newRecordsAsLocal.length,
      skippedDuplicates: serverRecords.length - newRecordsAsLocal.length,
      localTotal: mergedRecords.length
    })
  }

  // Clear all synced records and replace with server data (full refresh)
  async replaceWithServerData(serverData: { count: number, items: Animal[] } | Animal[]): Promise<void> {
    const localRecords = this.getStorage()
    const nowIso = new Date().toISOString()
    
    // Keep only unsynced local records (pending uploads)
    const unsyncedRecords = localRecords.filter(r => !r.synced)
    
    // Handle both response formats
    const serverRecords = Array.isArray(serverData) ? serverData : serverData.items || []
    
    // Build set of unsynced animal numbers to avoid duplicates
    const unsyncedAnimalNumbers = new Set(unsyncedRecords.map(r => r.animal_number))
    
    // Convert server records, excluding any that match unsynced local records
    const baseId = this.getNextId()
    const serverRecordsAsLocal: LocalRecord[] = serverRecords
      .filter(record => !unsyncedAnimalNumbers.has(record.animal_number))
      .map((record, index) => ({
        ...record,
        id: baseId + index,
        synced: true,
        backendId: record.id,
        createdAt: record.created_at || nowIso
      }))
    
    // Combine: unsynced local + fresh server data
    const mergedRecords = [...unsyncedRecords, ...serverRecordsAsLocal]
    this.setStorage(mergedRecords)
    
    console.log('[LocalStorage] Replaced with server data:', { 
      unsyncedKept: unsyncedRecords.length,
      serverRecords: serverRecordsAsLocal.length,
      total: mergedRecords.length
    })
  }

  async getPendingCount(): Promise<number> {
    const unsynced = await this.getRecords({ unsyncedOnly: true })
    return unsynced.length
  }

  // Get records for display (unsynced first, then last 10 synced)
  async getDisplayRecords(limit: number = 10): Promise<LocalRecord[]> {
    const allRecords = await this.getRecords()
    const unsynced = allRecords.filter(r => !r.synced)
    const synced = allRecords
      .filter(r => r.synced)
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, limit)
    
    return [...unsynced, ...synced]
  }
}

export const localStorageService = new LocalStorageService()
