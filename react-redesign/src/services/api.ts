import { API_BASE_URL, API_ENDPOINTS } from '@/config/api'

// Types
export interface Animal {
  id: number
  animal_number: string
  rp_animal?: string
  mother_id?: string
  rp_mother?: string
  father_id?: string
  born_date?: string
  weight?: number
  mother_weight?: number
  gender?: string
  status: string
  color?: string
  notes?: string
  notes_mother?: string
  scrotal_circumference?: number
  insemination_round_id?: string
  created_at: string
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
  gender?: string
  status: string
  color?: string
  notes?: string
  notesMother?: string
  scrotalCircumference?: number
  inseminationRoundId?: string
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
  gender?: string
  status?: string
  color?: string
  notes?: string
  notesMother?: string
  scrotalCircumference?: number
  inseminationRoundId?: string
}

export interface RegistrationStats {
  total: number
  synced: number
  pending: number
  by_gender: Record<string, number>
  by_status: Record<string, number>
  by_color: Record<string, number>
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
  company_id: number
  name: string
  created_at: string
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

  // Registrations
  async getRegistrations(limit: number = 100): Promise<{ registrations: Animal[], count: number }> {
    return this.request<{ registrations: Animal[], count: number }>(`${API_ENDPOINTS.REGISTRATIONS}?limit=${limit}`)
  }

  async registerAnimal(animal: RegisterBody): Promise<{ ok: boolean, id: number }> {
    return this.request<{ ok: boolean, id: number }>(API_ENDPOINTS.REGISTER, {
      method: 'POST',
      body: JSON.stringify(animal)
    })
  }

  async updateAnimal(animal: UpdateBody): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`${API_ENDPOINTS.REGISTRATIONS}/register/update`, {
      method: 'PUT',
      body: JSON.stringify(animal)
    })
  }

  async deleteAnimal(animalNumber: string, createdAt: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`${API_ENDPOINTS.REGISTRATIONS}/register`, {
      method: 'DELETE',
      body: JSON.stringify({ animalNumber, createdAt })
    })
  }

  async getStats(): Promise<RegistrationStats> {
    return this.request<RegistrationStats>(`${API_ENDPOINTS.REGISTRATIONS}/stats`)
  }

  async exportData(format: 'json' | 'csv' = 'json'): Promise<Blob | { count: number, items: Animal[] }> {
    const response = await fetch(`${this.baseURL}${API_ENDPOINTS.REGISTRATIONS}/export-multi-tenant?format=${format}`, {
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

  // User Context
  async getUserContext(): Promise<{ user: User, company: Company | null }> {
    return this.request<{ user: User, company: Company | null }>(`${API_ENDPOINTS.USER_CONTEXT}/context`)
  }
}

export const apiService = new ApiService()
