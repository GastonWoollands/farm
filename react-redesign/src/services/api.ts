import { API_BASE_URL, API_ENDPOINTS } from '@/config/api'
import { localStorageService, LocalRecord } from './localStorage'

// Types
export interface Animal {
  id?: number  // Optional since export-multi-tenant doesn't return id
  animal_number: string
  born_date?: string
  mother_id?: string
  father_id?: string
  weight?: number
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
  motherWeight?: number
  weaningWeight?: number
  gender?: string
  status?: string
  color?: string
  notes?: string
  notesMother?: string
  scrotalCircumference?: number
  inseminationRoundId?: string
}

export interface RegistrationStats {
  totalAnimals: number
  aliveAnimals: number
  deadAnimals: number
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

  // Sync functionality - replicates original frontend behavior
  async syncLocalRecords(): Promise<{ synced: number, imported: number }> {
    if (!this.authToken) {
      throw new Error('No authentication token available')
    }

    const unsyncedRecords = await localStorageService.getRecords({ unsyncedOnly: true })
    console.log('Found unsynced records:', unsyncedRecords.length)

    let syncedCount = 0

    // Sync each unsynced record
    for (const record of unsyncedRecords) {
      try {
        let response: Response

        if (record.backendId) {
          // This is an edited record - use PUT
          console.log('Using PUT for edited record:', record.backendId)
          response = await fetch(`${this.baseURL}/register/${record.backendId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({
              animalNumber: record.animal_number,
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
        } else {
          // This is a new record - use POST
          console.log('Using POST for new record')
          response = await fetch(`${this.baseURL}${API_ENDPOINTS.REGISTER}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({
              animalNumber: record.animal_number,
              createdAt: record.created_at,
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
        }

        if (response.ok) {
          if (record.backendId) {
            // For updates, just mark as synced
            await localStorageService.markAsSynced(record.id)
          } else {
            // For new records, get the backend ID from the response
            const responseData = await response.json()
            const backendId = responseData?.id
            if (backendId) {
              await localStorageService.markAsSynced(record.id, backendId)
            } else {
              await localStorageService.markAsSynced(record.id)
            }
          }
          syncedCount++
        } else {
          console.warn('Sync failed for record', record.id, response.status, response.statusText)
        }
      } catch (error) {
        console.warn('Network error during sync for record', record.id, error)
      }
    }

    // After pushing, pull latest records from server
    let importedCount = 0
    try {
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.EXPORT}?format=json`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      })

      if (response.ok) {
        const serverData = await response.json()
        await localStorageService.importFromServer(serverData)
        importedCount = serverData.items ? serverData.items.length : serverData.length
        console.log('Imported from server:', importedCount)
      }
    } catch (error) {
      console.warn('Error importing from server:', error)
    }

    return { synced: syncedCount, imported: importedCount }
  }

  // Get pending count from local storage
  async getPendingCount(): Promise<number> {
    return await localStorageService.getPendingCount()
  }

  // Get display records (unsynced first, then last 10 synced)
  async getDisplayRecords(limit: number = 10): Promise<LocalRecord[]> {
    return await localStorageService.getDisplayRecords(limit)
  }

  // Add local record (replicates original frontend behavior)
  async addLocalRecord(record: Omit<Animal, 'id'>): Promise<LocalRecord> {
    return await localStorageService.addRecord(record)
  }

  // Delete local record
  async deleteLocalRecord(id: number): Promise<void> {
    return await localStorageService.deleteRecord(id)
  }
}

export const apiService = new ApiService()
