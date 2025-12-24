import { API_BASE_URL, API_ENDPOINTS } from '@/config/api'
import { localStorageService, PendingRecord } from './localStorage'

// Types
export interface Animal {
  id?: number  // Optional since export-multi-tenant doesn't return id
  animal_number: string
  born_date?: string
  mother_id?: string
  father_id?: string
  weight?: number
  current_weight?: number
  gender?: string
  animal_type?: number
  status?: string
  color?: string
  notes?: string
  notes_mother?: string
  created_at?: string
  insemination_round_id?: string
  insemination_identifier?: string
  scrotal_circumference?: number
  rp_animal?: string
  rp_mother?: string
  mother_weight?: number
  weaning_weight?: number
  death_date?: string
  sold_date?: string
  synced?: boolean
}

export interface RegisterBody {
  animalNumber: string
  rpAnimal?: string
  motherId?: string
  rpMother?: string
  fatherId?: string
  bornDate?: string
  weight?: number
  currentWeight?: number
  motherWeight?: number
  weaningWeight?: number
  gender?: string
  animalType?: number
  status: string
  color?: string
  notes?: string
  notesMother?: string
  scrotalCircumference?: number
  inseminationRoundId?: string
  inseminationIdentifier?: string
  deathDate?: string
  soldDate?: string
}

export interface UpdateBody {
  animalNumber: string
  createdAt: string
  rpAnimal?: string
  motherId?: string
  rpMother?: string
  fatherId?: string
  bornDate?: string
  weight?: number
  currentWeight?: number
  motherWeight?: number
  weaningWeight?: number
  gender?: string
  status?: string
  color?: string
  notes?: string
  notesMother?: string
  scrotalCircumference?: number
  inseminationRoundId?: string
  deathDate?: string
  soldDate?: string
}

export interface UpdateAnimalByNumberBody {
  animalNumber: string
  currentWeight?: number
  notes?: string
  status?: string
  color?: string
  rpAnimal?: string
  notesMother?: string
}

export interface RegistrationStats {
  totalAnimals: number
  aliveAnimals: number
  deadAnimals: number
  soldAnimals?: number
  maleAnimals: number
  femaleAnimals: number
  avgWeight: number
  minWeight: number
  maxWeight: number
}

export interface InseminationRound {
  id: number
  insemination_round_id: string
  initial_date: string
  end_date: string
  notes?: string
  company_id?: number
  created_at: string
  updated_at: string
}

export interface Insemination {
  id: number
  insemination_identifier: string
  insemination_round_id: string
  mother_id: string
  mother_visual_id?: string
  bull_id?: string
  insemination_date: string
  registration_date: string
  animal_type?: string
  notes?: string
  created_by: string
  updated_at: string
}

export interface InseminationBody {
  inseminationIdentifier: string
  inseminationRoundId: string
  motherId: string
  motherVisualId?: string
  bullId?: string
  inseminationDate: string
  animalType?: string
  notes?: string
}

export interface InseminationRoundBody {
  insemination_round_id: string
  initial_date: string
  end_date: string
  notes?: string
}

export interface InseminationUploadResponse {
  ok: boolean
  message?: string
  uploaded?: number
  skipped?: number
  errors?: string[]
  warnings?: string[]
}

export interface User {
  user_id: number
  firebase_uid: string
  name: string
  email: string
  role: string
  company_id?: number
  created_at: string
}

export interface Company {
  id?: number  // Backend returns 'id' from user_context
  company_id?: number  // Some endpoints may use 'company_id'
  name: string
  created_at?: string
  has_company?: boolean
}

// =============================================================================
// EVENT SOURCING TYPES (New Architecture)
// =============================================================================

export interface AnimalSnapshot {
  animal_id: number
  animal_number: string
  company_id: number
  birth_date?: string
  mother_id?: string
  father_id?: string
  current_status?: string
  current_weight?: number
  weaning_weight?: number
  gender?: string
  color?: string
  death_date?: string
  sold_date?: string
  last_insemination_date?: string
  insemination_count?: number
  notes?: string
  notes_mother?: string
  rp_animal?: string
  rp_mother?: string
  mother_weight?: number
  scrotal_circumference?: number
  insemination_round_id?: string
  insemination_identifier?: string
  last_event_id?: number
  last_event_time?: string
  snapshot_version?: number
  updated_at?: string
}

export interface DomainEvent {
  id: number
  event_id: string
  animal_id?: number
  animal_number: string
  event_type: string
  event_version: number
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  company_id: number
  user_id: string
  event_time: string
  created_at: string
}

export interface SnapshotStats {
  total_animals: number
  by_status: Record<string, number>
  by_gender: Record<string, number>
  weight: {
    average?: number
    minimum?: number
    maximum?: number
    count_with_weight: number
  }
  inseminations: {
    total: number
    animals_with_inseminations: number
  }
  company_id: number
}

// API Service Class
class ApiService {
  private baseURL: string
  private authToken: string | null = null

  constructor() {
    this.baseURL = API_BASE_URL
    console.log('API Service initialized with URL:', this.baseURL)
    console.log('Environment variables:', {
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      MODE: import.meta.env.MODE,
      DEV: import.meta.env.DEV,
      PROD: import.meta.env.PROD
    })
  }

  setAuthToken(token: string | null) {
    this.authToken = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    console.log(`API Request: ${options.method || 'GET'} ${url}`)
    console.log('Headers:', headers)
    console.log('Body:', options.body)

    const response = await fetch(url, {
      ...options,
      headers,
    })

    console.log(`API Response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API Error:', errorData)
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('API Response data:', data)
    return data
  }

  // Authentication
  async verifyToken(token: string): Promise<User> {
    return this.request<User>(`${API_ENDPOINTS.USERS}/verify-token`, {
      method: 'POST',
      body: JSON.stringify({ token })
    })
  }

  // Registrations - using export-multi-tenant endpoint
  async getRegistrations(limit: number = 100): Promise<{ registrations: Animal[], count: number }> {
    const response = await this.request<{ count: number, items: Animal[] }>(`${API_ENDPOINTS.REGISTRATIONS}?format=json`)
    const data = response.items || []
    // Limit the results to the requested limit
    const limitedData = data.slice(0, limit)
    return { registrations: limitedData, count: limitedData.length }
  }

  async registerAnimal(animal: RegisterBody): Promise<{ ok: boolean, id: number }> {
    return this.request<{ ok: boolean, id: number }>(API_ENDPOINTS.REGISTER, {
      method: 'POST',
      body: JSON.stringify(animal)
    })
  }

  async updateAnimal(animal: UpdateBody): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`${API_ENDPOINTS.REGISTER}/update`, {
      method: 'PUT',
      body: JSON.stringify(animal)
    })
  }

  async updateAnimalByNumber(animal: UpdateAnimalByNumberBody): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`${API_ENDPOINTS.REGISTER}/update-by-number`, {
      method: 'PUT',
      body: JSON.stringify(animal)
    })
  }

  async deleteAnimal(animalNumber: string, createdAt: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(API_ENDPOINTS.REGISTER, {
      method: 'DELETE',
      body: JSON.stringify({ animalNumber, createdAt })
    })
  }

  async getStats(): Promise<RegistrationStats> {
    // Get all data from export-multi-tenant and calculate stats
    const response = await this.request<{ count: number, items: Animal[] }>(`${API_ENDPOINTS.STATS}?format=json`)
    const data = response.items || []
    
    // Calculate stats from the data
    const totalAnimals = data.length
    const aliveAnimals = data.filter(animal => animal.status === 'ALIVE').length
    const deadAnimals = data.filter(animal => animal.status === 'DEAD').length
    const soldAnimals = data.filter(animal => animal.status === 'SOLD').length
    const maleAnimals = data.filter(animal => animal.gender === 'MALE').length
    const femaleAnimals = data.filter(animal => animal.gender === 'FEMALE').length
    
    // Calculate weight statistics
    const weights = data.filter(animal => animal.weight && animal.weight > 0).map(animal => animal.weight!)
    const avgWeight = weights.length > 0 ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : 0
    const minWeight = weights.length > 0 ? Math.min(...weights) : 0
    const maxWeight = weights.length > 0 ? Math.max(...weights) : 0
    
    return {
      totalAnimals,
      aliveAnimals,
      deadAnimals,
      soldAnimals,
      maleAnimals,
      femaleAnimals,
      avgWeight: Math.round(avgWeight * 100) / 100,
      minWeight,
      maxWeight
    }
  }

  async exportData(format: 'json' | 'csv' = 'json'): Promise<Blob | { count: number, items: Animal[] }> {
    const response = await fetch(`${this.baseURL}${API_ENDPOINTS.EXPORT}?format=${format}`, {
      headers: this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {}
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    if (format === 'csv') {
      return response.blob()
    }

    return response.json()
  }

  // Fetch insemination rounds for the company
  async getInseminationRounds(): Promise<InseminationRound[]> {
    return this.request<InseminationRound[]>('/inseminations-ids/')
  }

  // Create a new insemination round
  async createInseminationRound(body: InseminationRoundBody): Promise<{ id: number, message: string }> {
    return this.request<{ id: number, message: string }>('/inseminations-ids/', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  // Get inseminations for the company
  async getInseminations(limit: number = 100): Promise<{ inseminations: Insemination[], count: number }> {
    return this.request<{ inseminations: Insemination[], count: number }>(`/inseminations/?limit=${limit}`)
  }

  // Upload inseminations from file (CSV/XLSX)
  async uploadInseminations(file: File, inseminationRoundId: string, initialDate?: string, endDate?: string): Promise<InseminationUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('inseminationRoundId', inseminationRoundId)
    if (initialDate) formData.append('initialDate', initialDate)
    if (endDate) formData.append('endDate', endDate)

    const url = `${this.baseURL}/inseminations/upload`
    const headers: Record<string, string> = {}
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  }

  // Export inseminations to CSV
  async exportInseminations(inseminationRoundId?: string): Promise<Blob> {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (inseminationRoundId) {
      params.set('insemination_round_id', inseminationRoundId)
    }

    const url = `${this.baseURL}/inseminations/export?${params.toString()}`
    const headers: Record<string, string> = {}
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.blob()
  }

  // User Context
  async getUserContext(): Promise<{ user: User, company: Company | null }> {
    return this.request<{ user: User, company: Company | null }>(`${API_ENDPOINTS.USER_CONTEXT}/context`)
  }

  // Chatbot
  async askChatbot(question: string, history?: Array<{ user: string, bot: string }>): Promise<{
    final_answer: string
    history: Array<{ user: string, bot: string }>
    sql?: string
    error?: string
    question: string
    success: boolean
  }> {
    return this.request<{
      final_answer: string
      history: Array<{ user: string, bot: string }>
      sql?: string
      error?: string
      question: string
      success: boolean
    }>(`${API_ENDPOINTS.CHATBOT}/ask`, {
      method: 'POST',
      body: JSON.stringify({ question, history: history || [] })
    })
  }

  // ========================================
  // SNAPSHOTS & EVENTS (Event Sourcing)
  // Snapshots: Derived state for fast reads
  // Events: Immutable audit history
  // ========================================
  // TODO: Uncomment when ready for full event sourcing integration
  
  /*
  // Get all animal snapshots for the company
  async getAnimalSnapshots(
    limit: number = 100, 
    offset: number = 0, 
    status?: string
  ): Promise<{ snapshots: AnimalSnapshot[], count: number }> {
    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (status) params.set('status', status)
    
    return this.request<{ snapshots: AnimalSnapshot[], count: number }>(
      `/snapshots?${params.toString()}`
    )
  }

  // Get a single animal's snapshot
  async getAnimalSnapshot(animalId: number): Promise<AnimalSnapshot> {
    return this.request<AnimalSnapshot>(`/snapshots/${animalId}`)
  }

  // Get snapshot statistics
  async getSnapshotStats(): Promise<SnapshotStats> {
    return this.request<SnapshotStats>('/snapshots/stats')
  }
  */

  // Get event history for an animal (audit trail)
  async getAnimalHistory(animalId: number): Promise<{ events: DomainEvent[], count: number }> {
    return this.request<{ events: DomainEvent[], count: number }>(
      `/events/animal/${animalId}/history`
    )
  }

  // Get event history by animal number
  async getAnimalHistoryByNumber(animalNumber: string): Promise<{ events: DomainEvent[], count: number }> {
    return this.request<{ events: DomainEvent[], count: number }>(
      `/events/history/by-number/${encodeURIComponent(animalNumber)}`
    )
  }

  // Get animal snapshot by animal number
  async getAnimalSnapshotByNumber(animalNumber: string): Promise<AnimalSnapshot> {
    return this.request<AnimalSnapshot>(
      `/snapshots/by-number/${encodeURIComponent(animalNumber)}`
    )
  }

  // ========================================
  // SYNC FUNCTIONALITY - Clean Architecture
  // 1. Push pending records to server
  // 2. DELETE pending records (they're now on server)
  // 3. Fetch ALL data from server
  // 4. REPLACE server cache completely (never merge!)
  // ========================================

  async syncLocalRecords(): Promise<{ synced: number, cached: number }> {
    if (!this.authToken) {
      throw new Error('No authentication token available')
    }

    // Step 1: Get pending records
    const pendingRecords = await localStorageService.getPendingRecords()
    console.log('[Sync] Found pending records:', pendingRecords.length)

    let syncedCount = 0
    const syncedLocalIds: number[] = []

    // Step 2: Push each pending record to server
    for (const record of pendingRecords) {
      try {
        console.log('[Sync] Pushing record:', record.animal_number)
        
        const response = await fetch(`${this.baseURL}${API_ENDPOINTS.REGISTER}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`
          },
          body: JSON.stringify({
            animalNumber: record.animal_number,
            createdAt: record.createdAt,
            motherId: record.mother_id ?? null,
            fatherId: record.father_id ?? null,
            bornDate: record.born_date ?? null,
            weight: record.weight ?? null,
            gender: record.gender ?? null,
            animalType: record.animal_type ?? null,
            scrotalCircumference: record.scrotal_circumference ?? null,
            inseminationRoundId: record.insemination_round_id ?? null,
            status: record.status ?? null,
            color: record.color ?? null,
            notes: record.notes ?? null,
            notesMother: record.notes_mother ?? null,
            rpAnimal: record.rp_animal ?? null,
            rpMother: record.rp_mother ?? null,
            motherWeight: record.mother_weight ?? null,
            weaningWeight: record.weaning_weight ?? null
          })
        })

        if (response.ok) {
          syncedCount++
          syncedLocalIds.push(record.localId)
          console.log('[Sync] Successfully synced:', record.animal_number)
        } else {
          console.warn('[Sync] Failed to sync record:', record.animal_number, response.status)
        }
      } catch (error) {
        console.warn('[Sync] Network error for record:', record.animal_number, error)
      }
    }

    // Step 3: DELETE synced records from pending storage
    for (const localId of syncedLocalIds) {
      await localStorageService.removePendingRecord(localId)
    }
    console.log('[Sync] Removed synced records from pending:', syncedLocalIds.length)

    // Step 4: Fetch ALL data from server and REPLACE cache
    let cachedCount = 0
    try {
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.EXPORT}?format=json`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      })

      if (response.ok) {
        const serverData = await response.json()
        // REPLACE entire cache (never merge!)
        await localStorageService.setServerCache(serverData)
        cachedCount = serverData.items ? serverData.items.length : serverData.length
        console.log('[Sync] Replaced server cache:', cachedCount, 'records')
      }
    } catch (error) {
      console.warn('[Sync] Error fetching server data:', error)
    }

    return { synced: syncedCount, cached: cachedCount }
  }

  // Full refresh - fetch fresh data from server and replace cache
  async refreshData(): Promise<{ success: boolean, count: number }> {
    if (!this.authToken) {
      throw new Error('No authentication token available')
    }

    console.log('[Refresh] Fetching fresh data from server...')
    
    try {
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.EXPORT}?format=json`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const serverData = await response.json()
      // REPLACE entire cache
      await localStorageService.setServerCache(serverData)
      
      const count = serverData.items ? serverData.items.length : serverData.length
      console.log('[Refresh] Replaced server cache:', count, 'records')
      
      return { success: true, count }
    } catch (error) {
      console.error('[Refresh] Failed to refresh data:', error)
      throw error
    }
  }

  // Clear all cache and refresh from server
  async clearCacheAndRefresh(): Promise<{ success: boolean, count: number }> {
    console.log('[ClearCache] Clearing all local storage...')
    await localStorageService.clearAll()
    return await this.refreshData()
  }

  // ========================================
  // LOCAL STORAGE ACCESSORS
  // ========================================

  // Get pending count
  async getPendingCount(): Promise<number> {
    return await localStorageService.getPendingCount()
  }

  // Get all records for display (pending + cached)
  async getDisplayRecords(limit: number = 10): Promise<Animal[]> {
    return await localStorageService.getDisplayRecords(limit)
  }

  // Get all records (pending + cached)
  async getAllLocalRecords(): Promise<Animal[]> {
    return await localStorageService.getAllRecords()
  }

  // Get only cached server data
  async getCachedRecords(): Promise<Animal[]> {
    return await localStorageService.getServerCache()
  }

  // Add a pending record (offline registration)
  async addPendingRecord(record: Omit<Animal, 'id'>): Promise<PendingRecord> {
    return await localStorageService.addPendingRecord(record)
  }

  // Delete a pending record
  async deletePendingRecord(localId: number): Promise<void> {
    return await localStorageService.deletePendingRecord(localId)
  }

  // Get storage status
  getStorageStatus() {
    return localStorageService.getStorageStatus()
  }

  // Migrate legacy data (call once on app startup)
  async migrateLegacyData(): Promise<void> {
    return await localStorageService.migrateFromLegacy()
  }
}

export const apiService = new ApiService()

