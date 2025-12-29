import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  History,
  ArrowLeft,
  Calendar,
  User,
  Users,
  Activity,
  Weight,
  Info,
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from 'lucide-react'
import { apiService, Animal, DomainEvent, UpdateBody, RegisterBody, UpdateAnimalByNumberBody, AnimalSnapshot } from '@/services/api'
import { formatDate, getGenderName, getStatusName } from '@/lib/utils'

// Event type display names in Spanish
const EVENT_TYPE_NAMES: Record<string, string> = {
  birth_registered: 'Nacimiento registrado',
  mother_registered: 'Registro de madre',
  father_registered: 'Registro de padre',
  death_recorded: 'Muerte registrada',
  weight_recorded: 'Peso registrado',
  weaning_weight_recorded: 'Peso al destete',
  current_weight_recorded: 'Peso actual registrado',
  mother_assigned: 'Madre asignada',
  father_assigned: 'Padre asignado',
  status_changed: 'Estado cambiado',
  gender_corrected: 'Sexo corregido',
  color_recorded: 'Color registrado',
  animal_number_corrected: 'Número de animal corregido',
  birth_date_corrected: 'Fecha de nacimiento corregida',
  notes_updated: 'Notas actualizadas',
  mother_notes_updated: 'Notas de madre actualizadas',
  rp_animal_updated: 'RP animal actualizado',
  rp_mother_updated: 'RP madre actualizada',
  mother_weight_recorded: 'Peso de madre registrado',
  scrotal_circumference_recorded: 'Circunferencia escrotal registrada',
  animal_idv_updated: 'IDV actualizado',
  insemination_recorded: 'Inseminación registrada',
  insemination_cancelled: 'Inseminación cancelada',
  insemination_date_corrected: 'Fecha de inseminación corregida',
  bull_assigned: 'Toro asignado',
  insemination_notes_updated: 'Notas de inseminación actualizadas',
  animal_deleted: 'Animal eliminado',
}

// Event type colors
const EVENT_TYPE_COLORS: Record<string, string> = {
  birth_registered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  mother_registered: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  father_registered: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
  death_recorded: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  insemination_recorded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  insemination_cancelled: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
}

function getEventTypeName(eventType: string): string {
  return EVENT_TYPE_NAMES[eventType] || eventType.replace(/_/g, ' ')
}

function getEventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
}

// Map AnimalSnapshot to Animal interface for display
function mapSnapshotToAnimal(snapshot: AnimalSnapshot): Animal {
  return {
    animal_number: snapshot.animal_number,
    current_weight: snapshot.current_weight,
    weight: snapshot.current_weight, // For display compatibility
    status: snapshot.current_status,
    gender: snapshot.gender,
    color: snapshot.color,
    notes: snapshot.notes,
    notes_mother: snapshot.notes_mother,
    rp_animal: snapshot.rp_animal,
    rp_mother: snapshot.rp_mother,
    mother_weight: snapshot.mother_weight,
    weaning_weight: snapshot.weaning_weight,
    scrotal_circumference: snapshot.scrotal_circumference,
    born_date: snapshot.birth_date,
    mother_id: snapshot.mother_id,
    father_id: snapshot.father_id,
    death_date: snapshot.death_date,
    sold_date: snapshot.sold_date,
    insemination_round_id: snapshot.insemination_round_id,
    insemination_identifier: snapshot.insemination_identifier,
    animal_idv: snapshot.animal_idv,
    // Note: snapshot doesn't have created_at, so it will be undefined for mothers/fathers
  }
}

interface ClinicalHistoryPageProps {
  allAnimals: Animal[]
  onAnimalUpdated: (updated: Animal) => void
  onStatsChange?: () => void | Promise<void>
  selectedAnimalNumber?: string
  onSelectAnimal?: (animalNumber: string) => void
  onBackToSearch?: (animalNumber?: string) => void
}

export function ClinicalHistoryPage({
  allAnimals,
  onAnimalUpdated,
  onStatsChange,
  selectedAnimalNumber,
  onSelectAnimal,
  onBackToSearch,
}: ClinicalHistoryPageProps) {
  const [searchInput, setSearchInput] = useState(selectedAnimalNumber || '')
  const animalNumber = selectedAnimalNumber || searchInput.trim()

  const [animal, setAnimal] = useState<Animal | null>(null)
  const [snapshot, setSnapshot] = useState<AnimalSnapshot | null>(null)
  const [events, setEvents] = useState<DomainEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)

  // Edit dialog state (reuse existing pattern)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<Partial<Animal>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Update search input when selectedAnimalNumber changes from props
  useEffect(() => {
    if (selectedAnimalNumber) {
      setSearchInput(selectedAnimalNumber)
    }
  }, [selectedAnimalNumber])

  // Fallback: Find animal from allAnimals if snapshot doesn't exist
  // Supports searching by animal_number or mother_id
  // This is only used as fallback when snapshot is not available
  useEffect(() => {
    // If we have snapshot data, don't use allAnimals fallback
    if (snapshot) {
      return
    }
    
    if (!animalNumber) {
      setAnimal(null)
      return
    }
    
    const searchUpper = animalNumber.toUpperCase()
    
    // First, try to find by animal_number
    let found = allAnimals.find(
      a => a.animal_number?.toUpperCase() === searchUpper
    ) || null
    
    // If not found, try to find by mother_id (search for animals that have this as their mother_id)
    // Then find the mother animal itself
    if (!found) {
      const calvesWithThisMother = allAnimals.filter(
        a => a.mother_id?.toUpperCase() === searchUpper
      )
      
      if (calvesWithThisMother.length > 0) {
        const firstCalf = calvesWithThisMother[0]
        
        // Found calves with this mother_id, now find the mother animal
        found = allAnimals.find(
          a => a.animal_number?.toUpperCase() === firstCalf.mother_id?.toUpperCase()
        ) || null
        
        // If mother not found as an animal, create a synthetic record from the mother_id
        // Extract mother_weight from calf records (use most recent)
        if (!found && firstCalf.mother_id) {
          // Get the most recent calf with mother_weight data
          const calvesWithWeight = calvesWithThisMother
            .filter(c => c.mother_weight !== undefined && c.mother_weight !== null)
            .sort((a, b) => {
              // Sort by created_at or born_date (most recent first)
              const aDate = a.created_at || a.born_date || ''
              const bDate = b.created_at || b.born_date || ''
              return bDate.localeCompare(aDate)
            })
          
          const mostRecentMotherWeight = calvesWithWeight.length > 0 
            ? calvesWithWeight[0].mother_weight 
            : undefined
          
          // Get RP from the most recent calf
          const mostRecentCalf = calvesWithThisMother.sort((a, b) => {
            const aDate = a.created_at || a.born_date || ''
            const bDate = b.created_at || b.born_date || ''
            return bDate.localeCompare(aDate)
          })[0]
          
          found = {
            animal_number: firstCalf.mother_id,
            rp_animal: mostRecentCalf.rp_mother,
            mother_weight: mostRecentMotherWeight,
            gender: 'FEMALE', // Mothers are typically female
            status: 'ALIVE',
          } as Animal
        } else if (found) {
          // Mother found as animal, but might not have mother_weight
          // Try to get it from calf records if missing
          if (found.mother_weight === undefined || found.mother_weight === null) {
            const calvesWithWeight = calvesWithThisMother
              .filter(c => c.mother_weight !== undefined && c.mother_weight !== null)
              .sort((a, b) => {
                const aDate = a.created_at || a.born_date || ''
                const bDate = b.created_at || b.born_date || ''
                return bDate.localeCompare(aDate)
              })
            
            if (calvesWithWeight.length > 0) {
              found = {
                ...found,
                mother_weight: calvesWithWeight[0].mother_weight,
              }
            }
          }
        }
      }
    }
    
    // Only update animal if we don't have snapshot (snapshot takes priority)
    if (!snapshot) {
      setAnimal(found)
      if (found) {
        setEditFormData(found)
      } else if (animalNumber.trim()) {
        // Animal not found but user is searching
        setError(null) // Clear previous errors, will show "not found" in UI
      }
    }
  }, [animalNumber, allAnimals, snapshot])

  const fetchSnapshot = async () => {
    if (!animalNumber) return
    
    try {
      const snapshotData = await apiService.getAnimalSnapshotByNumber(animalNumber)
      setSnapshot(snapshotData)
      
      // Map snapshot to Animal interface and use as primary data source
      const animalFromSnapshot = mapSnapshotToAnimal(snapshotData)
      setAnimal(animalFromSnapshot)
      setEditFormData(animalFromSnapshot)
    } catch (err) {
      // Snapshot not found is OK - will fall back to allAnimals
      console.log('Snapshot not found for', animalNumber, 'will use fallback data')
      setSnapshot(null)
    }
  }

  const fetchHistory = async () => {
    if (!animalNumber) return
    setIsLoading(true)
    setError(null)

    try {
      const result = await apiService.getAnimalHistoryByNumber(animalNumber)
      setEvents(result.events || [])
    } catch (err) {
      console.error('Error fetching clinical history:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar la historia clínica')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (animalNumber) {
      // Fetch snapshot first (primary source of truth)
      fetchSnapshot()
      // Then fetch history (for timeline display)
      fetchHistory()
    }
  }, [animalNumber])

  const calves = useMemo(() => {
    if (!animal || !animal.animal_number) return []
    const animalId = animal.animal_number.toUpperCase()
    const isFather = animal.gender === 'MALE'
    
    return allAnimals
      .filter(a => {
        if (isFather) {
          // For fathers, filter by father_id
          return a.father_id && a.father_id.toUpperCase() === animalId
        } else {
          // For mothers or unknown, filter by mother_id
          return a.mother_id && a.mother_id.toUpperCase() === animalId
        }
      })
      .sort((a, b) => {
        // Sort by birth date (most recent first) or by animal_number if no date
        if (a.born_date && b.born_date) {
          return new Date(b.born_date).getTime() - new Date(a.born_date).getTime()
        }
        if (a.born_date) return -1
        if (b.born_date) return 1
        return (a.animal_number || '').localeCompare(b.animal_number || '')
      })
  }, [animal, allAnimals])

  // Group calves by year
  const calvesByYear = useMemo(() => {
    const grouped: Record<string, Animal[]> = {}
    calves.forEach(calf => {
      if (calf.born_date) {
        const year = new Date(calf.born_date).getFullYear().toString()
        if (!grouped[year]) {
          grouped[year] = []
        }
        grouped[year].push(calf)
      } else {
        if (!grouped['Sin fecha']) {
          grouped['Sin fecha'] = []
        }
        grouped['Sin fecha'].push(calf)
      }
    })
    // Sort years descending
    return Object.keys(grouped)
      .sort((a, b) => {
        if (a === 'Sin fecha') return 1
        if (b === 'Sin fecha') return -1
        return parseInt(b) - parseInt(a)
      })
      .reduce((acc, year) => {
        acc[year] = grouped[year]
        return acc
      }, {} as Record<string, Animal[]>)
  }, [calves])

  const visibleEvents = useMemo(() => {
    if (showAllEvents) return events
    return events.slice(0, 50)
  }, [events, showAllEvents])

  const handleOpenEdit = () => {
    if (!animal) return
    setEditFormData(animal)
    setIsEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!animal || !editFormData.animal_number) {
      setError('Faltan datos para actualizar el animal')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Check if animal has domain events (mother/father that was auto-created)
      let animalHasEvents = false
      let registrationCreatedAt: string | undefined = undefined
      
      if (!animal.created_at) {
        try {
          // Check if animal has events by fetching history
          const historyResult = await apiService.getAnimalHistoryByNumber(animal.animal_number)
          if (historyResult.events && historyResult.events.length > 0) {
            animalHasEvents = true
            // Try to find registration by animal_number in allAnimals
            const existingRegistration = allAnimals.find(
              a => a.animal_number?.toUpperCase() === animal.animal_number.toUpperCase() && a.created_at
            )
            if (existingRegistration) {
              registrationCreatedAt = existingRegistration.created_at
            }
          }
        } catch (err) {
          console.warn('Could not check animal history:', err)
        }
      }

      // If animal doesn't have created_at but has events, use update-by-number endpoint
      // This is for mothers/fathers that only exist in domain_events, not in registrations
      if (!animal.created_at && animalHasEvents) {
        // If we found a registration with created_at, use normal update
        if (registrationCreatedAt) {
          const updateData: UpdateBody = {
            animalNumber: animal.animal_number,
            createdAt: registrationCreatedAt,
            rpAnimal: editFormData.rp_animal || undefined,
            motherId: editFormData.mother_id || undefined,
            rpMother: editFormData.rp_mother || undefined,
            fatherId: editFormData.father_id || undefined,
            bornDate: editFormData.born_date || undefined,
            weight: editFormData.weight || undefined,
            currentWeight: editFormData.current_weight || undefined,
            motherWeight: editFormData.mother_weight || undefined,
            weaningWeight: editFormData.weaning_weight || undefined,
            gender: editFormData.gender || undefined,
            status: editFormData.status || undefined,
            color: editFormData.color || undefined,
            notes: editFormData.notes || undefined,
            notesMother: editFormData.notes_mother || undefined,
            scrotalCircumference: editFormData.scrotal_circumference || undefined,
            inseminationRoundId: editFormData.insemination_round_id || undefined,
            deathDate: editFormData.status === 'DEAD' ? editFormData.death_date || undefined : undefined,
            soldDate: editFormData.status === 'SOLD' ? editFormData.sold_date || undefined : undefined,
            animalIdv: editFormData.animal_idv || undefined,
          }

          await apiService.updateAnimal(updateData)

          // Refresh snapshot after edit (snapshot is source of truth)
          await fetchSnapshot()

          const updated: Animal = {
            ...animal,
            ...editFormData,
            created_at: registrationCreatedAt,
          }
          setAnimal(updated)
          onAnimalUpdated(updated)
          if (onStatsChange) {
            await onStatsChange()
          }
          setIsEditOpen(false)
          fetchHistory()
        } else {
          // Animal has events but no registration record - use update-by-number
          // This emits update events only, no registration record created
          const updateData: UpdateAnimalByNumberBody = {
            animalNumber: animal.animal_number,
            currentWeight: editFormData.current_weight || undefined,
            notes: editFormData.notes || undefined,
            status: editFormData.status || undefined,
            color: editFormData.color || undefined,
            rpAnimal: editFormData.rp_animal || undefined,
            notesMother: editFormData.notes_mother || undefined,
            animalIdv: editFormData.animal_idv || undefined,
          }

          await apiService.updateAnimalByNumber(updateData)
          
          // Refresh snapshot after edit (snapshot is source of truth)
          await fetchSnapshot()
          
          const updated: Animal = {
            ...animal,
            ...editFormData,
          }
          setAnimal(updated)
          onAnimalUpdated(updated)
          if (onStatsChange) {
            await onStatsChange()
          }
          setIsEditOpen(false)
          fetchHistory()
        }
      } else if (!animal.created_at) {
        // Animal has no events and no created_at - create new registration
        const registerData: RegisterBody = {
          animalNumber: editFormData.animal_number || animal.animal_number,
          rpAnimal: editFormData.rp_animal || undefined,
          motherId: editFormData.mother_id || undefined,
          rpMother: editFormData.rp_mother || undefined,
          fatherId: editFormData.father_id || undefined,
          bornDate: editFormData.born_date || undefined,
          weight: editFormData.weight || undefined,
          currentWeight: editFormData.current_weight || undefined,
          gender: editFormData.gender || animal.gender || 'FEMALE',
          status: editFormData.status || animal.status || 'ALIVE',
          color: editFormData.color || undefined,
          notes: editFormData.notes || undefined,
          notesMother: editFormData.notes_mother || undefined,
          scrotalCircumference: editFormData.scrotal_circumference || undefined,
          inseminationRoundId: editFormData.insemination_round_id || undefined,
          deathDate: editFormData.status === 'DEAD' ? editFormData.death_date || undefined : undefined,
          soldDate: editFormData.status === 'SOLD' ? editFormData.sold_date || undefined : undefined,
          animalIdv: editFormData.animal_idv || undefined,
        }

        await apiService.registerAnimal(registerData)
        
        // Refresh snapshot after edit (snapshot is source of truth)
        await fetchSnapshot()
        
        const updated: Animal = {
          ...animal,
          ...editFormData,
          created_at: new Date().toISOString(),
        }
        setAnimal(updated)
        onAnimalUpdated(updated)
        if (onStatsChange) {
          await onStatsChange()
        }
        setIsEditOpen(false)
        fetchHistory()
      } else {
        // Normal update flow
        const updateData: UpdateBody = {
          animalNumber: animal.animal_number,
          createdAt: animal.created_at,
          rpAnimal: editFormData.rp_animal || undefined,
          motherId: editFormData.mother_id || undefined,
          rpMother: editFormData.rp_mother || undefined,
          fatherId: editFormData.father_id || undefined,
          bornDate: editFormData.born_date || undefined,
          weight: editFormData.weight || undefined,
          currentWeight: editFormData.current_weight || undefined,
          motherWeight: editFormData.mother_weight || undefined,
          weaningWeight: editFormData.weaning_weight || undefined,
          gender: editFormData.gender || undefined,
          status: editFormData.status || undefined,
          color: editFormData.color || undefined,
          notes: editFormData.notes || undefined,
          notesMother: editFormData.notes_mother || undefined,
          scrotalCircumference: editFormData.scrotal_circumference || undefined,
          inseminationRoundId: editFormData.insemination_round_id || undefined,
          deathDate: editFormData.status === 'DEAD' ? editFormData.death_date || undefined : undefined,
          soldDate: editFormData.status === 'SOLD' ? editFormData.sold_date || undefined : undefined,
          animalIdv: editFormData.animal_idv || undefined,
        }

        await apiService.updateAnimal(updateData)

        // Refresh snapshot after edit (snapshot is source of truth)
        await fetchSnapshot()

        const updated: Animal = {
          ...animal,
          ...editFormData,
        }
        setAnimal(updated)
        onAnimalUpdated(updated)
        if (onStatsChange) {
          await onStatsChange()
        }
        setIsEditOpen(false)

        // Refresh events so corrections appear in the timeline
        fetchHistory()
      }
    } catch (err) {
      console.error('Error updating animal from history page:', err)
      setError(err instanceof Error ? err.message : 'Error al actualizar el animal')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setError(null)
    if (onSelectAnimal && value.trim()) {
      onSelectAnimal(value.trim())
    }
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setError(null)
    if (onSelectAnimal) {
      onSelectAnimal('')
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim() && onSelectAnimal) {
      onSelectAnimal(searchInput.trim())
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Search box */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearchSubmit} className="space-y-2">
            <Label htmlFor="animal-search">Buscar animal o madre por ID</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="animal-search"
                placeholder="Ingresa el ID del animal o madre (ej: V001-24, M001)"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                className="pl-10 pr-10"
                autoFocus
              />
              {searchInput && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                  onClick={handleClearSearch}
                  title="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {searchInput && !animal && (
              <p className="text-sm text-muted-foreground">
                Animal no encontrado. Verifica el ID e intenta nuevamente.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!animalNumber && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Info className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Busca un animal</h3>
              <p className="text-muted-foreground max-w-md">
                Ingresa el ID del animal en el campo de búsqueda arriba para ver su historia clínica completa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {animalNumber && !animal && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Info className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Animal no encontrado</h3>
              <p className="text-muted-foreground max-w-md">
                No se encontró un animal con el ID <strong>{animalNumber}</strong>. Verifica el ID e intenta nuevamente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {animal && (
        <>
          {/* Header: summary card */}
          <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia clínica
            </CardTitle>
            <CardDescription>Resumen actual y eventos clínicos para el animal seleccionado.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {onBackToSearch && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBackToSearch(animalNumber)}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a búsqueda
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleOpenEdit} disabled={!animal}>
              Editar datos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {animal ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{animal.animal_number}</span>
                    {animal.rp_animal && (
                      <Badge variant="outline" className="text-xs">
                        {animal.rp_animal}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Sexo: {getGenderName(animal.gender || '')}</span>
                    <span>Estado: {getStatusName(animal.status || '')}</span>
                    {animal.color && <span>Color: {animal.color.toLowerCase()}</span>}
                                    {animal.animal_idv && <span>IDV: {animal.animal_idv}</span>}
                    {animal.mother_id && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Madre: {animal.mother_id}
                      </span>
                    )}
                    {animal.father_id && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Padre: {animal.father_id}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {animal.born_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Nac.: {formatDate(animal.born_date)}
                      </span>
                    )}
                    {animal.death_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Muerte: {formatDate(animal.death_date)}
                      </span>
                    )}
                    {animal.sold_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Vendido: {formatDate(animal.sold_date)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="font-medium">Últimos datos de peso</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {animal.current_weight !== undefined && (
                      <span className="flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Actual: {animal.current_weight} kg
                      </span>
                    )}
                    {animal.weight !== undefined && (
                      <span className="flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Nac.: {animal.weight} kg
                      </span>
                    )}
                    {animal.weaning_weight !== undefined && (
                      <span className="flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Destete: {animal.weaning_weight} kg
                      </span>
                    )}
                    {animal.mother_weight !== undefined && (
                      <span className="flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Madre: {animal.mother_weight} kg
                      </span>
                    )}
                  </div>
                  {animal.notes && (
                    <p>
                      <span className="font-medium">Notas:</span> {animal.notes}
                    </p>
                  )}
                  {animal.notes_mother && (
                    <p>
                      <span className="font-medium">Notas madre:</span> {animal.notes_mother}
                    </p>
                  )}
                </div>
              </div>

              {/* Calves section for mothers and fathers */}
              {calves.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-lg">Crías registradas</span>
                    <Badge variant="secondary" className="text-sm">
                      {calves.length} {calves.length === 1 ? 'cría' : 'crías'}
                    </Badge>
                  </div>
                  
                  {Object.keys(calvesByYear).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(calvesByYear).map(([year, yearCalves]) => (
                        <div key={year} className="space-y-2">
                          <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Año {year}
                            <Badge variant="outline" className="text-xs">
                              {yearCalves.length}
                            </Badge>
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {yearCalves.map(calf => (
                              <div
                                key={calf.animal_number}
                                className="flex flex-col rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold text-sm truncate">{calf.animal_number}</span>
                                      {calf.rp_animal && (
                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                          {calf.rp_animal}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground space-y-0.5">
                                      {calf.born_date && (
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          <span>{formatDate(calf.born_date)}</span>
                                        </div>
                                      )}
                                      <div className="flex flex-wrap gap-2">
                                        {calf.gender && (
                                          <span className="flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {getGenderName(calf.gender)}
                                          </span>
                                        )}
                                        {calf.status && (
                                          <span>{getStatusName(calf.status)}</span>
                                        )}
                                      </div>
                                      {calf.weight !== undefined && (
                                        <div className="flex items-center gap-1">
                                          <Weight className="h-3 w-3" />
                                          <span>Nacimiento: {calf.weight} kg</span>
                                        </div>
                                      )}
                                      {calf.weaning_weight !== undefined && (
                                        <div className="flex items-center gap-1">
                                          <Weight className="h-3 w-3" />
                                          <span>Destete: {calf.weaning_weight} kg</span>
                                        </div>
                                      )}
                                      {calf.mother_id && (
                                        <div className="flex items-center gap-1">
                                          <Users className="h-3 w-3" />
                                          <span>Madre: {calf.mother_id}</span>
                                        </div>
                                      )}
                                      {calf.father_id && (
                                        <div className="flex items-center gap-1">
                                          <User className="h-3 w-3" />
                                          <span>Padre: {calf.father_id}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => {
                                      if (onSelectAnimal) {
                                        onSelectAnimal(calf.animal_number || '')
                                      }
                                    }}
                                    title="Ver historia clínica de esta cría"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {calves.map(calf => (
                        <div
                          key={calf.animal_number}
                          className="flex flex-col rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm truncate">{calf.animal_number}</span>
                                {calf.rp_animal && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {calf.rp_animal}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {calf.gender && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {getGenderName(calf.gender)}
                                  </span>
                                )}
                                {calf.status && <span>{getStatusName(calf.status)}</span>}
                                {calf.weight !== undefined && (
                                  <div className="flex items-center gap-1">
                                    <Weight className="h-3 w-3" />
                                    <span>Nacimiento: {calf.weight} kg</span>
                                  </div>
                                )}
                                {calf.mother_id && (
                                  <div className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    <span>Madre: {calf.mother_id}</span>
                                  </div>
                                )}
                                {calf.father_id && (
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    <span>Padre: {calf.father_id}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => {
                                if (onSelectAnimal) {
                                  onSelectAnimal(calf.animal_number || '')
                                }
                              }}
                              title="Ver historia clínica de esta cría"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span>No se encontró el animal en los datos cargados. Asegúrate de haber sincronizado los registros.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline of clinical events */}
      <Card>
        <CardHeader>
          <CardTitle>Eventos clínicos</CardTitle>
          <CardDescription>
            Historial completo de eventos registrados para este animal (nacimientos, muertes, cambios de estado,
            pesos, inseminaciones, correcciones, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Cargando historia clínica...
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <History className="h-8 w-8 mb-2" />
              <p>No hay eventos clínicos registrados para este animal.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {visibleEvents.map(event => (
                <div
                  key={event.id}
                  className="relative pl-6 pb-4 border-l-2 border-muted last:border-l-transparent"
                >
                  <div className="absolute left-[-5px] top-0 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge className={getEventTypeColor(event.event_type)}>
                        {getEventTypeName(event.event_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(event.event_time)}</span>
                    </div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div className="text-sm space-y-1">
                        {'field_name' in event.payload && !!event.payload.field_name && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Campo:</span>
                            <span>{`${event.payload.field_name}`}</span>
                          </div>
                        )}
                        {'old_value' in event.payload && event.payload.old_value !== undefined && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Valor anterior:</span>
                            <span className="line-through text-red-500">
                              {`${event.payload.old_value}` || '(vacío)'}
                            </span>
                          </div>
                        )}
                        {'new_value' in event.payload && event.payload.new_value !== undefined && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Nuevo valor:</span>
                            <span className="text-green-600 dark:text-green-400">
                              {`${event.payload.new_value}` || '(vacío)'}
                            </span>
                          </div>
                        )}
                        {'weight' in event.payload && event.payload.weight !== undefined && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Peso:</span>
                            <span>{`${event.payload.weight}`} kg</span>
                          </div>
                        )}
                        {'current_weight' in event.payload && event.payload.current_weight !== undefined && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Peso actual:</span>
                            <span>{`${event.payload.current_weight}`} kg</span>
                          </div>
                        )}
                        {'status' in event.payload && !!event.payload.status && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Estado:</span>
                            <span>{`${event.payload.status}`}</span>
                          </div>
                        )}
                        {'gender' in event.payload && !!event.payload.gender && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Sexo:</span>
                            <span>{getGenderName(String(event.payload.gender))}</span>
                          </div>
                        )}
                        {(() => {
                          const bullId = event.payload.bull_id
                          if (bullId && typeof bullId === 'string') {
                            return (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Toro:</span>
                                <span className="font-medium">{bullId}</span>
                              </div>
                            )
                          }
                          return null
                        })()}
                        {(() => {
                          const motherId = event.payload.mother_id
                          if (motherId && typeof motherId === 'string') {
                            return (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Madre:</span>
                                <span className="font-medium">{motherId}</span>
                              </div>
                            )
                          }
                          return null
                        })()}
                        {(() => {
                          const fatherId = event.payload.father_id
                          if (fatherId && typeof fatherId === 'string') {
                            return (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Padre:</span>
                                <span className="font-medium">{fatherId}</span>
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {events.length > 50 && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setShowAllEvents(prev => !prev)}
                  >
                    {showAllEvents ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Mostrar menos
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Ver todos ({events.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar datos del animal</DialogTitle>
            <DialogDescription>Actualiza los datos principales del animal.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-animal-idv">ID Visual (IDV)</Label>
              <Input
                id="edit-animal-idv"
                value={editFormData.animal_idv || ''}
                onChange={e => setEditFormData({ ...editFormData, animal_idv: e.target.value })}
                placeholder="e.g., V-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rp-animal">RP Animal</Label>
              <Input
                id="edit-rp-animal"
                value={editFormData.rp_animal || ''}
                onChange={e => setEditFormData({ ...editFormData, rp_animal: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mother-id">ID Madre</Label>
              <Input
                id="edit-mother-id"
                value={editFormData.mother_id || ''}
                onChange={e => setEditFormData({ ...editFormData, mother_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rp-mother">RP Madre</Label>
              <Input
                id="edit-rp-mother"
                value={editFormData.rp_mother || ''}
                onChange={e => setEditFormData({ ...editFormData, rp_mother: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-father-id">ID Padre</Label>
              <Input
                id="edit-father-id"
                value={editFormData.father_id || ''}
                onChange={e => setEditFormData({ ...editFormData, father_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-born-date">Fecha de Nacimiento</Label>
              <Input
                id="edit-born-date"
                type="date"
                value={editFormData.born_date || ''}
                onChange={e => setEditFormData({ ...editFormData, born_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-weight">Peso Nacimiento (kg)</Label>
              <Input
                id="edit-weight"
                type="number"
                step="0.1"
                value={editFormData.weight ?? ''}
                onChange={e =>
                  setEditFormData({
                    ...editFormData,
                    weight: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-current-weight">Peso Actual (kg)</Label>
              <Input
                id="edit-current-weight"
                type="number"
                step="0.1"
                value={editFormData.current_weight ?? ''}
                onChange={e =>
                  setEditFormData({
                    ...editFormData,
                    current_weight: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-weaning">Peso al Destete (kg)</Label>
              <Input
                id="edit-weaning"
                type="number"
                step="0.1"
                value={editFormData.weaning_weight ?? ''}
                onChange={e =>
                  setEditFormData({
                    ...editFormData,
                    weaning_weight: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mother-weight">Peso Madre (kg)</Label>
              <Input
                id="edit-mother-weight"
                type="number"
                step="0.1"
                value={editFormData.mother_weight ?? ''}
                onChange={e =>
                  setEditFormData({
                    ...editFormData,
                    mother_weight: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gender">Sexo</Label>
              <Select
                value={editFormData.gender || ''}
                onValueChange={value => setEditFormData({ ...editFormData, gender: value })}
              >
                <SelectTrigger id="edit-gender">
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
              <Label htmlFor="edit-status">Estado</Label>
              <Select
                value={editFormData.status || ''}
                onValueChange={value => setEditFormData({ ...editFormData, status: value })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALIVE">Vivo</SelectItem>
                  <SelectItem value="DEAD">Muerto</SelectItem>
                  <SelectItem value="SOLD">Vendido</SelectItem>
                  <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Show death date only when status is DEAD */}
            {editFormData.status === 'DEAD' && (
            <div className="space-y-2">
                <Label htmlFor="edit-death-date">Fecha de Muerte</Label>
              <Input
                  id="edit-death-date"
                  type="date"
                  value={editFormData.death_date || ''}
                  onChange={e => setEditFormData({ ...editFormData, death_date: e.target.value })}
                />
              </div>
            )}
            {/* Show sold date only when status is SOLD */}
            {editFormData.status === 'SOLD' && (
              <div className="space-y-2">
                <Label htmlFor="edit-sold-date">Fecha de Venta</Label>
                <Input
                  id="edit-sold-date"
                  type="date"
                  value={editFormData.sold_date || ''}
                  onChange={e => setEditFormData({ ...editFormData, sold_date: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-color">Color</Label>
              <Select
                value={editFormData.color || ''}
                onValueChange={value => setEditFormData({ ...editFormData, color: value })}
              >
                <SelectTrigger id="edit-color">
                  <SelectValue placeholder="Seleccionar color" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COLORADO">Colorado</SelectItem>
                  <SelectItem value="NEGRO">Negro</SelectItem>
                  <SelectItem value="MARRON">Marrón</SelectItem>
                  <SelectItem value="OTHERS">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-scrotal">Circunferencia Escrotal (cm)</Label>
              <Input
                id="edit-scrotal"
                type="number"
                step="0.1"
                value={editFormData.scrotal_circumference ?? ''}
                onChange={e =>
                  setEditFormData({
                    ...editFormData,
                    scrotal_circumference: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Input
                id="edit-notes"
                value={editFormData.notes || ''}
                onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes-mother">Notas Madre</Label>
              <Input
                id="edit-notes-mother"
                value={editFormData.notes_mother || ''}
                onChange={e => setEditFormData({ ...editFormData, notes_mother: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  )
}


