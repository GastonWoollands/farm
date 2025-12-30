import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  Target, 
  Settings, 
  Save, 
  RefreshCw,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Database,
  HardDrive
} from 'lucide-react'
import { Animal, RegistrationStats, apiService } from '@/services/api'
import { localStorageService } from '@/services/localStorage'
import { usePrefixes } from '@/contexts/PrefixesContext'

interface SettingsPageProps {
  animals: Animal[]
  stats: RegistrationStats
}

export function SettingsPage({ animals, stats }: SettingsPageProps) {
  // stats parameter is available for future use in system information
  // Suppress unused parameter warning
  void stats
  const [objectives, setObjectives] = useState({
    targetRegistrations: 200,
    targetWeight: 300,
    targetBirths: 100,
    targetMothers: 50
  })

  const { prefixes, updatePrefix } = usePrefixes()
  const [isLoading, setIsLoading] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [storageStatus, setStorageStatus] = useState({
    pendingCount: 0,
    cacheCount: 0,
    cacheTimestamp: null as string | null
  })

  // Load storage status on mount
  useEffect(() => {
    const status = localStorageService.getStorageStatus()
    setStorageStatus(status)
  }, [])

  // Handle clear cache and refresh
  const handleClearCache = async () => {
    if (!navigator.onLine) {
      alert('Debes estar conectado a internet para limpiar el caché y actualizar los datos.')
      return
    }

    if (storageStatus.pendingCount > 0) {
      const confirm = window.confirm(
        `Tienes ${storageStatus.pendingCount} registros pendientes de sincronizar. ` +
        'Se sincronizarán primero antes de limpiar el caché. ¿Continuar?'
      )
      if (!confirm) return
    }

    setIsClearingCache(true)
    try {
      // First sync pending records
      if (storageStatus.pendingCount > 0) {
        console.log('[Settings] Syncing pending records before clearing cache...')
        await apiService.syncLocalRecords()
      }

      // Clear cache and refresh from server
      console.log('[Settings] Clearing cache and refreshing...')
      await apiService.clearCacheAndRefresh()

      // Update storage status
      const newStatus = localStorageService.getStorageStatus()
      setStorageStatus(newStatus)

      alert('Caché limpiado y datos actualizados correctamente.')
    } catch (error) {
      console.error('[Settings] Failed to clear cache:', error)
      alert('Error al limpiar el caché. Por favor, intenta de nuevo.')
    } finally {
      setIsClearingCache(false)
    }
  }

  const handleObjectiveChange = (key: string, value: string) => {
    setObjectives(prev => ({
      ...prev,
      [key]: parseInt(value) || 0
    }))
  }


  const handleSave = async () => {
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      // Show success message
    }, 1000)
  }

  const handleExport = () => {
    // Simulate export functionality
    console.log('Exporting data...')
  }

  const handleImport = () => {
    // Simulate import functionality
    console.log('Importing data...')
  }

  const handleReset = () => {
    if (confirm('¿Estás seguro de que quieres resetear todos los datos? Esta acción no se puede deshacer.')) {
      console.log('Resetting data...')
    }
  }

  return (
    <div className="space-y-6">
      {/* Objectives Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Objetivos de Producción
          </CardTitle>
          <CardDescription>
            Configura tus metas anuales para el seguimiento de objetivos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="targetRegistrations">Registros Objetivo</Label>
              <Input
                id="targetRegistrations"
                type="number"
                value={objectives.targetRegistrations}
                onChange={(e) => handleObjectiveChange('targetRegistrations', e.target.value)}
                placeholder="200"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Número total de animales a registrar este año
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetWeight">Peso Objetivo (kg)</Label>
              <Input
                id="targetWeight"
                type="number"
                value={objectives.targetWeight}
                onChange={(e) => handleObjectiveChange('targetWeight', e.target.value)}
                placeholder="300"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Peso promedio objetivo para los animales
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetBirths">Nacimientos Objetivo</Label>
              <Input
                id="targetBirths"
                type="number"
                value={objectives.targetBirths}
                onChange={(e) => handleObjectiveChange('targetBirths', e.target.value)}
                placeholder="100"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Número de nacimientos esperados este año
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetMothers">Madres Objetivo</Label>
              <Input
                id="targetMothers"
                type="number"
                value={objectives.targetMothers}
                onChange={(e) => handleObjectiveChange('targetMothers', e.target.value)}
                placeholder="50"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Número de madres activas objetivo
              </p>
            </div>
          </div>

          <div className="flex justify-center sm:justify-end">
            <Button onClick={handleSave} disabled={isLoading} className="gap-2 w-full sm:w-auto">
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isLoading ? 'Guardando...' : 'Guardar Objetivos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prefixes Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración de Prefijos
          </CardTitle>
          <CardDescription>
            Configura los prefijos que se usarán al registrar nuevos animales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="animalPrefix">Prefijo ID Animal</Label>
              <Input
                id="animalPrefix"
                type="text"
                value={prefixes.animalPrefix}
                onChange={(e) => updatePrefix('animalPrefix', e.target.value)}
                placeholder="e.g., AC988"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Prefijo usado para nuevos registros de animales
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motherPrefix">Prefijo ID Madre</Label>
              <Input
                id="motherPrefix"
                type="text"
                value={prefixes.motherPrefix}
                onChange={(e) => updatePrefix('motherPrefix', e.target.value)}
                placeholder="e.g., AC988"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Prefijo usado para el campo Madre ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fatherPrefix">Prefijo ID Padre</Label>
              <Input
                id="fatherPrefix"
                type="text"
                value={prefixes.fatherPrefix}
                onChange={(e) => updatePrefix('fatherPrefix', e.target.value)}
                placeholder="e.g., REPASO"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Prefijo usado para el campo Padre ID (opcional)
              </p>
            </div>
          </div>

          <div className="flex justify-center sm:justify-end">
            <Button onClick={handleSave} disabled={isLoading} className="gap-2 w-full sm:w-auto">
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isLoading ? 'Guardando...' : 'Guardar Prefijos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Gestión de Datos
          </CardTitle>
          <CardDescription>
            Importa, exporta y gestiona los datos de tu cabaña
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4">
              <h4 className="font-medium">Exportar Datos</h4>
              <p className="text-sm text-muted-foreground">
                Descarga todos los datos de tu cabaña en formato CSV
              </p>
              <Button onClick={handleExport} className="w-full gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="sm:hidden">Exportar</span>
              </Button>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Importar Datos</h4>
              <p className="text-sm text-muted-foreground">
                Importa datos desde un archivo CSV
              </p>
              <Button onClick={handleImport} variant="outline" className="w-full gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Importar CSV</span>
                <span className="sm:hidden">Importar</span>
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="font-medium text-destructive">Zona de Peligro</h4>
            <p className="text-sm text-muted-foreground">
              Estas acciones son irreversibles. Úsalas con precaución.
            </p>
            
            <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h5 className="font-medium text-destructive">Resetear Todos los Datos</h5>
                  <p className="text-sm text-muted-foreground mt-1">
                    Elimina permanentemente todos los registros de animales y configuraciones.
                    Esta acción no se puede deshacer.
                  </p>
                  <Button 
                    onClick={handleReset}
                    variant="destructive" 
                    size="sm" 
                    className="mt-3 gap-2 w-full sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Resetear Datos</span>
                    <span className="sm:hidden">Resetear</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Gestión de Caché
          </CardTitle>
          <CardDescription>
            Administra los datos almacenados localmente en tu dispositivo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <HardDrive className="h-4 w-4" />
                Registros en Caché
              </div>
              <p className="text-2xl font-bold">{storageStatus.cacheCount}</p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <RefreshCw className="h-4 w-4" />
                Pendientes de Sync
              </div>
              <p className="text-2xl font-bold">
                {storageStatus.pendingCount}
                {storageStatus.pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Por sincronizar
                  </Badge>
                )}
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Database className="h-4 w-4" />
                Última Actualización
              </div>
              <p className="text-sm font-medium">
                {storageStatus.cacheTimestamp 
                  ? new Date(storageStatus.cacheTimestamp).toLocaleString('es-ES')
                  : 'Nunca'
                }
              </p>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1">
                <h4 className="font-medium">Limpiar Caché y Actualizar</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Elimina todos los datos almacenados localmente y descarga una copia fresca del servidor.
                  Esto soluciona problemas de datos duplicados o desincronizados.
                </p>
              </div>
              <Button 
                onClick={handleClearCache}
                disabled={isClearingCache || !navigator.onLine}
                variant="outline"
                className="gap-2 w-full sm:w-auto flex-shrink-0"
              >
                {isClearingCache ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isClearingCache ? 'Limpiando...' : 'Limpiar Caché'}
              </Button>
            </div>
            
            {!navigator.onLine && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Debes estar conectado a internet para limpiar el caché.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Sistema</CardTitle>
          <CardDescription>
            Detalles sobre la configuración actual de la aplicación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label>Versión de la Aplicación</Label>
              <p className="text-sm text-muted-foreground">v1.1.0</p>
            </div>
            
            <div className="space-y-2">
              <Label>Última Sincronización</Label>
              <p className="text-sm text-muted-foreground">
                {storageStatus.cacheTimestamp 
                  ? new Date(storageStatus.cacheTimestamp).toLocaleString('es-ES')
                  : 'Nunca'
                }
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Estado de Conexión</Label>
              <Badge variant={navigator.onLine ? "default" : "secondary"} className="gap-1 w-fit">
                <div className={`w-2 h-2 rounded-full ${navigator.onLine ? 'bg-green-500 dark:bg-green-400' : 'bg-gray-400'}`} />
                {navigator.onLine ? 'Conectado' : 'Sin conexión'}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <Label>Registros Totales</Label>
              <p className="text-sm text-muted-foreground">{animals.length} animales</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
