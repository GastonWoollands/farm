import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  Users,
  Search,
  Settings,
  Wifi,
  WifiOff,
  LogOut,
  Building2,
  Sun,
  Moon,
  Download,
  RefreshCw,
  History,
} from 'lucide-react'

// Import page components
import { AuthScreen } from './components/AuthScreen'
import { MetricsPage } from './components/MetricsPage'
import { AnimalsPage } from './components/AnimalsPage'
import { SearchPage } from './components/SearchPage'
import { SettingsPage } from './components/SettingsPage'
import { Chatbot } from './components/Chatbot'
import { ClinicalHistoryPage } from './components/ClinicalHistoryPage'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { PrefixesProvider } from './contexts/PrefixesContext'
import { authService, AuthUser } from './services/auth'
import { apiService, Animal, RegistrationStats } from './services/api'
import { localStorageService } from './services/localStorage'
import { register, registerPWAInstallPrompt, skipWaitingAndReload } from './utils/serviceWorker'

// Helper function to calculate stats from local records (works offline)
function calculateStatsFromRecords(records: Animal[]): RegistrationStats {
  const totalAnimals = records.length
  const aliveAnimals = records.filter(animal => animal.status === 'ALIVE').length
  const deadAnimals = records.filter(animal => animal.status === 'DEAD').length
  const maleAnimals = records.filter(animal => animal.gender === 'MALE').length
  const femaleAnimals = records.filter(animal => animal.gender === 'FEMALE').length
  
  const weights = records
    .filter(animal => animal.weight && animal.weight > 0)
    .map(animal => animal.weight!)
  
  const avgWeight = weights.length > 0 
    ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length 
    : 0
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

// Types
interface AppState {
  user: AuthUser | null
  isOnline: boolean
  pendingCount: number
  currentCompany: string
  currentCompanyId: number | null
  animals: Animal[] // All animals for metrics
  displayAnimals: Animal[] // Recent animals for UI display
  stats: RegistrationStats | null
  updateAvailable: boolean
  searchTerm?: string // For pre-filling search when navigating from duplicate dialog
  selectedAnimalNumber?: string // For navigating to history tab with a selected animal
}

function AppContent() {
  const [appState, setAppState] = useState<AppState>({
    user: null,
    isOnline: false,
    pendingCount: 0,
    currentCompany: 'Personal Data',
    currentCompanyId: null,
    animals: [],
    displayAnimals: [],
    stats: null,
    updateAvailable: false,
    searchTerm: undefined
  })

  const [activeTab, setActiveTab] = useState('metrics')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [backendError] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()

  // Data loading with clean cache architecture
  // ONLINE: Server is source of truth - fetch from API
  // OFFLINE: Show cached data + pending records
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Migrate legacy data format (one-time migration)
        await apiService.migrateLegacyData()
        
        // Listen to auth state changes
        const unsubscribe = authService.onAuthStateChange(async (user) => {
          if (user) {
            setAppState(prev => ({ ...prev, user }))
            
            const isOnline = navigator.onLine
            console.log('[App] User authenticated, online:', isOnline)
            
            if (isOnline) {
              // ========================================
              // ONLINE: Server is the source of truth
              // ========================================
              console.log('[App] Online - fetching from server...')
              
              try {
                // Load user context
                const context = await apiService.getUserContext()
                setAppState(prev => ({
                  ...prev,
                  currentCompany: context.company?.name || 'Personal Data',
                  currentCompanyId: context.company?.id || context.company?.company_id || null
                }))
                
                // Sync pending records first (push to server, delete from pending)
                const pendingCount = await apiService.getPendingCount()
                if (pendingCount > 0) {
                  console.log('[App] Syncing', pendingCount, 'pending records...')
                  await apiService.syncLocalRecords()
                }
                
                // Fetch fresh data from server
                const allRecords = await apiService.getRegistrations(1000)
                const statsData = await apiService.getStats()
                
                // Update cache with server data
                await localStorageService.setServerCache({ items: allRecords.registrations })
                
                // Get display records (pending + cached)
                const displayRecords = await apiService.getDisplayRecords(10)
                const updatedPendingCount = await apiService.getPendingCount()
                
                setAppState(prev => ({
                  ...prev,
                  animals: allRecords.registrations,
                  displayAnimals: displayRecords,
                  stats: statsData,
                  pendingCount: updatedPendingCount
                }))
                
                console.log('[App] Server data loaded:', allRecords.registrations.length, 'records')
              } catch (error) {
                console.warn('[App] Server fetch failed, falling back to cache:', error)
                // Fall back to cached data
                await loadFromCache()
              }
            } else {
              // ========================================
              // OFFLINE: Load from cache + pending
              // ========================================
              console.log('[App] Offline - loading from cache...')
              await loadFromCache()
            }
            
            setIsLoading(false)
          } else {
            // User not logged in
            setAppState(prev => ({
              ...prev,
              user: null,
              currentCompany: 'Personal Data',
              currentCompanyId: null,
              animals: [],
              displayAnimals: [],
              stats: null,
              pendingCount: 0
            }))
            setIsLoading(false)
          }
        })
        
        // Helper to load from cache
        async function loadFromCache() {
          try {
            const allRecords = await apiService.getAllLocalRecords()
            const displayRecords = await apiService.getDisplayRecords(10)
            const pendingCount = await apiService.getPendingCount()
            const stats = calculateStatsFromRecords(allRecords)
            
            setAppState(prev => ({
              ...prev,
              animals: allRecords,
              displayAnimals: displayRecords,
              stats,
              pendingCount
            }))
            
            console.log('[App] Loaded from cache:', allRecords.length, 'records,', pendingCount, 'pending')
          } catch (error) {
            console.error('[App] Failed to load from cache:', error)
          }
        }

        // Check online status and auto-sync when coming back online
        const handleOnlineStatusChange = async () => {
          const isNowOnline = navigator.onLine
          setAppState(prev => ({ ...prev, isOnline: isNowOnline }))
          
          // Auto-sync when coming back online
          if (isNowOnline) {
            console.log('[App] Connection restored - auto-syncing...')
            try {
              // Sync pending records
              const pendingCount = await apiService.getPendingCount()
              if (pendingCount > 0) {
                console.log('[App] Auto-syncing', pendingCount, 'pending records...')
                await apiService.syncLocalRecords()
              }
              
              // Refresh data from server
              const allRecords = await apiService.getRegistrations(1000)
              const statsData = await apiService.getStats()
              
              // Update cache with server data
              await localStorageService.setServerCache({ items: allRecords.registrations })
              
              // Get display records
              const displayRecords = await apiService.getDisplayRecords(10)
              const updatedPendingCount = await apiService.getPendingCount()
              
              setAppState(prev => ({
                ...prev,
                animals: allRecords.registrations,
                displayAnimals: displayRecords,
                stats: statsData,
                pendingCount: updatedPendingCount
              }))
              
              console.log('[App] Auto-sync completed:', allRecords.registrations.length, 'records')
            } catch (error) {
              console.warn('[App] Auto-sync failed:', error)
            }
          }
        }

        window.addEventListener('online', handleOnlineStatusChange)
        window.addEventListener('offline', () => {
          setAppState(prev => ({ ...prev, isOnline: false }))
        })
        setAppState(prev => ({ ...prev, isOnline: navigator.onLine }))

        return () => {
          unsubscribe()
          window.removeEventListener('online', handleOnlineStatusChange)
          window.removeEventListener('offline', () => {
            setAppState(prev => ({ ...prev, isOnline: false }))
          })
        }
      } catch (error) {
        console.error('Error initializing app:', error)
        setIsLoading(false)
      }
    }

    initializeApp()
    
    // Register service worker for PWA
    register({
      onNeedRefresh: () => {
        console.log('[PWA] New version available! Showing update prompt...')
        setAppState(prev => ({ ...prev, updateAvailable: true }))
      },
      onOfflineReady: () => {
        console.log('[PWA] App is ready to work offline!')
      },
      onRegistered: (registration) => {
        console.log('[PWA] Service Worker registered:', registration)
      },
      onRegisterError: (error) => {
        console.error('[PWA] Registration error:', error)
      }
    })
    
    // Register PWA install prompt
    const installPrompt = registerPWAInstallPrompt()
    console.log('PWA install prompt registered:', installPrompt)
  }, [])

  const handleSignOut = async () => {
    try {
      await authService.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  // Refresh data from server (clears cache and gets fresh data)
  const handleRefresh = async () => {
    if (!navigator.onLine) {
      console.warn('[Refresh] Cannot refresh while offline')
      return
    }

    setIsRefreshing(true)
    try {
      console.log('[Refresh] Syncing and refreshing data...')
      
      // First sync any pending records
      const pendingCount = await apiService.getPendingCount()
      if (pendingCount > 0) {
        console.log('[Refresh] Syncing', pendingCount, 'pending records first...')
        await apiService.syncLocalRecords()
      }
      
      // Fetch fresh data from server and update cache
      const allRecords = await apiService.getRegistrations(1000)
      const statsData = await apiService.getStats()
      
      // Replace cache with fresh server data
      await localStorageService.setServerCache({ items: allRecords.registrations })
      
      // Get display records
      const displayRecords = await apiService.getDisplayRecords(10)
      const updatedPendingCount = await apiService.getPendingCount()
      
      setAppState(prev => ({
        ...prev,
        animals: allRecords.registrations,
        displayAnimals: displayRecords,
        stats: statsData,
        pendingCount: updatedPendingCount
      }))
      
      console.log('[Refresh] Data refresh completed:', allRecords.registrations.length, 'records')
    } catch (error) {
      console.error('[Refresh] Failed to refresh data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  // Show auth screen if not logged in
  if (!appState.user) {
    return <AuthScreen onAuthSuccess={(user) => setAppState(prev => ({ ...prev, user }))} />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Update Available Banner */}
      {appState.updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva versión disponible.</span>
              <span className="sm:hidden">¡Nueva versión!</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                skipWaitingAndReload()
              }}
              className="gap-1 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Actualizar ahora
            </Button>
          </div>
        </div>
      )}
      
      {/* Header - Mobile responsive with centered title */}
      <header className={`sticky ${appState.updateAvailable ? 'top-10' : 'top-0'} z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60`}>
        <div className="container mx-auto px-4">
          {/* Mobile Layout */}
          <div className="flex flex-col space-y-3 py-4 md:hidden">
            {/* Top row - Status and actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={appState.isOnline ? "default" : "secondary"} className="gap-1 text-xs">
                  {appState.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {appState.isOnline ? 'Online' : 'Offline'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="text-muted-foreground hover:text-foreground p-2"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
                {/* Refresh button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={!appState.isOnline || isRefreshing}
                  className="text-muted-foreground hover:text-foreground p-2"
                  title="Actualizar datos"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Cerrar
              </Button>
            </div>
            
            {/* Centered title and company */}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-xl font-bold tracking-tight">
                TAG
                {appState.pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {appState.pendingCount}
                  </Badge>
                )}
              </h1>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span>{appState.currentCompany}</span>
              </div>
            </div>
            
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex h-16 items-center justify-between">
            {/* Left side - Status indicators */}
            <div className="flex items-center gap-3">
              <Badge variant={appState.isOnline ? "default" : "secondary"} className="gap-1">
                {appState.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {appState.isOnline ? 'Online' : 'Offline'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="text-muted-foreground hover:text-foreground"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
              {/* Refresh button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={!appState.isOnline || isRefreshing}
                className="text-muted-foreground hover:text-foreground gap-1"
                title="Actualizar datos desde el servidor"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden lg:inline">{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
              </Button>
            </div>

            {/* Center - Title and company info */}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                TAG
                {appState.pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {appState.pendingCount}
                  </Badge>
                )}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{appState.currentCompany}</span>
              </div>
            </div>

            {/* Right side - Sign out */}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {backendError && (
          <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Backend Issue:</strong> {backendError}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Navigation - Clean tab design */}
          <TabsList className="grid w-full grid-cols-5 mb-8">
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Métricas</span>
            </TabsTrigger>
            <TabsTrigger value="animals" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Animales</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Historia</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configuración</span>
            </TabsTrigger>
          </TabsList>

          {/* Page content */}
          <TabsContent value="metrics" className="mt-0">
            <MetricsPage animals={appState.animals} stats={appState.stats || { 
              totalAnimals: 0, 
              aliveAnimals: 0, 
              deadAnimals: 0, 
              maleAnimals: 0, 
              femaleAnimals: 0, 
              avgWeight: 0, 
              minWeight: 0, 
              maxWeight: 0 
            }} />
          </TabsContent>

          <TabsContent value="animals" className="mt-0">
            <AnimalsPage 
              animals={appState.displayAnimals}
              allAnimals={appState.animals}
              onAnimalsChange={(animals) => setAppState(prev => ({ ...prev, displayAnimals: animals }))}
              onStatsChange={async () => {
                try {
                  const stats = await apiService.getStats()
                  setAppState(prev => ({ 
                    ...prev, 
                    stats, 
                    pendingCount: 0 // Not available in new stats structure 
                  }))
                } catch (error) {
                  console.error('Error refreshing stats:', error)
                }
              }}
              onNavigateToSearch={(searchTerm) => {
                // Switch to search tab and pass search term to pre-fill search input
                setActiveTab('search')
                setAppState(prev => ({ ...prev, searchTerm }))
              }}
              onNavigateToHistory={(animalNumber) => {
                // Switch to history tab with selected animal
                setActiveTab('history')
                setAppState(prev => ({ ...prev, selectedAnimalNumber: animalNumber }))
              }}
            />
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <SearchPage 
              animals={appState.animals} 
              onAnimalsChange={(animals) => setAppState(prev => ({ ...prev, animals }))}
              initialSearchTerm={appState.searchTerm}
              onNavigateToHistory={(animalNumber) => {
                // Switch to history tab with selected animal
                setActiveTab('history')
                setAppState(prev => ({ ...prev, selectedAnimalNumber: animalNumber }))
              }}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <ClinicalHistoryPage
              allAnimals={appState.animals}
              selectedAnimalNumber={appState.selectedAnimalNumber}
              onAnimalUpdated={(updated: Animal) => {
                setAppState(prev => ({
                  ...prev,
                  animals: prev.animals.map(a =>
                    a.animal_number === updated.animal_number ? { ...a, ...updated } : a
                  ),
                }))
              }}
              onSelectAnimal={(animalNumber: string) => {
                setAppState(prev => ({ ...prev, selectedAnimalNumber: animalNumber }))
              }}
              onBackToSearch={(animalNumber?: string) => {
                setActiveTab('search')
                if (animalNumber) {
                  setAppState(prev => ({ ...prev, searchTerm: animalNumber }))
                }
              }}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsPage animals={appState.animals} stats={appState.stats || { totalAnimals: 0, aliveAnimals: 0, deadAnimals: 0, maleAnimals: 0, femaleAnimals: 0, avgWeight: 0, minWeight: 0, maxWeight: 0 }} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer - Minimal status info */}
      <footer className="border-t bg-muted/50 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <span>🐄 Counting cows • Built by GW</span>
        </div>
      </footer>

      {/* Chatbot */}
      <Chatbot companyId={appState.currentCompanyId} />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <PrefixesProvider>
        <AppContent />
      </PrefixesProvider>
    </ThemeProvider>
  )
}

export default App
