import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
// Icons removed - not currently used in this component
import { formatWeight, formatPercentage } from '@/lib/utils'
import { Animal, RegistrationStats, InseminationRound, apiService } from '@/services/api'

interface MetricsPageProps {
  animals: Animal[]
  stats: RegistrationStats
}

// Helper function to calculate metrics for a group of animals
const calculateRoundMetrics = (roundAnimals: Animal[], roundId: string) => {
    const weights = roundAnimals.filter(a => a.weight).map(a => a.weight!)
    const weightsSorted = [...weights].sort((a, b) => a - b)
    
    // Gender distribution
    const genderCount = roundAnimals.reduce((acc, animal) => {
      const gender = animal.gender || 'UNKNOWN'
      acc[gender] = (acc[gender] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Status distribution
    const statusCount = roundAnimals.reduce((acc, animal) => {
      const status = animal.status || 'UNKNOWN'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Mother analysis
    const mothers = roundAnimals.filter(a => a.mother_id).map(a => a.mother_id!)
    const motherCount = new Set(mothers).size
    const motherOffspring = mothers.reduce((acc, motherId) => {
      acc[motherId] = (acc[motherId] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topMothers = Object.entries(motherOffspring)
      .map(([motherId, count]) => ({ motherId, offspring: count }))
      .sort((a, b) => b.offspring - a.offspring)
      .slice(0, 5)

    // Gain calculation (mother weight vs newborn weight) - Only for alive newborn cows
    const gainData = roundAnimals
      .filter(a => a.weight && a.mother_weight && a.status === 'ALIVE')
      .map(animal => ({
        motherId: animal.mother_id || '',
        gain: (animal.weight! / animal.mother_weight!) * 100
      }))

    const gains = gainData.map(d => d.gain)
    const gainsSorted = [...gains].sort((a, b) => a - b)

    return {
      roundId,
      count: roundAnimals.length,
      gender: Object.entries(genderCount).map(([gender, count]) => ({ gender, count })),
      status: Object.entries(statusCount).map(([status, count]) => ({ status, count })),
      weight: {
        count: weights.length,
        average: weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
        min: weights.length > 0 ? Math.min(...weights) : 0,
        max: weights.length > 0 ? Math.max(...weights) : 0,
        median: weightsSorted.length > 0 ? 
          weightsSorted.length % 2 === 0 ? 
            (weightsSorted[weightsSorted.length / 2 - 1] + weightsSorted[weightsSorted.length / 2]) / 2 :
            weightsSorted[Math.floor(weightsSorted.length / 2)] : 0
      },
      mothers: {
        totalMothers: motherCount,
        totalOffspring: mothers.length,
        averageOffspring: motherCount > 0 ? mothers.length / motherCount : 0,
        topMothers,
        mothersWithMultipleOffspring: Object.values(motherOffspring).filter(count => count > 1).length
      },
      gain: {
        totalRecords: gainData.length,
        averageGain: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0,
        minGain: gains.length > 0 ? Math.min(...gains) : 0,
        maxGain: gains.length > 0 ? Math.max(...gains) : 0,
        medianGain: gainsSorted.length > 0 ? 
          gainsSorted.length % 2 === 0 ? 
            (gainsSorted[gainsSorted.length / 2 - 1] + gainsSorted[gainsSorted.length / 2]) / 2 :
            gainsSorted[Math.floor(gainsSorted.length / 2)] : 0,
        byInseminationRound: [{ roundId, averageGain: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0, count: gainData.length }],
        topPerformers: gainData
          .filter(d => d.motherId) // Only include records with motherId
          .reduce((acc, d) => {
            const existing = acc.find(m => m.motherId === d.motherId)
            if (existing) {
              existing.averageGain = (existing.averageGain * existing.count + d.gain) / (existing.count + 1)
              existing.count++
            } else {
              acc.push({ motherId: d.motherId, averageGain: d.gain, count: 1 })
            }
            return acc
          }, [] as Array<{ motherId: string, averageGain: number, count: number }>)
          .sort((a, b) => b.averageGain - a.averageGain)
          .slice(0, 5),
        bottomPerformers: gainData
          .filter(d => d.motherId) // Only include records with motherId
          .reduce((acc, d) => {
            const existing = acc.find(m => m.motherId === d.motherId)
            if (existing) {
              existing.averageGain = (existing.averageGain * existing.count + d.gain) / (existing.count + 1)
              existing.count++
            } else {
              acc.push({ motherId: d.motherId, averageGain: d.gain, count: 1 })
            }
            return acc
          }, [] as Array<{ motherId: string, averageGain: number, count: number }>)
          .sort((a, b) => a.averageGain - b.averageGain)
          .slice(0, 5)
      }
    }
}

// Calculate metrics from real data
const calculateMetrics = (animals: Animal[], stats: RegistrationStats) => {
  // Group animals by insemination round
  const animalsByRound = animals.reduce((acc, animal) => {
    const roundId = animal.insemination_round_id || 'Sin Ronda'
    if (!acc[roundId]) {
      acc[roundId] = []
    }
    acc[roundId].push(animal)
    return acc
  }, {} as Record<string, Animal[]>)

  // Calculate metrics for each round
  const inseminationRounds: Record<string, any> = {}
  
  Object.entries(animalsByRound).forEach(([roundId, roundAnimals]) => {
    inseminationRounds[roundId] = calculateRoundMetrics(roundAnimals, roundId)
  })

  // Calculate overall metrics (all animals)
  const overallMetrics = calculateRoundMetrics(animals, 'Todos')

  return {
    overview: {
      total: stats.totalAnimals || animals.length,
      synced: 0, // Not available in new stats structure
      pending: 0, // Not available in new stats structure
      syncRate: 100, // Assume all data is synced
      cows: animals.length
    },
    inseminationRounds: {
      'Todos': overallMetrics,
      ...inseminationRounds
    }
  }
}

export function MetricsPage({ animals, stats }: MetricsPageProps) {
  const metrics = calculateMetrics(animals, stats)
  const [inseminationRounds, setInseminationRounds] = useState<InseminationRound[]>([])
  
  // Fetch insemination rounds with dates
  useEffect(() => {
    const fetchRounds = async () => {
      try {
        const rounds = await apiService.getInseminationRounds()
        setInseminationRounds(rounds || [])
      } catch (error) {
        console.error('Error fetching insemination rounds:', error)
      }
    }
    fetchRounds()
  }, [])
  
  // Get available rounds, with "Todos" first
  const availableRounds = Object.keys(metrics.inseminationRounds)
  const defaultRound = availableRounds.includes('Todos') ? 'Todos' : availableRounds[0] || 'Todos'
  
  const [selectedRound, setSelectedRound] = useState(defaultRound)
  const [comparisonLimit, setComparisonLimit] = useState<number | 'all'>(4)
  const [tableLimit, setTableLimit] = useState<number | 'all'>(5)
  const [motherSort, setMotherSort] = useState<{ column: 'motherId' | 'count' | 'averageWeight', direction: 'asc' | 'desc' }>({
    column: 'averageWeight',
    direction: 'desc'
  })
  const [bullSort, setBullSort] = useState<{ column: 'bullName' | 'totalInseminations' | 'aliveNewborns' | 'averageWeight', direction: 'asc' | 'desc' }>({
    column: 'totalInseminations',
    direction: 'desc'
  })
  const [comparisonSort, setComparisonSort] = useState<{ column: 'roundId' | 'count' | 'averageWeight' | 'deadCount', direction: 'asc' | 'desc' }>({
    column: 'roundId',
    direction: 'asc'
  })
  const currentRound = metrics.inseminationRounds[selectedRound as keyof typeof metrics.inseminationRounds]

  // Helper function to handle column sorting
  const handleMotherSort = (column: 'motherId' | 'count' | 'averageWeight') => {
    setMotherSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const handleBullSort = (column: 'bullName' | 'totalInseminations' | 'aliveNewborns' | 'averageWeight') => {
    setBullSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const handleComparisonSort = (column: 'roundId' | 'count' | 'averageWeight' | 'deadCount') => {
    setComparisonSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  // Prepare comparison data: get all rounds with their metrics
  const comparisonData = useMemo(() => {
    // Get all rounds from metrics (excluding "Todos" and "Sin Ronda")
    const rounds = Object.keys(metrics.inseminationRounds)
      .filter(r => r !== 'Todos' && r !== 'Sin Ronda')
      .map(roundId => {
        const roundData = metrics.inseminationRounds[roundId as keyof typeof metrics.inseminationRounds]
        if (!roundData) return null
        
        // Find round info from API to get dates
        const roundInfo = inseminationRounds.find(r => r.insemination_round_id === roundId)
        
        // Get dead count from status array
        const deadStatus = roundData.status?.find((s: any) => s.status === 'DEAD')
        const deadCount = deadStatus?.count || 0
        
        return {
          roundId,
          initialDate: roundInfo?.initial_date || '',
          endDate: roundInfo?.end_date || '',
          count: roundData.count || 0,
          averageWeight: roundData.weight?.average || 0,
          deadCount
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null) // Remove nulls
      .sort((a, b) => {
        // Sort by date if available, otherwise by roundId
        if (a.initialDate && b.initialDate) {
          return new Date(a.initialDate).getTime() - new Date(b.initialDate).getTime()
        }
        if (a.initialDate) return -1
        if (b.initialDate) return 1
        return a.roundId.localeCompare(b.roundId)
      })
    
    return rounds
  }, [metrics.inseminationRounds, inseminationRounds])

  return (
    <div className="space-y-6">
      {/* Primary Metrics - Key KPIs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Resumen General</CardTitle>
          <CardDescription>Métricas principales de la granja</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-3xl font-bold text-primary">{metrics.overview.total}</div>
              <div className="text-sm text-muted-foreground">Total Animales</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                {metrics.overview.synced} sincronizados
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-3xl font-bold text-primary">{metrics.overview.syncRate}%</div>
              <div className="text-sm text-muted-foreground">Sincronización</div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                {metrics.overview.pending} pendientes
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-3xl font-bold text-primary">{currentRound?.mothers.totalMothers || 0}</div>
              <div className="text-sm text-muted-foreground">Madres Activas</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {currentRound?.mothers.totalOffspring || 0} crías
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-3xl font-bold text-primary">{formatWeight(currentRound?.weight.average || 0)}</div>
              <div className="text-sm text-muted-foreground">Peso Promedio</div>
              <div className="text-xs text-purple-600 mt-1">
                {formatWeight(currentRound?.weight.min || 0)} - {formatWeight(currentRound?.weight.max || 0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insemination Round Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Análisis por Ronda de Inseminación</CardTitle>
          <CardDescription>
            Métricas detalladas por ronda de inseminación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Round Selector - Mobile Friendly */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Seleccionar Ronda:</label>
            <Select value={selectedRound} onValueChange={setSelectedRound}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const rounds = Object.keys(metrics.inseminationRounds)
                  // Sort: "Todos" first, then sort the rest (excluding "Todos" and "Sin Ronda")
                  const sortedRounds = [
                    ...rounds.filter(r => r === 'Todos'),
                    ...rounds.filter(r => r !== 'Todos' && r !== 'Sin Ronda').sort(),
                    ...rounds.filter(r => r === 'Sin Ronda')
                  ]
                  
                  return sortedRounds.map(roundId => {
                    const roundData = metrics.inseminationRounds[roundId as keyof typeof metrics.inseminationRounds]
                    const displayName = roundId === 'Todos' 
                      ? `Todos (${roundData.count} animales)` 
                      : roundId === 'Sin Ronda'
                      ? `Sin Ronda (${roundData.count} animales)`
                      : `Ronda ${roundId} (${roundData.count} animales)`
                    return (
                      <SelectItem key={roundId} value={roundId}>
                        {displayName}
                      </SelectItem>
                    )
                  })
                })()}
              </SelectContent>
            </Select>
          </div>

          {currentRound && (
            <div className="space-y-6">
              {/* Round Overview - Simplified */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="text-2xl font-bold text-primary">{currentRound.count}</div>
                  <div className="text-sm text-muted-foreground">Animales en Ronda</div>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">{currentRound.weight.count}</div>
                  <div className="text-sm text-muted-foreground">Con Peso Registrado</div>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{currentRound.mothers.totalMothers}</div>
                  <div className="text-sm text-muted-foreground">Madres Activas</div>
                </div>
              </div>

              {/* Detailed Analysis - Grouped by Category */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gender & Status Distribution */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Distribución</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h5 className="font-medium mb-2">Por Sexo</h5>
                      <div className="space-y-2">
                        {currentRound.gender.map((item: any, index: number) => {
                          const total = currentRound.count
                          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0
                          return (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                              <span className="text-sm">
                                {item.gender === 'FEMALE' ? 'Hembras' : item.gender === 'MALE' ? 'Machos' : 'Desconocido'}
                              </span>
                              <div className="flex items-center gap-2 justify-end" style={{ minWidth: '6rem' }}>
                                <div className="w-[2.5rem] flex justify-end">
                                  <Badge variant="secondary" className="font-semibold">{item.count}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground w-[2.5rem] text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium mb-2">Por Estado</h5>
                      <div className="space-y-2">
                        {currentRound.status.map((item: any, index: number) => {
                          const total = currentRound.count
                          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0
                          const isDead = item.status === 'DEAD'
                          return (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                              <span className="text-sm">
                                {item.status === 'ALIVE' ? 'Vivos' : item.status === 'DEAD' ? 'Muertos' : 'Desconocido'}
                              </span>
                              <div className="flex items-center gap-2 justify-end" style={{ minWidth: '6rem' }}>
                                <div className="w-[2.5rem] flex justify-end">
                                  {isDead ? (
                                    <Badge variant="secondary" className="font-semibold">
                                      <span className="text-red-600 dark:text-red-400">{item.count}</span>
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="font-semibold">
                                      {item.count}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground w-[2.5rem] text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Weight Statistics */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Estadísticas de Peso</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-xl font-bold text-primary">{formatWeight(currentRound.weight.average)}</div>
                        <div className="text-xs text-muted-foreground">Promedio</div>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-xl font-bold text-primary">{formatWeight(currentRound.weight.median)}</div>
                        <div className="text-xs text-muted-foreground">Mediana</div>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatWeight(currentRound.weight.min)}</div>
                        <div className="text-xs text-muted-foreground">Mínimo</div>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">{formatWeight(currentRound.weight.max)}</div>
                        <div className="text-xs text-muted-foreground">Máximo</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gain Metrics - Only show if data exists */}
              {currentRound.gain.totalRecords > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Análisis de Ganancia</CardTitle>
                    <CardDescription>
                      Rendimiento de madres basado en ganancia de peso (solo vacas recién nacidas vivas)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Gain Overview */}
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Nota:</strong> Los cálculos de ganancia se basan únicamente en vacas recién nacidas vivas (status: ALIVE) 
                        que tienen tanto peso del animal como peso de la madre registrados.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center p-3 bg-primary/5 rounded border border-primary/20">
                        <div className="text-xl font-bold text-primary">{formatPercentage(currentRound.gain.averageGain)}</div>
                        <div className="text-xs text-muted-foreground">Promedio</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                        <div className="text-lg font-semibold text-green-700 dark:text-green-400">{formatPercentage(currentRound.gain.maxGain)}</div>
                        <div className="text-xs text-muted-foreground">Máxima</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                        <div className="text-lg font-semibold text-red-700 dark:text-red-400">{formatPercentage(currentRound.gain.minGain)}</div>
                        <div className="text-xs text-muted-foreground">Mínima</div>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-lg font-semibold">{formatPercentage(currentRound.gain.medianGain)}</div>
                        <div className="text-xs text-muted-foreground">Mediana</div>
                      </div>
                    </div>

                    {/* Performance Analysis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h5 className="font-semibold mb-3 text-green-700 dark:text-green-400">Mejores Madres</h5>
                        <div className="space-y-2">
                          {currentRound.gain.topPerformers.slice(0, 3).map((mother: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                              <div>
                                <span className="font-medium">{mother.motherId}</span>
                                <div className="text-xs text-muted-foreground">
                                  {mother.count} cría{mother.count > 1 ? 's' : ''}
                                </div>
                              </div>
                              <Badge className="bg-green-600 dark:bg-green-700 text-white">
                                {formatPercentage(mother.averageGain)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold mb-3 text-red-700 dark:text-red-400">Menor Rendimiento</h5>
                        <div className="space-y-2">
                          {currentRound.gain.bottomPerformers.slice(0, 3).map((mother: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                              <div>
                                <span className="font-medium">{mother.motherId}</span>
                                <div className="text-xs text-muted-foreground">
                                  {mother.count} cría{mother.count > 1 ? 's' : ''}
                                </div>
                              </div>
                              <Badge className="bg-red-600 dark:bg-red-700 text-white">
                                {formatPercentage(mother.averageGain)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tables I & II: Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Table I: Top Mothers by Calf Weight */}
                {(() => {
                // Filter animals by selected round
                const filteredAnimals = selectedRound === 'Todos' 
                  ? animals 
                  : animals.filter(a => a.insemination_round_id === selectedRound || (selectedRound === 'Sin Ronda' && !a.insemination_round_id))
                
                // Group by mother_id and calculate metrics
                const motherMetrics = filteredAnimals
                  .filter(a => a.mother_id && a.weight)
                  .reduce((acc, animal) => {
                    const motherId = animal.mother_id!
                    if (!acc[motherId]) {
                      acc[motherId] = {
                        motherId,
                        calves: [],
                        totalWeight: 0,
                        count: 0
                      }
                    }
                    acc[motherId].calves.push(animal.weight!)
                    acc[motherId].totalWeight += animal.weight!
                    acc[motherId].count++
                    return acc
                  }, {} as Record<string, { motherId: string, calves: number[], totalWeight: number, count: number }>)

                const topMothers = Object.values(motherMetrics)
                  .map(m => ({
                    motherId: m.motherId,
                    averageWeight: m.totalWeight / m.count,
                    maxWeight: Math.max(...m.calves),
                    count: m.count
                  }))
                  .sort((a, b) => {
                    let aValue: string | number
                    let bValue: string | number
                    
                    if (motherSort.column === 'motherId') {
                      aValue = a.motherId
                      bValue = b.motherId
                    } else if (motherSort.column === 'count') {
                      aValue = a.count
                      bValue = b.count
                    } else {
                      aValue = a.averageWeight
                      bValue = b.averageWeight
                    }
                    
                    if (typeof aValue === 'string') {
                      return motherSort.direction === 'asc' 
                        ? aValue.localeCompare(bValue as string)
                        : (bValue as string).localeCompare(aValue)
                    } else {
                      return motherSort.direction === 'asc' 
                        ? (aValue as number) - (bValue as number)
                        : (bValue as number) - (aValue as number)
                    }
                  })

                if (topMothers.length === 0) return null

                const displayedMothers = tableLimit === 'all' 
                  ? topMothers 
                  : topMothers.slice(0, tableLimit)

                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Top Madres por Peso de Cría</CardTitle>
                          <CardDescription>
                            Madres con crías de mayor peso promedio
                          </CardDescription>
                        </div>
                        <Select
                          value={tableLimit === 'all' ? 'all' : tableLimit.toString()}
                          onValueChange={(value) => setTableLimit(value === 'all' ? 'all' : parseInt(value))}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">Top 5</SelectItem>
                            <SelectItem value="10">Top 10</SelectItem>
                            <SelectItem value="20">Top 20</SelectItem>
                            <SelectItem value="all">Todos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th 
                                className="text-left p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleMotherSort('motherId')}
                              >
                                <div className="flex items-center gap-1">
                                  ID Madre
                                  {motherSort.column === 'motherId' && (
                                    <span className="text-xs">{motherSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleMotherSort('count')}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  Crías
                                  {motherSort.column === 'count' && (
                                    <span className="text-xs">{motherSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleMotherSort('averageWeight')}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  Peso Promedio
                                  {motherSort.column === 'averageWeight' && (
                                    <span className="text-xs">{motherSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedMothers.map((mother) => (
                              <tr key={mother.motherId} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <span className="font-medium">{mother.motherId}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="secondary">{mother.count}</Badge>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="secondary" className="font-semibold">
                                    {formatWeight(mother.averageWeight)}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })()}

                {/* Table II: Bull Metrics */}
                {(() => {
                // Filter animals by selected round
                const filteredAnimals = selectedRound === 'Todos' 
                  ? animals 
                  : animals.filter(a => a.insemination_round_id === selectedRound || (selectedRound === 'Sin Ronda' && !a.insemination_round_id))
                
                // Group by father_id (bull name) and calculate metrics
                const bullMetrics = filteredAnimals
                  .filter(a => a.father_id)
                  .reduce((acc, animal) => {
                    const bullName = animal.father_id!
                    if (!acc[bullName]) {
                      acc[bullName] = {
                        bullName,
                        total: 0,
                        alive: 0,
                        totalWeight: 0,
                        weightCount: 0
                      }
                    }
                    acc[bullName].total++
                    if (animal.status === 'ALIVE') {
                      acc[bullName].alive++
                    }
                    if (animal.weight) {
                      acc[bullName].totalWeight += animal.weight
                      acc[bullName].weightCount++
                    }
                    return acc
                  }, {} as Record<string, { bullName: string, total: number, alive: number, totalWeight: number, weightCount: number }>)

                const bullStats = Object.values(bullMetrics)
                  .map(b => ({
                    bullName: b.bullName,
                    totalInseminations: b.total,
                    aliveNewborns: b.alive,
                    averageWeight: b.weightCount > 0 ? b.totalWeight / b.weightCount : 0
                  }))
                  .sort((a, b) => {
                    let aValue: string | number
                    let bValue: string | number
                    
                    if (bullSort.column === 'bullName') {
                      aValue = a.bullName
                      bValue = b.bullName
                    } else if (bullSort.column === 'totalInseminations') {
                      aValue = a.totalInseminations
                      bValue = b.totalInseminations
                    } else if (bullSort.column === 'aliveNewborns') {
                      aValue = a.aliveNewborns
                      bValue = b.aliveNewborns
                    } else {
                      aValue = a.averageWeight
                      bValue = b.averageWeight
                    }
                    
                    if (typeof aValue === 'string') {
                      return bullSort.direction === 'asc' 
                        ? aValue.localeCompare(bValue as string)
                        : (bValue as string).localeCompare(aValue)
                    } else {
                      return bullSort.direction === 'asc' 
                        ? (aValue as number) - (bValue as number)
                        : (bValue as number) - (aValue as number)
                    }
                  })

                if (bullStats.length === 0) return null

                const displayedBulls = tableLimit === 'all' 
                  ? bullStats 
                  : bullStats.slice(0, tableLimit)

                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Métricas por Toro</CardTitle>
                          <CardDescription>
                            Rendimiento de toros por inseminaciones y crías
                          </CardDescription>
                        </div>
                        <Select
                          value={tableLimit === 'all' ? 'all' : tableLimit.toString()}
                          onValueChange={(value) => setTableLimit(value === 'all' ? 'all' : parseInt(value))}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">Top 5</SelectItem>
                            <SelectItem value="10">Top 10</SelectItem>
                            <SelectItem value="20">Top 20</SelectItem>
                            <SelectItem value="all">Todos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b">
                              <th 
                                className="text-left p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleBullSort('bullName')}
                              >
                                <div className="flex items-center gap-1">
                                  Toro
                                  {bullSort.column === 'bullName' && (
                                    <span className="text-xs">{bullSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleBullSort('totalInseminations')}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  Inseminaciones
                                  {bullSort.column === 'totalInseminations' && (
                                    <span className="text-xs">{bullSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleBullSort('aliveNewborns')}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  Nacidos Vivos
                                  {bullSort.column === 'aliveNewborns' && (
                                    <span className="text-xs">{bullSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                onClick={() => handleBullSort('averageWeight')}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  Peso
                                  {bullSort.column === 'averageWeight' && (
                                    <span className="text-xs">{bullSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedBulls.map((bull) => (
                              <tr key={bull.bullName} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <span className="font-medium">{bull.bullName}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="secondary" className="font-semibold">{bull.totalInseminations}</Badge>
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="default" className="font-semibold">{bull.aliveNewborns}</Badge>
                                </td>
                                <td className="p-3 text-center">
                                  {bull.averageWeight > 0 ? (
                                    <Badge variant="secondary" className="font-semibold">
                                      {formatWeight(bull.averageWeight)}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison between Rounds */}
      {comparisonData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl">Comparación entre Rondas</CardTitle>
                <CardDescription>
                  Comparación de rendimiento entre campañas de inseminación
                </CardDescription>
              </div>
              {comparisonData.length > 4 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium whitespace-nowrap">Mostrar:</label>
                  <Select 
                    value={comparisonLimit === 'all' ? 'all' : comparisonLimit.toString()} 
                    onValueChange={(value) => setComparisonLimit(value === 'all' ? 'all' : parseInt(value))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                      <SelectItem value="12">12</SelectItem>
                      <SelectItem value="all">Todas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th 
                      className="text-left p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      onClick={() => handleComparisonSort('roundId')}
                    >
                      <div className="flex items-center gap-1">
                        Ronda
                        {comparisonSort.column === 'roundId' && (
                          <span className="text-xs">{comparisonSort.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      onClick={() => handleComparisonSort('count')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Nacimientos
                        {comparisonSort.column === 'count' && (
                          <span className="text-xs">{comparisonSort.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      onClick={() => handleComparisonSort('averageWeight')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Peso Promedio
                        {comparisonSort.column === 'averageWeight' && (
                          <span className="text-xs">{comparisonSort.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-center p-3 font-semibold text-sm cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      onClick={() => handleComparisonSort('deadCount')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Muertes
                        {comparisonSort.column === 'deadCount' && (
                          <span className="text-xs">{comparisonSort.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(comparisonLimit === 'all' 
                    ? comparisonData 
                    : comparisonData.slice(-comparisonLimit)
                  )
                  .sort((a, b) => {
                    let aValue: string | number
                    let bValue: string | number
                    
                    if (comparisonSort.column === 'roundId') {
                      aValue = a.roundId
                      bValue = b.roundId
                    } else if (comparisonSort.column === 'count') {
                      aValue = a.count
                      bValue = b.count
                    } else if (comparisonSort.column === 'averageWeight') {
                      aValue = a.averageWeight
                      bValue = b.averageWeight
                    } else {
                      aValue = a.deadCount
                      bValue = b.deadCount
                    }
                    
                    if (typeof aValue === 'string') {
                      return comparisonSort.direction === 'asc' 
                        ? aValue.localeCompare(bValue as string)
                        : (bValue as string).localeCompare(aValue)
                    } else {
                      return comparisonSort.direction === 'asc' 
                        ? (aValue as number) - (bValue as number)
                        : (bValue as number) - (aValue as number)
                    }
                  })
                  .map((round) => (
                    <tr key={round.roundId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <span className="font-medium">Ronda {round.roundId}</span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className="font-semibold">
                          {round.count}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className="font-semibold">
                          {formatWeight(round.averageWeight)}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {round.deadCount > 0 ? (
                          <Badge variant="secondary" className="font-semibold">
                            <span className="text-red-600 dark:text-red-400">{round.deadCount}</span>
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-semibold">0</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
