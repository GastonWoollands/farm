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
  Moon
} from 'lucide-react'

// Import page components
import { AuthScreen } from './components/AuthScreen'
import { MetricsPage } from './components/MetricsPage'
import { AnimalsPage } from './components/AnimalsPage'
import { SearchPage } from './components/SearchPage'
import { SettingsPage } from './components/SettingsPage'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { authService, AuthUser } from './services/auth'
import { apiService, Animal, RegistrationStats } from './services/api'

// Types
interface AppState {
  user: AuthUser | null
  isOnline: boolean
  pendingCount: number
  currentCompany: string
  animals: Animal[]
  stats: RegistrationStats | null
}

function AppContent() {
  const [appState, setAppState] = useState<AppState>({
    user: null,
    isOnline: false,
    pendingCount: 0,
    currentCompany: 'Personal Data',
    animals: [],
    stats: null
  })

  const [activeTab, setActiveTab] = useState('metrics')
  const [isLoading, setIsLoading] = useState(true)
  const [backendError] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()

  // Real authentication and data loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Listen to auth state changes
        const unsubscribe = authService.onAuthStateChange(async (user) => {
          if (user) {
            setAppState(prev => ({ ...prev, user }))
            
            // Load user context and data
            try {
              console.log('Loading user context...')
              const context = await apiService.getUserContext()
              console.log('User context loaded:', context)
              
              setAppState(prev => ({
                ...prev,
                currentCompany: context.company?.name || 'Personal Data'
              }))
              
              // Load local records (unsynced first, then last 10 synced)
              try {
                console.log('Loading local records...')
                const localRecords = await apiService.getDisplayRecords(5)
                console.log('Local records loaded:', localRecords)
                
                setAppState(prev => ({
                  ...prev,
                  animals: localRecords
                }))
              } catch (localError) {
                console.warn('Could not load local records:', localError)
                setAppState(prev => ({
                  ...prev,
                  animals: []
                }))
              }
              
              // Get pending count and load stats
              try {
                console.log('Getting pending count...')
                const pendingCount = await apiService.getPendingCount()
                console.log('Pending count:', pendingCount)
                
                const statsData = await apiService.getStats()
                console.log('Stats data loaded:', statsData)
                
                setAppState(prev => ({
                  ...prev,
                  stats: statsData,
                  pendingCount
                }))
              } catch (statsError) {
                console.warn('Could not load stats data:', statsError)
                setAppState(prev => ({
                  ...prev,
                  stats: null,
                  pendingCount: 0
                }))
              }

              // Trigger sync in background
              try {
                console.log('Starting background sync...')
                const syncResult = await apiService.syncLocalRecords()
                console.log('Sync completed:', syncResult)
                
                // Reload data after sync
                const updatedRecords = await apiService.getDisplayRecords(10)
                const updatedPendingCount = await apiService.getPendingCount()
                
                setAppState(prev => ({
                  ...prev,
                  animals: updatedRecords,
                  pendingCount: updatedPendingCount
                }))
              } catch (syncError) {
                console.warn('Sync failed:', syncError)
              }
            } catch (error) {
              console.error('Error loading user context:', error)
              console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
              })
              // Set default values if API fails
              setAppState(prev => ({
                ...prev,
                currentCompany: 'Personal Data',
                animals: [],
                stats: null,
                pendingCount: 0
              }))
            }
          } else {
            setAppState(prev => ({
              ...prev,
              user: null,
              currentCompany: 'Personal Data',
              animals: [],
              stats: null,
              pendingCount: 0
            }))
          }
          setIsLoading(false)
        })

        // Check online status
        const updateOnlineStatus = () => {
          setAppState(prev => ({ ...prev, isOnline: navigator.onLine }))
        }

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    updateOnlineStatus()

        return () => {
          unsubscribe()
          window.removeEventListener('online', updateOnlineStatus)
          window.removeEventListener('offline', updateOnlineStatus)
        }
      } catch (error) {
        console.error('Error initializing app:', error)
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [])

  const handleSignOut = async () => {
    try {
      await authService.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
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
      {/* Header - Mobile responsive with centered title */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
                LiveStock
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
            </div>

            {/* Center - Title and company info */}
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                LiveStock
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
          <TabsList className="grid w-full grid-cols-4 mb-8">
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
              animals={appState.animals}
              onAnimalsChange={(animals) => setAppState(prev => ({ ...prev, animals }))}
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
            />
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <SearchPage animals={appState.animals} onAnimalsChange={(animals) => setAppState(prev => ({ ...prev, animals }))} />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsPage />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer - Minimal status info */}
      <footer className="border-t bg-muted/50 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <span>Status: Idle</span>
          <span className="mx-2">•</span>
          <span>API: {import.meta.env.VITE_API_BASE_URL || 'localhost:8000'}</span>
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
