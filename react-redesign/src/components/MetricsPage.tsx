import { useState, useEffect } from 'react'
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
  const currentRound = metrics.inseminationRounds[selectedRound as keyof typeof metrics.inseminationRounds]

  // Prepare comparison data: sort rounds by initial_date (lower to greater)
  const comparisonData = (() => {
    const rounds = Object.keys(metrics.inseminationRounds)
      .filter(r => r !== 'Todos' && r !== 'Sin Ronda')
      .map(roundId => {
        const roundData = metrics.inseminationRounds[roundId as keyof typeof metrics.inseminationRounds]
        const roundInfo = inseminationRounds.find(r => r.insemination_round_id === roundId)
        return {
          roundId,
          initialDate: roundInfo?.initial_date || '',
          endDate: roundInfo?.end_date || '',
          count: roundData.count,
          averageWeight: roundData.weight.average,
          deadCount: roundData.status.find((s: any) => s.status === 'DEAD')?.count || 0
        }
      })
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
  })()

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
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{item.count}</Badge>
                                <span className="text-xs text-muted-foreground">
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
                          return (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                              <span className="text-sm">
                                {item.status === 'ALIVE' ? 'Vivos' : item.status === 'DEAD' ? 'Muertos' : 'Desconocido'}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge variant={item.status === 'ALIVE' ? 'default' : 'destructive'}>
                                  {item.count}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
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
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">{formatWeight(currentRound.weight.min)}</div>
                        <div className="text-xs text-muted-foreground">Mínimo</div>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded">
                        <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatWeight(currentRound.weight.max)}</div>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison between Rounds */}
      {comparisonData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Comparación entre Rondas</CardTitle>
            <CardDescription>
              Comparación de rendimiento entre campañas de inseminación {comparisonData.length > 1 ? '(ordenadas por fecha)' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold text-sm">Ronda</th>
                    <th className="text-center p-3 font-semibold text-sm">Nacimientos</th>
                    <th className="text-center p-3 font-semibold text-sm">Peso Promedio</th>
                    <th className="text-center p-3 font-semibold text-sm">Muertes</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((round) => (
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
                        <span className="font-medium">{formatWeight(round.averageWeight)}</span>
                      </td>
                      <td className="p-3 text-center">
                        {round.deadCount > 0 ? (
                          <Badge variant="destructive">{round.deadCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
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
