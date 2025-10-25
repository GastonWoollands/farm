import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  CheckCircle, 
  Clock,
  Users,
  Weight,
  Calendar
} from 'lucide-react'
import { formatDate, getGenderName, getStatusName } from '@/lib/utils'
import { Animal, apiService } from '@/services/api'

interface SearchPageProps {
  animals: Animal[]
  onAnimalsChange: (animals: Animal[]) => void
}

export function SearchPage({ animals, onAnimalsChange }: SearchPageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    gender: '',
    status: '',
    color: '',
    inseminationRound: ''
  })
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter and search animals
  const filteredAnimals = animals.filter(animal => {
    const matchesSearch = 
      animal.animal_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      animal.rp_animal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      animal.mother_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      animal.rp_mother?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      animal.father_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesGender = !filters.gender || animal.gender === filters.gender
    const matchesStatus = !filters.status || animal.status === filters.status
    const matchesColor = !filters.color || animal.color === filters.color
    const matchesRound = !filters.inseminationRound || animal.insemination_round_id === filters.inseminationRound

    return matchesSearch && matchesGender && matchesStatus && matchesColor && matchesRound
  }).sort((a, b) => {
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
      inseminationRound: ''
    })
  }

  const handleDelete = async (id: number) => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Call API to delete animal
      const animalToDelete = animals.find(a => a.id === id)
      if (animalToDelete) {
        await apiService.deleteAnimal(animalToDelete.animal_number, animalToDelete.created_at)
      }
      
      // Update parent component
      onAnimalsChange(animals.filter(animal => animal.id !== id))
    } catch (err) {
      setError('Error al eliminar el animal')
      console.error('Delete error:', err)
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
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar Animales
          </CardTitle>
          <CardDescription>
            Encuentra y gestiona animales con filtros avanzados
          </CardDescription>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Sexo</Label>
              <Select value={filters.gender} onValueChange={(value) => handleFilterChange('gender', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los sexos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los sexos</SelectItem>
                  <SelectItem value="FEMALE">Hembra</SelectItem>
                  <SelectItem value="MALE">Macho</SelectItem>
                  <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los estados</SelectItem>
                  <SelectItem value="ALIVE">Vivo</SelectItem>
                  <SelectItem value="DEAD">Muerto</SelectItem>
                  <SelectItem value="UNKNOWN">Desconocido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={filters.color} onValueChange={(value) => handleFilterChange('color', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los colores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los colores</SelectItem>
                  <SelectItem value="COLORADO">Colorado</SelectItem>
                  <SelectItem value="NEGRO">Negro</SelectItem>
                  <SelectItem value="OTHERS">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ronda de Inseminación</Label>
              <Select value={filters.inseminationRound} onValueChange={(value) => handleFilterChange('inseminationRound', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las rondas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las rondas</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sort and Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Ordenar por:</Label>
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
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <Filter className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
              <Badge variant="secondary">
                {filteredAnimals.length} resultado{filteredAnimals.length !== 1 ? 's' : ''}
              </Badge>
            </div>
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
          ) : filteredAnimals.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No se encontraron resultados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAnimals.map(animal => (
                <Card key={animal.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{animal.animal_number}</h3>
                        {animal.rp_animal && (
                          <Badge variant="outline" className="mt-1">
                            {animal.rp_animal}
                          </Badge>
                        )}
                      </div>
                      <Badge variant={animal.synced ? "default" : "destructive"}>
                        {animal.synced ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {animal.synced ? 'Sincronizado' : 'Pendiente'}
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
                          <span>{animal.weight} kg</span>
                          {animal.mother_weight && (
                            <span className="text-muted-foreground">
                              (Madre: {animal.mother_weight} kg)
                            </span>
                          )}
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
                        <span>{getStatusName(animal.status)}</span>
                      </div>

                      {animal.color && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Color:</span>
                          <span className="capitalize">{animal.color.toLowerCase()}</span>
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
                      <Button size="sm" variant="ghost">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleDelete(animal.id)}
                        className="text-destructive hover:text-destructive"
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
    </div>
  )
}
