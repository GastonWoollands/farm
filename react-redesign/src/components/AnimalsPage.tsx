import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  Download, 
  Settings, 
  ChevronDown, 
  ChevronUp,
  Users,
  Clock,
  CheckCircle,
  Edit,
  Trash2,
  Upload,
  History
} from 'lucide-react'
import { formatDate, getGenderName } from '@/lib/utils'
import { apiService, Animal, RegisterBody, InseminationRound } from '@/services/api'
import { localStorageService } from '@/services/localStorage'
import { usePrefixes } from '@/contexts/PrefixesContext'
import { useEffect } from 'react'
import { InseminationsUploadDialog } from './InseminationsUploadDialog'
import { AnimalHistoryDialog } from './AnimalHistoryDialog'
import { DuplicateAnimalDialog } from './DuplicateAnimalDialog'


interface AnimalsPageProps {
  animals: Animal[]
  allAnimals: Animal[] // All animals for duplicate checking
  onAnimalsChange: (animals: Animal[]) => void
  onStatsChange: () => void
  onNavigateToSearch?: (searchTerm: string) => void
  onNavigateToHistory?: (animalNumber: string) => void
}

export function AnimalsPage({ animals, allAnimals, onAnimalsChange, onStatsChange, onNavigateToSearch, onNavigateToHistory }: AnimalsPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isUploadingInseminations, setIsUploadingInseminations] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [selectedAnimalForHistory, setSelectedAnimalForHistory] = useState<Animal | null>(null)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [duplicateAnimal, setDuplicateAnimal] = useState<Animal | null>(null)
  const { prefixes } = usePrefixes()
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(false)
  const [inseminationRounds, setInseminationRounds] = useState<InseminationRound[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<string>('all')
  
  // Special prefixes that bypass duplicate checking
  const SPECIAL_PREFIXES = ['TEMP-', 'UNKNOWN-', 'SIN-ID-', 'SINID-']
  const [formData, setFormData] = useState({
    animalNumber: prefixes.animalPrefix,
    animalIdv: '',
    rpAnimal: '',
    motherId: prefixes.motherPrefix,
    rpMother: '',
    fatherId: prefixes.fatherPrefix,
    bornDate: '',
    weight: '',
    motherWeight: '',
    weaningWeight: '',
    gender: '',
    status: 'ALIVE',
    color: '',
    notes: '',
    notesMother: '',
    scrotalCircumference: '',
    inseminationRoundId: '',
    deathDate: '',
    soldDate: ''
  })

  // Fetch insemination rounds
  const fetchInseminationRounds = async () => {
    try {
      const rounds = await apiService.getInseminationRounds()
      setInseminationRounds(rounds)
    } catch (error) {
      console.error('Error fetching insemination rounds:', error)
    }
  }

  // Fetch insemination rounds on mount
  useEffect(() => {
    fetchInseminationRounds()
  }, [])

  const totalAnimals = animals.length
  // Check for localId to identify pending records (new architecture)
  const pendingAnimals = animals.filter(a => 'localId' in a && (a as any).localId !== undefined).length
  const syncedAnimals = totalAnimals - pendingAnimals

  // Check for duplicate animal numbers against ALL animals (not just displayed ones)
  const checkForDuplicate = (animalNumber: string): Animal | null => {
    if (!animalNumber) return null
    
    // Skip check if animal_number has special prefix
    const hasSpecialPrefix = SPECIAL_PREFIXES.some(prefix => 
      animalNumber.toUpperCase().startsWith(prefix)
    )
    if (hasSpecialPrefix) return null
    
    // Check if animal_number already exists in ALL animals list (case-insensitive)
    // Use allAnimals (complete list) instead of animals (display subset)
    return allAnimals.find(a => 
      a.animal_number?.toUpperCase() === animalNumber.toUpperCase()
    ) || null
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Check for duplicate before proceeding
    const existing = checkForDuplicate(formData.animalNumber)
    if (existing) {
      setDuplicateAnimal(existing)
      setDuplicateDialogOpen(true)
      return  // Stop here, show dialog instead
    }

    // Continue with registration
    await performRegistration()
  }

  // Extracted registration logic to be reusable
  const performRegistration = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const registerData: RegisterBody = {
        animalNumber: formData.animalNumber,
        animalIdv: formData.animalIdv || undefined,
        rpAnimal: formData.rpAnimal || undefined,
        motherId: formData.motherId || undefined,
        rpMother: formData.rpMother || undefined,
        fatherId: formData.fatherId || undefined,
        bornDate: formData.bornDate || undefined,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        motherWeight: formData.motherWeight ? parseFloat(formData.motherWeight) : undefined,
        weaningWeight: formData.weaningWeight ? parseFloat(formData.weaningWeight) : undefined,
        gender: formData.gender || undefined,
        status: formData.status,
        color: formData.color || undefined,
        notes: formData.notes || undefined,
        notesMother: formData.notesMother || undefined,
        scrotalCircumference: formData.scrotalCircumference ? parseFloat(formData.scrotalCircumference) : undefined,
        inseminationRoundId: formData.inseminationRoundId || undefined,
        deathDate: formData.deathDate || undefined,
        soldDate: formData.soldDate || undefined
      }

      // Add to local storage (replicates original frontend behavior)
      const animalData: Omit<Animal, 'id'> = {
        animal_number: registerData.animalNumber,
        animal_idv: registerData.animalIdv,
        born_date: registerData.bornDate,
        mother_id: registerData.motherId,
        father_id: registerData.fatherId,
        weight: registerData.weight,
        gender: registerData.gender,
        animal_type: registerData.animalType,
        status: registerData.status,
        color: registerData.color,
        notes: registerData.notes,
        notes_mother: registerData.notesMother,
        created_at: new Date().toISOString(),
        insemination_round_id: registerData.inseminationRoundId,
        insemination_identifier: registerData.inseminationIdentifier,
        scrotal_circumference: registerData.scrotalCircumference,
        rp_animal: registerData.rpAnimal,
        rp_mother: registerData.rpMother,
        mother_weight: registerData.motherWeight,
        weaning_weight: registerData.weaningWeight
      }
      await apiService.addPendingRecord(animalData)
      
      // Trigger sync immediately if online (fixes "pendiente" staying unsynced issue)
      if (navigator.onLine) {
        try {
          console.log('[Registration] Online - syncing immediately...')
          await apiService.syncLocalRecords()
          console.log('[Registration] Sync completed successfully')
        } catch (syncError) {
          console.warn('[Registration] Sync failed, will retry later:', syncError)
          // Don't throw - record is safely in pending storage, will sync later
        }
      }
      
      // Refresh local data (will show synced status if sync succeeded)
      const updatedAnimals = await apiService.getDisplayRecords(10)
      onAnimalsChange(updatedAnimals)
      
      // Update stats
      onStatsChange()
      
      // Reset form
      setFormData({
        animalNumber: prefixes.animalPrefix,
        animalIdv: '',
        rpAnimal: '',
        motherId: prefixes.motherPrefix,
        rpMother: '',
        fatherId: prefixes.fatherPrefix,
        bornDate: '',
        weight: '',
        motherWeight: '',
        weaningWeight: '',
        gender: '',
        status: 'ALIVE',
        color: '',
        notes: '',
        notesMother: '',
        scrotalCircumference: '',
        inseminationRoundId: '',
        deathDate: '',
        soldDate: ''
      })
      setIsRegistering(false)
    } catch (err: any) {
      setError(err.message || 'Error al registrar el animal')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (animal: Animal) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este animal?')) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Check if this is a pending (unsynced) record
      const isPending = 'localId' in animal && (animal as any).localId !== undefined
      
      if (isPending) {
        // Delete from localStorage pending records
        const localId = (animal as any).localId
        await localStorageService.deletePendingRecord(localId)
        console.log('[Delete] Removed pending record:', animal.animal_number, 'localId:', localId)
      } else {
        // Delete from backend (synced record)
        await apiService.deleteAnimal(animal.animal_number, animal.created_at || '')
        console.log('[Delete] Deleted synced record from backend:', animal.animal_number)
      }
      
      // Refresh the display
      const updatedAnimals = await apiService.getDisplayRecords(10)
      onAnimalsChange(updatedAnimals)
      
      // Update stats
      onStatsChange()
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el animal')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle "Register Anyway" action from duplicate dialog
  const handleRegisterAnyway = async () => {
    setDuplicateDialogOpen(false)
    await performRegistration()
  }

  // Handle "Edit Existing" action from duplicate dialog
  const handleEditExisting = () => {
    setDuplicateDialogOpen(false)
    if (duplicateAnimal && onNavigateToSearch) {
      onNavigateToSearch(duplicateAnimal.animal_number)
    }
  }

  // Handle dialog close
  const handleDuplicateDialogClose = () => {
    setDuplicateDialogOpen(false)
    setDuplicateAnimal(null)
  }

  const handleExport = async () => {
    try {
      // Export local records as CSV
      const localRecords = await apiService.getDisplayRecords(1000) // Get more records for export
      
      // Convert to CSV format
      const csvHeaders = [
        'Animal Number', 'Born Date', 'Mother ID', 'Father ID', 'Weight', 
        'Gender', 'Status', 'Color', 'Notes', 'Notes Mother', 'Created At',
        'Insemination Round ID', 'Insemination Identifier', 'Scrotal Circumference',
        'RP Animal', 'RP Mother', 'Mother Weight', 'Weaning Weight', 'Synced'
      ]
      
      const csvRows = localRecords.map(record => [
        record.animal_number || '',
        record.born_date || '',
        record.mother_id || '',
        record.father_id || '',
        record.weight || '',
        record.gender || '',
        record.status || '',
        record.color || '',
        record.notes || '',
        record.notes_mother || '',
        record.created_at || '',
        record.insemination_round_id || '',
        record.insemination_identifier || '',
        record.scrotal_circumference || '',
        record.rp_animal || '',
        record.rp_mother || '',
        record.mother_weight || '',
        record.weaning_weight || '',
        record.synced !== false ? 'Yes' : 'No'
      ])
      
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `animales_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      setError(err.message || 'Error al exportar los datos')
    }
  }

  const handleExportInseminations = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const roundId = selectedRoundId === 'all' ? undefined : selectedRoundId
      const blob = await apiService.exportInseminations(roundId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const roundSuffix = roundId ? `_${roundId}` : ''
      a.download = `inseminaciones${roundSuffix}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setIsExportDialogOpen(false)
    } catch (err: any) {
      setError(err.message || 'Error al exportar las inseminaciones')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Animals Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Animales
              </CardTitle>
              <CardDescription>
                Gestiona todos los registros de animales
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-xs">
                <CheckCircle className="h-3 w-3" />
                {syncedAnimals} sincronizados
              </Badge>
              {pendingAnimals > 0 && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  {pendingAnimals} pendientes
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Dialog open={isRegistering} onOpenChange={setIsRegistering}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Registrar Nuevo Animal</span>
                  <span className="sm:hidden">Registrar</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-0">
                <DialogHeader>
                  <DialogTitle>Registrar Nuevo Animal</DialogTitle>
                  <DialogDescription>
                    Completa la información del animal. Los campos marcados con * son obligatorios.
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="animalNumber">ID del Animal (IDE) *</Label>
                      <Input
                        id="animalNumber"
                        name="animalNumber"
                        value={formData.animalNumber}
                        onChange={handleInputChange}
                        placeholder={`${prefixes.animalPrefix}001-24`}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="animalIdv">ID Visual (IDV)</Label>
                      <Input
                        id="animalIdv"
                        name="animalIdv"
                        value={formData.animalIdv}
                        onChange={handleInputChange}
                        placeholder="e.g., V-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rpAnimal">RP Animal</Label>
                      <Input
                        id="rpAnimal"
                        name="rpAnimal"
                        value={formData.rpAnimal}
                        onChange={handleInputChange}
                        placeholder="e.g., RP-12345"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="motherId">ID de la Madre</Label>
                      <Input
                        id="motherId"
                        name="motherId"
                        value={formData.motherId}
                        onChange={handleInputChange}
                        placeholder={`${prefixes.motherPrefix}001`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rpMother">RP Madre</Label>
                      <Input
                        id="rpMother"
                        name="rpMother"
                        value={formData.rpMother}
                        onChange={handleInputChange}
                        placeholder="e.g., RP-67890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fatherId">ID del Padre</Label>
                      <Input
                        id="fatherId"
                        name="fatherId"
                        value={formData.fatherId}
                        onChange={handleInputChange}
                        placeholder={prefixes.fatherPrefix}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bornDate">Fecha de Nacimiento</Label>
                      <Input
                        id="bornDate"
                        name="bornDate"
                        type="date"
                        value={formData.bornDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weight">Peso (kg)</Label>
                      <Input
                        id="weight"
                        name="weight"
                        type="number"
                        step="0.1"
                        value={formData.weight}
                        onChange={handleInputChange}
                        placeholder="e.g., 285.5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="motherWeight">Peso de la Madre (kg)</Label>
                      <Input
                        id="motherWeight"
                        name="motherWeight"
                        type="number"
                        step="0.1"
                        value={formData.motherWeight}
                        onChange={handleInputChange}
                        placeholder="e.g., 450.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weaningWeight">Peso al Destete (kg)</Label>
                      <Input
                        id="weaningWeight"
                        name="weaningWeight"
                        type="number"
                        step="0.1"
                        value={formData.weaningWeight}
                        onChange={handleInputChange}
                        placeholder="e.g., 180.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexo</Label>
                      <Select name="gender" value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar sexo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FEMALE">Hembra</SelectItem>
                          <SelectItem value="MALE">Macho</SelectItem>
                          <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Estado</Label>
                      <Select
                        name="status"
                        value={formData.status}
                        onValueChange={(value) =>
                          setFormData(prev => ({
                            ...prev,
                            status: value,
                            deathDate:
                              value === 'DEAD' && !prev.deathDate
                                ? new Date().toISOString().split('T')[0]
                                : prev.deathDate,
                            soldDate:
                              value === 'SOLD' && !prev.soldDate
                                ? new Date().toISOString().split('T')[0]
                                : prev.soldDate
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALIVE">Vivo</SelectItem>
                          <SelectItem value="DEAD">Muerto</SelectItem>
                          <SelectItem value="SOLD">Vendido</SelectItem>
                          <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.status === 'DEAD' && (
                      <div className="space-y-2">
                        <Label htmlFor="deathDate">Fecha de Muerte</Label>
                        <Input
                          id="deathDate"
                          name="deathDate"
                          type="date"
                          value={formData.deathDate}
                          onChange={handleInputChange}
                        />
                      </div>
                    )}

                    {formData.status === 'SOLD' && (
                      <div className="space-y-2">
                        <Label htmlFor="soldDate">Fecha de Venta</Label>
                        <Input
                          id="soldDate"
                          name="soldDate"
                          type="date"
                          value={formData.soldDate}
                          onChange={handleInputChange}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="color">Color</Label>
                      <Select name="color" value={formData.color} onValueChange={(value) => setFormData(prev => ({ ...prev, color: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="COLORADO">Colorado</SelectItem>
                          <SelectItem value="NEGRO">Negro</SelectItem>
                          <SelectItem value="OTHERS">Otros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inseminationRoundId">Ronda de Inseminación</Label>
                      <Select 
                        value={formData.inseminationRoundId} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, inseminationRoundId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar ronda de inseminación (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {inseminationRounds.map((round) => (
                            <SelectItem key={round.id} value={round.insemination_round_id}>
                              {round.insemination_round_id} ({round.initial_date} - {round.end_date})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.gender === 'MALE' && (
                      <div className="space-y-2">
                        <Label htmlFor="scrotalCircumference">Circunferencia Escrotal (cm)</Label>
                        <Input
                          id="scrotalCircumference"
                          name="scrotalCircumference"
                          type="number"
                          step="0.1"
                          value={formData.scrotalCircumference}
                          onChange={handleInputChange}
                          placeholder="e.g., 35.5"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="notesMother">Notas de la Madre</Label>
                      <Input
                        id="notesMother"
                        name="notesMother"
                        value={formData.notesMother}
                        onChange={handleInputChange}
                        placeholder="Cualquier nota sobre la madre"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notas</Label>
                      <Input
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Cualquier nota adicional"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => {
                      setIsRegistering(false)
                      setFormData({
                        animalNumber: prefixes.animalPrefix,
                        animalIdv: '',
                        rpAnimal: '',
                        motherId: prefixes.motherPrefix,
                        rpMother: '',
                        fatherId: prefixes.fatherPrefix,
                        bornDate: '',
                        weight: '',
                        motherWeight: '',
                        weaningWeight: '',
                        gender: '',
                        status: 'ALIVE',
                        color: '',
                        notes: '',
                        notesMother: '',
                        scrotalCircumference: '',
                        inseminationRoundId: '',
                        deathDate: '',
                        soldDate: ''
                      })
                    }}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      Registrar Animal
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Gestionar registros</span>
              <span className="sm:hidden">Gestionar</span>
            </Button>

            <Button 
              variant="outline" 
              className="gap-2 w-full sm:w-auto"
              onClick={handleExport}
              disabled={isLoading}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">Exportar</span>
            </Button>
          </div>

          {/* Recent Records - Collapsible */}
          <div className="border rounded-lg">
            <button
              onClick={() => setIsRecordsExpanded(!isRecordsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">Registros Recientes</span>
                <Badge variant="secondary">{totalAnimals}</Badge>
              </div>
              {isRecordsExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {isRecordsExpanded && (
              <div className="border-t p-4 space-y-3">
                {animals.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No hay registros de animales
                  </p>
                ) : (
                  animals.map((animal, index) => (
                    <div key={animal.id || index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-muted/30 rounded-lg space-y-3 sm:space-y-0">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-medium">{animal.animal_number}</span>
                          {animal.rp_animal && (
                            <Badge variant="outline" className="text-xs">
                              {animal.rp_animal}
                            </Badge>
                          )}
                          <Badge variant={'localId' in animal && (animal as any).localId !== undefined ? "destructive" : "default"} className="text-xs">
                            {'localId' in animal && (animal as any).localId !== undefined ? 'Pendiente' : 'Sincronizado'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="flex flex-wrap gap-2">
                            {animal.mother_id && <span>Madre: {animal.mother_id}</span>}
                            {animal.weight && <span>{animal.weight} kg</span>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {animal.gender && <span>{getGenderName(animal.gender)}</span>}
                            {animal.born_date && <span>{formatDate(animal.born_date)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end sm:justify-start">
                        {onNavigateToHistory && (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => onNavigateToHistory(animal.animal_number)}
                            className="flex-1 sm:flex-none"
                            title="Ver historia clínica"
                          >
                            <History className="h-4 w-4" />
                            <span className="ml-1 sm:hidden">Historia</span>
                          </Button>
                        )}
                        {!onNavigateToHistory && (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setSelectedAnimalForHistory(animal)}
                            className="flex-1 sm:flex-none"
                            title="Ver historial de eventos"
                          >
                            <History className="h-4 w-4" />
                            <span className="ml-1 sm:hidden">Historial</span>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="flex-1 sm:flex-none">
                          <Edit className="h-4 w-4" />
                          <span className="ml-1 sm:hidden">Editar</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleDelete(animal)}
                          className="text-destructive hover:text-destructive flex-1 sm:flex-none"
                          disabled={isLoading}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="ml-1 sm:hidden">Eliminar</span>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inseminations Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Inseminaciones
              </CardTitle>
              <CardDescription>
                Gestiona las inseminaciones mediante carga de archivos CSV o XLSX
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <InseminationsUploadDialog
                open={isUploadingInseminations}
                onOpenChange={setIsUploadingInseminations}
                onSuccess={() => {
                  // Refresh insemination rounds after successful upload
                  fetchInseminationRounds()
                  onStatsChange()
                }}
              />
              <Button
                className="gap-2 w-full sm:w-auto"
                onClick={() => setIsUploadingInseminations(true)}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Subir Inseminaciones</span>
                <span className="sm:hidden">Subir</span>
              </Button>
              <Button
                variant="outline"
                className="gap-2 w-full sm:w-auto"
                onClick={() => setIsExportDialogOpen(true)}
                disabled={isLoading}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="sm:hidden">Exportar</span>
              </Button>
            </div>
            
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Exportar Inseminaciones</DialogTitle>
                  <DialogDescription>
                    Selecciona una ronda de inseminación para filtrar o exporta todas las inseminaciones
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="roundSelect">Filtrar por Ronda de Inseminación (opcional)</Label>
                    <Select value={selectedRoundId} onValueChange={setSelectedRoundId}>
                      <SelectTrigger id="roundSelect">
                        <SelectValue placeholder="Todas las rondas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las rondas</SelectItem>
                        {inseminationRounds.map((round) => (
                          <SelectItem key={round.id} value={round.insemination_round_id}>
                            {round.insemination_round_id} ({round.initial_date} - {round.end_date})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsExportDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleExportInseminations}
                      disabled={isLoading}
                    >
                      Exportar CSV
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Animal History Dialog - Event Sourcing Integration */}
      {/* Note: This uses the new domain_events table for audit trail.
          Main animal data still comes from registrations table until full migration. */}
      {selectedAnimalForHistory && (
        <AnimalHistoryDialog
          animal={selectedAnimalForHistory}
          open={!!selectedAnimalForHistory}
          onOpenChange={(open) => {
            if (!open) setSelectedAnimalForHistory(null)
          }}
        />
      )}

      {/* Duplicate Animal Warning Dialog */}
      <DuplicateAnimalDialog
        existingAnimal={duplicateAnimal}
        isOpen={duplicateDialogOpen}
        onClose={handleDuplicateDialogClose}
        onEditExisting={handleEditExisting}
        onRegisterAnyway={handleRegisterAnyway}
      />
    </div>
  )
}
