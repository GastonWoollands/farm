// API Configuration - using same env var name as backend
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://farm-production-d087.up.railway.app'

// Firebase Configuration - using same structure as original frontend
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUh9T0UFdlwuXZ2rYEzik1REYW2BMGidc",
  authDomain: "farm-4d233.firebaseapp.com",
  projectId: "farm-4d233",
  storageBucket: "farm-4d233.firebasestorage.app",
  messagingSenderId: "81362761765",
  appId: "1:81361761765:web:2a786a669687c29b3867cc"
}

// API Endpoints - using same endpoints as working old version
export const API_ENDPOINTS = {
  REGISTRATIONS: '/export-multi-tenant',  // Use export-multi-tenant for data loading
  REGISTER: '/register',                  // Use legacy register endpoint
  EXPORT: '/export-multi-tenant',         // Use export-multi-tenant for export
  STATS: '/export-multi-tenant',          // Use export-multi-tenant for stats (will calculate from data)
  USERS: '/users',
  COMPANIES: '/companies',
  USER_CONTEXT: '/user-context'
} as const