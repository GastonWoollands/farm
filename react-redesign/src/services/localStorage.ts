// Local Storage Service - Separate Pending vs Cache architecture
// PENDING: Offline-created records awaiting sync (deleted after sync)
// CACHE: Complete server data mirror (replaced entirely on sync)

import { Animal } from './api'

const PENDING_KEY = 'farm-pending-records'
const CACHE_KEY = 'farm-server-cache'
const CACHE_TIMESTAMP_KEY = 'farm-cache-timestamp'

export interface PendingRecord extends Animal {
  localId: number  // Local ID for tracking
  createdAt: string
}

export interface CachedRecord extends Animal {
  // Server records as-is
}

class LocalStorageService {
  // ========================================
  // PENDING RECORDS (offline-created, awaiting sync)
  // ========================================

  private getPendingStorage(): PendingRecord[] {
    try {
      const stored = localStorage.getItem(PENDING_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('[Storage] Error reading pending records:', error)
      return []
    }
  }

  private setPendingStorage(records: PendingRecord[]): void {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(records))
    } catch (error) {
      console.error('[Storage] Error writing pending records:', error)
    }
  }

  private getNextLocalId(): number {
    const pending = this.getPendingStorage()
    const maxId = pending.reduce((max, record) => Math.max(max, record.localId || 0), 0)
    return maxId + 1
  }

  /**
   * Add a new record to pending storage (created offline)
   */
  async addPendingRecord(record: Omit<Animal, 'id'>): Promise<PendingRecord> {
    const pending = this.getPendingStorage()
    const newRecord: PendingRecord = {
      ...record,
      localId: this.getNextLocalId(),
      createdAt: new Date().toISOString()
    }
    
    pending.push(newRecord)
    this.setPendingStorage(pending)
    
    console.log('[Storage] Added pending record:', newRecord.animal_number)
    return newRecord
  }

  /**
   * Get all pending records (awaiting sync)
   */
  async getPendingRecords(): Promise<PendingRecord[]> {
    return this.getPendingStorage()
  }

  /**
   * Get count of pending records
   */
  async getPendingCount(): Promise<number> {
    return this.getPendingStorage().length
  }

  /**
   * Remove a specific pending record (after successful sync)
   */
  async removePendingRecord(localId: number): Promise<void> {
    const pending = this.getPendingStorage()
    const filtered = pending.filter(r => r.localId !== localId)
    this.setPendingStorage(filtered)
    console.log('[Storage] Removed pending record:', localId)
  }

  /**
   * Clear ALL pending records (after successful full sync)
   */
  async clearAllPending(): Promise<void> {
    localStorage.removeItem(PENDING_KEY)
    console.log('[Storage] Cleared all pending records')
  }

  /**
   * Delete a pending record by localId (user action)
   */
  async deletePendingRecord(localId: number): Promise<void> {
    await this.removePendingRecord(localId)
  }

  // ========================================
  // SERVER CACHE (complete server mirror)
  // ========================================

  private getCacheStorage(): CachedRecord[] {
    try {
      const stored = localStorage.getItem(CACHE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('[Storage] Error reading cache:', error)
      return []
    }
  }

  private setCacheStorage(records: CachedRecord[]): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(records))
      localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString())
    } catch (error) {
      console.error('[Storage] Error writing cache:', error)
    }
  }

  /**
   * Get cached server data
   */
  async getServerCache(): Promise<CachedRecord[]> {
    return this.getCacheStorage()
  }

  /**
   * REPLACE entire server cache with fresh data (never merge!)
   */
  async setServerCache(serverData: { count?: number, items?: Animal[] } | Animal[]): Promise<void> {
    // Handle both response formats
    const records = Array.isArray(serverData) ? serverData : serverData.items || []
    
    this.setCacheStorage(records)
    console.log('[Storage] Replaced server cache:', records.length, 'records')
  }

  /**
   * Get cache timestamp
   */
  getCacheTimestamp(): string | null {
    return localStorage.getItem(CACHE_TIMESTAMP_KEY)
  }

  /**
   * Clear server cache
   */
  async clearServerCache(): Promise<void> {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_TIMESTAMP_KEY)
    console.log('[Storage] Cleared server cache')
  }

  // ========================================
  // COMBINED DATA (for display when offline)
  // ========================================

  /**
   * Get all records for display (pending + cached)
   * Pending records appear first (they're the user's recent work)
   */
  async getAllRecords(): Promise<Animal[]> {
    const pending = await this.getPendingRecords()
    const cached = await this.getServerCache()
    
    // Pending records first, then cached
    // Convert pending to Animal format
    const pendingAsAnimals: Animal[] = pending.map(p => ({
      ...p,
      id: undefined, // No server ID yet
    }))
    
    return [...pendingAsAnimals, ...cached]
  }

  /**
   * Get display records with limit
   */
  async getDisplayRecords(limit: number = 10): Promise<Animal[]> {
    const all = await this.getAllRecords()
    return all.slice(0, limit)
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Clear ALL local storage (both pending and cache)
   */
  async clearAll(): Promise<void> {
    await this.clearAllPending()
    await this.clearServerCache()
    console.log('[Storage] Cleared all local storage')
  }

  /**
   * Check if there's any cached data
   */
  hasCachedData(): boolean {
    const cached = this.getCacheStorage()
    return cached.length > 0
  }

  /**
   * Get storage status
   */
  getStorageStatus(): {
    pendingCount: number
    cacheCount: number
    cacheTimestamp: string | null
  } {
    return {
      pendingCount: this.getPendingStorage().length,
      cacheCount: this.getCacheStorage().length,
      cacheTimestamp: this.getCacheTimestamp()
    }
  }

  // ========================================
  // LEGACY COMPATIBILITY (to be removed after migration)
  // ========================================

  /**
   * Migrate old storage format to new format
   * Call once on app startup to migrate existing data
   */
  async migrateFromLegacy(): Promise<void> {
    const legacyKey = 'farm-register-db'
    const legacyData = localStorage.getItem(legacyKey)
    
    if (!legacyData) {
      return // No legacy data to migrate
    }

    try {
      const legacyRecords = JSON.parse(legacyData)
      
      // Separate synced (cache) from unsynced (pending)
      const pending: PendingRecord[] = []
      const cache: CachedRecord[] = []
      
      for (const record of legacyRecords) {
        if (record.synced === false) {
          // Unsynced = pending
          pending.push({
            ...record,
            localId: record.id || this.getNextLocalId(),
            createdAt: record.createdAt || record.created_at || new Date().toISOString()
          })
        } else {
          // Synced = cache
          cache.push(record)
        }
      }
      
      // Set new storages
      if (pending.length > 0) {
        this.setPendingStorage(pending)
      }
      if (cache.length > 0) {
        this.setCacheStorage(cache)
      }
      
      // Remove legacy storage
      localStorage.removeItem(legacyKey)
      
      console.log('[Storage] Migrated legacy data:', {
        pending: pending.length,
        cache: cache.length
      })
    } catch (error) {
      console.error('[Storage] Error migrating legacy data:', error)
    }
  }
}

export const localStorageService = new LocalStorageService()
