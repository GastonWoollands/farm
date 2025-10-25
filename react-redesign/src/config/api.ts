// API Configuration
export const API_BASE_URL = 'http://127.0.0.1:8000'

// Firebase Configuration
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUh9T0UFdlwuXZ2rYEzik1REYW2BMGidc",
  authDomain: "farm-4d233.firebaseapp.com",
  projectId: "farm-4d233",
  storageBucket: "farm-4d233.firebasestorage.app",
  messagingSenderId: "81362761765",
  appId: "1:81362761765:web:2a786a669687c29b3867cc"
}

// API Endpoints
export const API_ENDPOINTS = {
  REGISTRATIONS: '/registrations',
  REGISTER: '/register',
  EXPORT: '/export-multi-tenant',
  STATS: '/stats',
  USERS: '/users',
  COMPANIES: '/companies',
  USER_CONTEXT: '/user-context'
} as const
