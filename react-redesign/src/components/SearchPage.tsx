import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  CheckCircle, 
  Clock,
  Users,
  Weight,
  Calendar,
  History
} from 'lucide-react'
import { formatDate, getGenderName, getStatusName } from '@/lib/utils'
import { Animal, apiService, UpdateBody, InseminationRound } from '@/services/api'

interface SearchPageProps {
  animals: Animal[]
  onAnimalsChange: (animals: Animal[]) => void
  initialSearchTerm?: string
  onNavigateToHistory?: (animalNumber: string) => void
}

export function SearchPage({ animals, onAnimalsChange, initialSearchTerm, onNavigateToHistory }: SearchPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    gender: '',
    status: '',
    color: '',
    inseminationRound: '',
    rpAnimal: '',
    rpMother: ''
  })
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<Animal>>({})
  const [inseminationRounds, setInseminationRounds] = useState<InseminationRound[]>([])

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

  // Pre-fill search term when navigating from duplicate dialog
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm)
    }
  }, [initialSearchTerm])

  // Debug logging
  console.log('SearchPage - animals received:', animals)
  console.log('SearchPage - animals length:', animals?.length || 0)

  // Filter and search animals - simplified and safer
  const filteredAnimals = React.useMemo(() => {
    try {
      console.log('Filtering animals:', animals)
      
      if (!animals || !Array.isArray(animals)) {
        console.log('Animals is not an array:', animals)
        return []
      }

      let filtered = [...animals] // Create a copy to avoid mutations

      // Filter out DELETED animals - they should never appear in UI
      filtered = filtered.filter(animal => animal.status !== 'DELETED')

      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(animal => {
          const searchLower = searchTerm.toLowerCase()
          return (
            (animal.animal_number || '').toLowerCase().includes(searchLower) ||
            (animal.animal_idv || '').toLowerCase().includes(searchLower) ||
            (animal.rp_animal || '').toLowerCase().includes(searchLower) ||
            (animal.mother_id || '').toLowerCase().includes(searchLower) ||
            (animal.rp_mother || '').toLowerCase().includes(searchLower) ||
            (animal.father_id || '').toLowerCase().includes(searchLower) ||
            (animal.insemination_round_id || '').toLowerCase().includes(searchLower)
          )
        })
      }

      // Apply other filters
      if (filters.gender) {
        filtered = filtered.filter(animal => animal.gender === filters.gender)
      }
      if (filters.status) {
        filtered = filtered.filter(animal => animal.status === filters.status)
      }
      if (filters.color) {
        filtered = filtered.filter(animal => animal.color === filters.color)
      }
      if (filters.inseminationRound) {
        filtered = filtered.filter(animal => animal.insemination_round_id === filters.inseminationRound)
      }
      if (filters.rpAnimal) {
        filtered = filtered.filter(animal => 
          (animal.rp_animal || '').toLowerCase().includes(filters.rpAnimal.toLowerCase())
        )
      }
      if (filters.rpMother) {
        filtered = filtered.filter(animal => 
          (animal.rp_mother || '').toLowerCase().includes(filters.rpMother.toLowerCase())
        )
      }

      // Sort
      filtered.sort((a, b) => {
        let aValue = a[sortBy as keyof typeof a]
        let bValue = b[sortBy as keyof typeof b]

        // Handle null/undefined values
        if (aValue == null) aValue = 0
        if (bValue == null) bValue = 0

        if (sortBy === 'created_at' || sortBy === 'born_date') {
          aValue = new Date(aValue as string).getTime()
          bValue = new Date(bValue as string).getTime()
        }

        if (sortOrder === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
        }
      })

      console.log('Filtered animals result:', filtered)
      return filtered
    } catch (err) {
      console.error('Error filtering animals:', err)
      setError('Error al filtrar animales')
      return []
    }
  }, [animals, searchTerm, filters, sortBy, sortOrder])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilters({
      gender: '',
      status: '',
      color: '',
      inseminationRound: '',
      rpAnimal: '',
      rpMother: ''
    })
  }

  const clearFilter = (filterKey: string) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: ''
    }))
  }

  const handleEdit = (animal: Animal) => {
    setEditingAnimal(animal)
    setEditFormData(animal)
    setIsEditDialogOpen(true)
  }

  const handleEditSave = async () => {
    if (!editingAnimal || !editFormData.animal_number) {
      setError('Animal number is required')
      return
    }

    // Validate created_at is present for backend updates
    if (!editingAnimal.created_at) {
      setError('Created date is required to update this animal. Please contact support if this error persists.')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Check if online - editing requires server connection
      if (!navigator.onLine) {
        setError('Debes estar conectado a internet para editar registros.')
        setIsLoading(false)
        return
      }

      // Update directly on backend
      const updateData: UpdateBody = {
          animalNumber: editingAnimal.animal_number,
          animalIdv: editFormData.animal_idv || undefined,
          createdAt: editingAnimal.created_at || '',
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
          soldDate: editFormData.status === 'SOLD' ? editFormData.sold_date || undefined : undefined
        }

      await apiService.updateAnimal(updateData)
      
      // Refresh animals from backend after successful update
      try {
        const refreshedData = await apiService.getRegistrations(1000)
        onAnimalsChange(refreshedData.registrations)
      } catch (refreshError) {
        console.warn('Failed to refresh animals after update:', refreshError)
        // Fallback to local update if refresh fails
        onAnimalsChange(animals.map(a => 
          a.animal_number === editingAnimal.animal_number 
            ? { ...a, ...editFormData }
            : a
        ))
      }

      setIsEditDialogOpen(false)
      setEditingAnimal(null)
      setEditFormData({})
    } catch (err: any) {
      setError(err.message || 'Error al actualizar el animal')
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
      // Delete from backend
      await apiService.deleteAnimal(animal.animal_number, animal.created_at || '')
      
      // Update parent component
      onAnimalsChange(animals.filter(a => a.animal_number !== animal.animal_number))
      
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el animal')
    } finally {
      setIsLoading(false)
    }
  }

  // Error boundary fallback
  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-destructive mb-4">
              <Search className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Error en la búsqueda</h3>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </div>
            <Button onClick={() => setError(null)}>
              Intentar de nuevo
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Animales
          </CardTitle>
          <CardDescription>
            Encuentra y gestiona animales con filtros avanzados
          </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium whitespace-nowrap">Ordenar por:</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Fecha de registro</SelectItem>
                    <SelectItem value="born_date">Fecha de nacimiento</SelectItem>
                    <SelectItem value="animal_number">ID del animal</SelectItem>
                    <SelectItem value="weight">Peso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="whitespace-nowrap"
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </Button>
              <Button variant="outline" size="sm" onClick={clearFilters} className="whitespace-nowrap">
                <Filter className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSearchTerm('')
                  setFilters({ gender: '', status: '', color: '', inseminationRound: '', rpAnimal: '', rpMother: '' })
                }}
                className="whitespace-nowrap"
              >
                Mostrar todos ({animals.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Bar */}
          <div className="space-y-2">
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar por ID, RP, madre, padre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Sexo</Label>
                {filters.gender && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => clearFilter('gender')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de sexo"
                  >
                    ✕
                  </Button>
                )}
              </div>
              <Select value={filters.gender} onValueChange={(value) => handleFilterChange('gender', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los sexos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FEMALE">Hembra</SelectItem>
                  <SelectItem value="MALE">Macho</SelectItem>
                  <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Estado</Label>
                {filters.status && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => clearFilter('status')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de estado"
                  >
                    ✕
                  </Button>
                )}
              </div>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALIVE">Vivo</SelectItem>
                  <SelectItem value="DEAD">Muerto</SelectItem>
                  <SelectItem value="SOLD">Vendido</SelectItem>
                  <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Color</Label>
                {filters.color && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => clearFilter('color')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de color"
                  >
                    ✕
                  </Button>
                )}
              </div>
              <Select value={filters.color} onValueChange={(value) => handleFilterChange('color', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los colores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COLORADO">Colorado</SelectItem>
                  <SelectItem value="NEGRO">Negro</SelectItem>
                  <SelectItem value="OTHERS">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Ronda de Inseminación</Label>
                {filters.inseminationRound && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => clearFilter('inseminationRound')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de ronda"
                  >
                    ✕
                  </Button>
                )}
              </div>
              <Select value={filters.inseminationRound} onValueChange={(value) => handleFilterChange('inseminationRound', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las rondas" />
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">RP Animal</Label>
                {filters.rpAnimal && (
              <Button
                    variant="ghost" 
                size="sm"
                    onClick={() => clearFilter('rpAnimal')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de RP Animal"
              >
                    ✕
              </Button>
                )}
              </div>
              <Input
                placeholder="Filtrar por RP Animal"
                value={filters.rpAnimal}
                onChange={(e) => handleFilterChange('rpAnimal', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">RP Madre</Label>
                {filters.rpMother && (
                <Button 
                    variant="ghost" 
                  size="sm" 
                    onClick={() => clearFilter('rpMother')}
                    className="h-7 w-7 p-0 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    title="Limpiar filtro de RP Madre"
                  >
                    ✕
                </Button>
                )}
              </div>
              <Input
                placeholder="Filtrar por RP Madre"
                value={filters.rpMother}
                onChange={(e) => handleFilterChange('rpMother', e.target.value)}
              />
            </div>
          </div>

          {/* Results Count */}
          <div className="flex justify-end">
            <Badge variant="secondary">
                {filteredAnimals.length} resultado{filteredAnimals.length !== 1 ? 's' : ''}
              </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados de la búsqueda</CardTitle>
          <CardDescription>
            {filteredAnimals.length === 0 
              ? 'No se encontraron animales que coincidan con los criterios de búsqueda'
              : `Mostrando ${filteredAnimals.length} animal${filteredAnimals.length !== 1 ? 'es' : ''}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Cargando resultados...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-destructive mb-4">
                <Search className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Error en la búsqueda</h3>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button onClick={() => setError(null)}>
                Intentar de nuevo
              </Button>
            </div>
          ) : filteredAnimals.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No se encontraron resultados</p>
              {animals.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Hay {animals.length} animales en total, pero no coinciden con los filtros actuales.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => {
                      setSearchTerm('')
                      setFilters({ gender: '', status: '', color: '', inseminationRound: '', rpAnimal: '', rpMother: '' })
                    }}
                  >
                    Mostrar todos los animales
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAnimals.map((animal, index) => (
                <Card key={animal.id || index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{animal.animal_number}</h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {animal.animal_idv && (
                            <Badge variant="secondary" className="text-xs">
                              IDV: {animal.animal_idv}
                            </Badge>
                          )}
                        {animal.rp_animal && (
                            <Badge variant="outline" className="text-xs">
                            {animal.rp_animal}
                          </Badge>
                        )}
                        </div>
                      </div>
                      <Badge variant={animal.synced !== false ? "default" : "destructive"}>
                        {animal.synced !== false ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {animal.synced !== false ? 'Sincronizado' : 'Pendiente'}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      {animal.mother_id && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>Madre: {animal.mother_id}</span>
                          {animal.rp_mother && (
                            <Badge variant="outline" className="text-xs">
                              {animal.rp_mother}
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {animal.father_id && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>Padre: {animal.father_id}</span>
                        </div>
                      )}

                      {animal.weight && (
                        <div className="flex items-center gap-2">
                          <Weight className="h-4 w-4 text-muted-foreground" />
                          <span>Nacimiento: {animal.weight} kg</span>
                          {animal.mother_weight && (
                            <span className="text-muted-foreground">
                              (Madre: {animal.mother_weight} kg)
                            </span>
                          )}
                        </div>
                      )}

                      {animal.weaning_weight && (
                        <div className="flex items-center gap-2">
                          <Weight className="h-4 w-4 text-muted-foreground" />
                          <span>Destete: {animal.weaning_weight} kg</span>
                        </div>
                      )}

                      {animal.born_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Nacimiento: {formatDate(animal.born_date)}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Sexo:</span>
                        <span>{getGenderName(animal.gender || '')}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Estado:</span>
                        <span>{getStatusName(animal.status || '')}</span>
                      </div>

                      {animal.color && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Color:</span>
                          <span className="capitalize">{animal.color.toLowerCase()}</span>
                        </div>
                      )}

                      {animal.insemination_round_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Ronda Inseminación:</span>
                          <span>{animal.insemination_round_id}</span>
                        </div>
                      )}

                      {animal.scrotal_circumference && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">CE:</span>
                          <span>{animal.scrotal_circumference} cm</span>
                        </div>
                      )}

                      {animal.notes && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            <strong>Notas:</strong> {animal.notes}
                          </p>
                        </div>
                      )}

                      {animal.notes_mother && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            <strong>Notas Madre:</strong> {animal.notes_mother}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t">
                      {onNavigateToHistory && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => onNavigateToHistory(animal.animal_number)}
                          title="Ver historia clínica"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(animal)} disabled={isLoading}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleDelete(animal)}
                        className="text-destructive hover:text-destructive"
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Animal</DialogTitle>
            <DialogDescription>
              Modifica la información del animal {editFormData.animal_number}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-animal-idv">ID Visual (IDV)</Label>
              <Input
                id="edit-animal-idv"
                value={editFormData.animal_idv || ''}
                onChange={(e) => setEditFormData({ ...editFormData, animal_idv: e.target.value })}
                placeholder="e.g., V-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rp-animal">RP Animal</Label>
              <Input
                id="edit-rp-animal"
                value={editFormData.rp_animal || ''}
                onChange={(e) => setEditFormData({ ...editFormData, rp_animal: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-mother-id">ID Madre</Label>
              <Input
                id="edit-mother-id"
                value={editFormData.mother_id || ''}
                onChange={(e) => setEditFormData({ ...editFormData, mother_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rp-mother">RP Madre</Label>
              <Input
                id="edit-rp-mother"
                value={editFormData.rp_mother || ''}
                onChange={(e) => setEditFormData({ ...editFormData, rp_mother: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-father-id">ID Padre</Label>
              <Input
                id="edit-father-id"
                value={editFormData.father_id || ''}
                onChange={(e) => setEditFormData({ ...editFormData, father_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-born-date">Fecha de Nacimiento</Label>
              <Input
                id="edit-born-date"
                type="date"
                value={editFormData.born_date || ''}
                onChange={(e) => setEditFormData({ ...editFormData, born_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-weight">Peso Nacimiento (kg)</Label>
              <Input
                id="edit-weight"
                type="number"
                step="0.1"
                value={editFormData.weight ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, weight: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-current-weight">Peso Actual (kg)</Label>
              <Input
                id="edit-current-weight"
                type="number"
                step="0.1"
                value={editFormData.current_weight ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, current_weight: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-weaning-weight">Peso al Destete (kg)</Label>
              <Input
                id="edit-weaning-weight"
                type="number"
                step="0.1"
                value={editFormData.weaning_weight ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, weaning_weight: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-mother-weight">Peso Madre (kg)</Label>
              <Input
                id="edit-mother-weight"
                type="number"
                step="0.1"
                value={editFormData.mother_weight ?? ''}
                onChange={(e) => setEditFormData({ ...editFormData, mother_weight: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-gender">Sexo</Label>
              <Select value={editFormData.gender || ''} onValueChange={(value) => setEditFormData({ ...editFormData, gender: value })}>
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
              <Label htmlFor="edit-status">Estado</Label>
              <Select value={editFormData.status || ''} onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}>
                <SelectTrigger>
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
                  onChange={(e) => setEditFormData({ ...editFormData, death_date: e.target.value })}
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
                  onChange={(e) => setEditFormData({ ...editFormData, sold_date: e.target.value })}
                />
              </div>
            )}

                    <div className="space-y-2">
                      <Label htmlFor="edit-color">Color</Label>
              <Select value={editFormData.color || ''} onValueChange={(value) => setEditFormData({ ...editFormData, color: value })}>
                <SelectTrigger>
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
              <Label htmlFor="edit-insemination-round">Ronda de Inseminación</Label>
              <Select 
                value={editFormData.insemination_round_id ? editFormData.insemination_round_id : 'none'} 
                onValueChange={(value) => {
                  const newValue = value === 'none' ? undefined : value
                  setEditFormData({ ...editFormData, insemination_round_id: newValue })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ronda (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  {inseminationRounds.map((round) => (
                    <SelectItem key={round.id} value={round.insemination_round_id}>
                      {round.insemination_round_id} ({round.initial_date} - {round.end_date})
                    </SelectItem>
                  ))}
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
                onChange={(e) => setEditFormData({ ...editFormData, scrotal_circumference: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Input
                id="edit-notes"
                value={editFormData.notes || ''}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes-mother">Notas Madre</Label>
              <Input
                id="edit-notes-mother"
                value={editFormData.notes_mother || ''}
                onChange={(e) => setEditFormData({ ...editFormData, notes_mother: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={isLoading}>
              {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
