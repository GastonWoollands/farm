import { initializeApp } from 'firebase/app'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
  onAuthStateChanged
} from 'firebase/auth'
import { FIREBASE_CONFIG } from '@/config/api'
import { apiService } from './api'

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG)
export const auth = getAuth(app)

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

class AuthService {
  private currentUser: AuthUser | null = null
  private listeners: ((user: AuthUser | null) => void)[] = []

  constructor() {
    // Listen to auth state changes
    onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        this.currentUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        }
        
        // Set auth token for API calls
        const token = await firebaseUser.getIdToken()
        apiService.setAuthToken(token)
      } else {
        this.currentUser = null
        apiService.setAuthToken(null)
      }
      
      // Notify listeners
      this.listeners.forEach(listener => listener(this.currentUser))
    })
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      
      // Get the token for API calls
      const token = await user.getIdToken()
      apiService.setAuthToken(token)
      
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign in')
    }
  }

  async signUp(email: string, password: string): Promise<AuthUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      
      // Get the token for API calls
      const token = await user.getIdToken()
      apiService.setAuthToken(token)
      
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create account')
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth)
      this.currentUser = null
      apiService.setAuthToken(null)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign out')
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to send password reset email')
    }
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }
}

export const authService = new AuthService()
