import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, Cell, Line, ComposedChart, ScatterChart } from 'recharts'
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
  const [isMobile, setIsMobile] = useState(false)
  
  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
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
  const [plotType, setPlotType] = useState<'births' | 'weights' | 'weaning'>('births')
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

  // Prepare birth distribution data - newborn count per day
  const distributionData = useMemo<{ dataPoints: Array<{ date: string, formattedDate: string, count: number, trend: number }>, phases?: { initial: { end: string, total: number }, middle: { start: string, end: string, total: number }, final: { start: string, total: number } } } | null>(() => {
    if (!currentRound || selectedRound === 'Todos' || selectedRound === 'Sin Ronda') {
      return null
    }

    // Filter animals by selected round and ALIVE status, with birth date
    const filteredAnimals = animals.filter(a => {
      const matchesRound = a.insemination_round_id === selectedRound
      const isAlive = a.status === 'ALIVE' || a.status === 'alive'
      const hasBornDate = a.born_date && a.born_date.trim() !== ''
      
      return matchesRound && isAlive && hasBornDate
    })

    if (filteredAnimals.length === 0) return null

    // Group by normalized born_date and count newborns per day
    const dateGroups = filteredAnimals.reduce((acc, animal) => {
      const rawDate = animal.born_date!.trim()
      let normalizedDate = rawDate

      // Normalize to YYYY-MM-DD when possible
      if (!rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parsed = new Date(rawDate)
        if (!isNaN(parsed.getTime())) {
          normalizedDate = parsed.toISOString().split('T')[0]
        }
      }

      if (!acc[normalizedDate]) {
        acc[normalizedDate] = 0
      }
      acc[normalizedDate] += 1
      return acc
    }, {} as Record<string, number>)

    const dataPoints = Object.entries(dateGroups)
      .map(([date, count]) => {
        const dateObj = new Date(date)
        if (isNaN(dateObj.getTime())) {
          return null
        }
        const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`
        return { date, formattedDate, count }
      })
      .filter((point): point is { date: string, formattedDate: string, count: number } => point !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (dataPoints.length === 0) return null

    // Calculate phase boundaries (three equal parts)
    const firstDate = new Date(dataPoints[0].date)
    const lastDate = new Date(dataPoints[dataPoints.length - 1].date)
    const totalDays = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
    const phase1End = new Date(firstDate)
    phase1End.setDate(phase1End.getDate() + Math.floor(totalDays / 3))
    const phase2End = new Date(firstDate)
    phase2End.setDate(phase2End.getDate() + Math.floor((totalDays * 2) / 3))

    // Find closest data points to phase boundaries
    // Ensure we find points that are at or after the target date to maintain proper ordering
    const findClosestDate = (targetDate: Date, preferAfter: boolean = true) => {
      const targetTime = targetDate.getTime()
      
      // First, try to find the closest point at or after the target date
      if (preferAfter) {
        const afterPoints = dataPoints.filter(point => {
          const pointTime = new Date(point.date).getTime()
          return pointTime >= targetTime
        })
        
        if (afterPoints.length > 0) {
          return afterPoints.reduce((closest, point) => {
            const pointDate = new Date(point.date)
            const closestDate = new Date(closest.date)
            return Math.abs(pointDate.getTime() - targetTime) < Math.abs(closestDate.getTime() - targetTime)
              ? point : closest
          })
        }
      }
      
      // Fallback to closest point overall
      return dataPoints.reduce((closest, point) => {
        const pointDate = new Date(point.date)
        const closestDate = new Date(closest.date)
        return Math.abs(pointDate.getTime() - targetTime) < Math.abs(closestDate.getTime() - targetTime)
          ? point : closest
      })
    }

    let phase1EndPoint = findClosestDate(phase1End, true)
    let phase2EndPoint = findClosestDate(phase2End, true)
    
    // Ensure phase1EndPoint comes before phase2EndPoint in the sorted array
    // If they're out of order, use index-based boundaries instead
    const phase1Index = dataPoints.findIndex(p => p.date === phase1EndPoint.date)
    const phase2Index = dataPoints.findIndex(p => p.date === phase2EndPoint.date)
    
    // If phase boundaries are out of order or the same, recalculate using indices
    if (phase2Index <= phase1Index) {
      const adjustedPhase1Index = Math.floor(dataPoints.length / 3)
      const adjustedPhase2Index = Math.floor((dataPoints.length * 2) / 3)
      const adjustedPhase1EndPoint = dataPoints[Math.min(adjustedPhase1Index, dataPoints.length - 1)]
      const adjustedPhase2EndPoint = dataPoints[Math.min(adjustedPhase2Index, dataPoints.length - 1)]
      
      // Only update if the adjusted points are different and in order
      if (adjustedPhase1EndPoint.date !== adjustedPhase2EndPoint.date && 
          new Date(adjustedPhase1EndPoint.date).getTime() < new Date(adjustedPhase2EndPoint.date).getTime()) {
        phase1EndPoint = adjustedPhase1EndPoint
        phase2EndPoint = adjustedPhase2EndPoint
      }
    }

    // Calculate moving average for trend line with adaptive window size
    // Use 10-15% of data points, with minimum 5 and maximum 15 days
    const adaptiveWindowSize = Math.max(5, Math.min(15, Math.floor(dataPoints.length * 0.12)))
    const windowSize = dataPoints.length >= 5 ? adaptiveWindowSize : Math.max(1, Math.floor(dataPoints.length / 2))
    
    const dataPointsWithTrend = dataPoints.map((point, index) => {
      // Use centered moving average
      const halfWindow = Math.floor(windowSize / 2)
      const start = Math.max(0, index - halfWindow)
      const end = Math.min(dataPoints.length, index + halfWindow + 1)
      const window = dataPoints.slice(start, end)
      const average = window.length > 0 ? window.reduce((sum, p) => sum + p.count, 0) / window.length : point.count
      return {
        ...point,
        trend: Math.round(average * 10) / 10 // Round to 1 decimal
      }
    })

    // Calculate phase totals (sum of births per phase)
    // Normalize dates to midnight for proper comparison (YYYY-MM-DD format)
    const normalizeDate = (dateStr: string): Date => {
      const date = new Date(dateStr)
      date.setHours(0, 0, 0, 0)
      return date
    }
    
    const phase1EndDate = normalizeDate(phase1EndPoint.date)
    const phase2EndDate = normalizeDate(phase2EndPoint.date)
    
    // Ensure phase boundaries are properly ordered
    // If phase2EndPoint is before or equal to phase1EndPoint, adjust the logic
    const phase1EndTime = phase1EndDate.getTime()
    const phase2EndTime = phase2EndDate.getTime()
    
    // If boundaries are the same or out of order, use index-based splitting instead
    const useIndexBased = phase2EndTime <= phase1EndTime || phase1EndPoint.date === phase2EndPoint.date
    
    let initialPhaseTotal = 0
    let middlePhaseTotal = 0
    let finalPhaseTotal = 0

    if (useIndexBased) {
      // Fallback to index-based splitting if date boundaries are problematic
      const phase1Index = Math.floor(dataPoints.length / 3)
      const phase2Index = Math.floor((dataPoints.length * 2) / 3)
      
      dataPoints.forEach((point, index) => {
        if (index <= phase1Index) {
          initialPhaseTotal += point.count
        } else if (index <= phase2Index) {
          middlePhaseTotal += point.count
        } else {
          finalPhaseTotal += point.count
        }
      })
    } else {
      // Use date-based splitting with proper boundary handling
      dataPoints.forEach(point => {
        const pointDate = normalizeDate(point.date)
        const pointTime = pointDate.getTime()
        
        if (pointTime <= phase1EndTime) {
          initialPhaseTotal += point.count
        } else if (pointTime <= phase2EndTime) {
          middlePhaseTotal += point.count
        } else {
          finalPhaseTotal += point.count
        }
      })
    }

    return { 
      dataPoints: dataPointsWithTrend,
      phases: {
        initial: { end: phase1EndPoint.formattedDate, total: initialPhaseTotal },
        middle: { start: phase1EndPoint.formattedDate, end: phase2EndPoint.formattedDate, total: middlePhaseTotal },
        final: { start: phase2EndPoint.formattedDate, total: finalPhaseTotal }
      }
    }
  }, [animals, selectedRound, currentRound])

  // Prepare weight distribution data - individual animals with weight per date
  const weightData = useMemo<{ dataPoints: Array<{ date: string, formattedDate: string, weight: number, animalNumber: string, trend: number }>, trendData: Array<{ formattedDate: string, date: string, trend: number }>, phases?: { initial: { end: string }, middle: { start: string, end: string }, final: { start: string } } } | null>(() => {
    if (!currentRound || selectedRound === 'Todos' || selectedRound === 'Sin Ronda') {
      return null
    }

    // Filter animals by selected round, ALIVE status, with both birth date and weight
    const filteredAnimals = animals.filter(a => {
      const matchesRound = a.insemination_round_id === selectedRound
      const isAlive = a.status === 'ALIVE' || a.status === 'alive'
      const hasBornDate = a.born_date && a.born_date.trim() !== ''
      const hasWeight = a.weight !== undefined && a.weight !== null && a.weight > 0
      
      return matchesRound && isAlive && hasBornDate && hasWeight
    })

    if (filteredAnimals.length === 0) return null

    // Create data points for each animal with weight
    const dataPoints = filteredAnimals
      .map(animal => {
        const rawDate = animal.born_date!.trim()
        let normalizedDate = rawDate

        // Normalize to YYYY-MM-DD when possible
        if (!rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const parsed = new Date(rawDate)
          if (!isNaN(parsed.getTime())) {
            normalizedDate = parsed.toISOString().split('T')[0]
          }
        }

        const dateObj = new Date(normalizedDate)
        if (isNaN(dateObj.getTime())) {
          return null
        }

        const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`
        
        return {
          date: normalizedDate,
          formattedDate,
          weight: animal.weight!,
          animalNumber: animal.animal_number
        }
      })
      .filter((point): point is { date: string, formattedDate: string, weight: number, animalNumber: string } => point !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (dataPoints.length === 0) return null

    // Calculate phase boundaries (three equal parts)
    const firstDate = new Date(dataPoints[0].date)
    const lastDate = new Date(dataPoints[dataPoints.length - 1].date)
    const totalDays = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
    const phase1End = new Date(firstDate)
    phase1End.setDate(phase1End.getDate() + Math.floor(totalDays / 3))
    const phase2End = new Date(firstDate)
    phase2End.setDate(phase2End.getDate() + Math.floor((totalDays * 2) / 3))

    // Find closest data points to phase boundaries
    const findClosestDate = (targetDate: Date) => {
      return dataPoints.reduce((closest, point) => {
        const pointDate = new Date(point.date)
        const closestDate = new Date(closest.date)
        return Math.abs(pointDate.getTime() - targetDate.getTime()) < Math.abs(closestDate.getTime() - targetDate.getTime())
          ? point : closest
      })
    }

    const phase1EndPoint = findClosestDate(phase1End)
    const phase2EndPoint = findClosestDate(phase2End)

    // Group weights by date and calculate average per date for trend calculation
    const weightsByDate = dataPoints.reduce((acc, point) => {
      if (!acc[point.date]) {
        acc[point.date] = { weights: [], formattedDate: point.formattedDate }
      }
      acc[point.date].weights.push(point.weight)
      return acc
    }, {} as Record<string, { weights: number[], formattedDate: string }>)

    const dailyAverages = Object.entries(weightsByDate)
      .map(([date, data]) => ({
        date,
        formattedDate: data.formattedDate,
        avgWeight: data.weights.reduce((sum, w) => sum + w, 0) / data.weights.length
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate moving average for trend line with adaptive window size
    // Use 12% of data points, with minimum 5 and maximum 15 days
    const adaptiveWindowSize = Math.max(5, Math.min(15, Math.floor(dailyAverages.length * 0.12)))
    const windowSize = dailyAverages.length >= 5 ? adaptiveWindowSize : Math.max(1, Math.floor(dailyAverages.length / 2))
    
    const trendData = dailyAverages.map((point, index) => {
      // Use centered moving average with proper window
      const halfWindow = Math.floor(windowSize / 2)
      const start = Math.max(0, index - halfWindow)
      const end = Math.min(dailyAverages.length, index + halfWindow + 1)
      const window = dailyAverages.slice(start, end)
      const average = window.length > 0 ? window.reduce((sum, p) => sum + p.avgWeight, 0) / window.length : point.avgWeight
      return {
        formattedDate: point.formattedDate,
        date: point.date,
        trend: Math.round(average * 10) / 10 // Round to 1 decimal
      }
    })

    // Validation: Ensure trend data covers all dates
    if (trendData.length > 0 && dailyAverages.length > 0) {
      console.log('Trend Calculation Validation:', {
        dailyAveragesCount: dailyAverages.length,
        trendDataCount: trendData.length,
        windowSize,
        firstDate: dailyAverages[0].formattedDate,
        lastDate: dailyAverages[dailyAverages.length - 1].formattedDate,
        firstTrend: trendData[0].formattedDate,
        lastTrend: trendData[trendData.length - 1].formattedDate
      })
    }

    // Add trend to each data point based on its date
    // Create a map for faster lookup
    const trendMap = new Map(trendData.map(t => [t.formattedDate, t.trend]))
    const dataPointsWithTrend = dataPoints.map(point => {
      const trendValue = trendMap.get(point.formattedDate)
      return {
        ...point,
        trend: trendValue !== undefined ? trendValue : point.weight
      }
    })
    
    // Validation: Check if all data points have trend values
    const pointsWithoutTrend = dataPointsWithTrend.filter(p => !trendMap.has(p.formattedDate))
    if (pointsWithoutTrend.length > 0) {
      console.warn('Data points without trend values:', pointsWithoutTrend.length, 'out of', dataPointsWithTrend.length)
    }

    return {
      dataPoints: dataPointsWithTrend,
      trendData: trendData, // Include trend data for direct use in chart
      phases: {
        initial: { end: phase1EndPoint.formattedDate },
        middle: { start: phase1EndPoint.formattedDate, end: phase2EndPoint.formattedDate },
        final: { start: phase2EndPoint.formattedDate }
      }
    }
  }, [animals, selectedRound, currentRound])

  // Prepare weaning weight distribution data - binned distribution
  const weaningWeightDistribution = useMemo<Array<{ bin: string, count: number, min: number, max: number }> | null>(() => {
    if (!currentRound || selectedRound === 'Todos' || selectedRound === 'Sin Ronda') {
      return null
    }

    // Filter animals by selected round, ALIVE status, with weaning weight
    const filteredAnimals = animals.filter(a => {
      const matchesRound = a.insemination_round_id === selectedRound
      const isAlive = a.status === 'ALIVE' || a.status === 'alive'
      const hasWeaningWeight = a.weaning_weight !== undefined && a.weaning_weight !== null && a.weaning_weight > 0
      
      return matchesRound && isAlive && hasWeaningWeight
    })

    if (filteredAnimals.length === 0) return null

    // Get all weaning weights
    const weaningWeights = filteredAnimals.map(a => a.weaning_weight!).sort((a, b) => a - b)

    // Create bins (e.g., 0-10, 10-20, 20-30, etc.)
    // Use 10kg bins for granular distribution
    const binSize = 10

    // Create bins
    const bins: Record<string, { count: number, min: number, max: number }> = {}
    weaningWeights.forEach(weight => {
      const binIndex = Math.floor(weight / binSize)
      const binMin = binIndex * binSize
      const binMax = (binIndex + 1) * binSize
      const binKey = `${binMin}-${binMax}`
      
      if (!bins[binKey]) {
        bins[binKey] = { count: 0, min: binMin, max: binMax }
      }
      bins[binKey].count++
    })

    // Convert to array and sort by bin min value
    return Object.entries(bins)
      .map(([bin, data]) => ({
        bin,
        count: data.count,
        min: data.min,
        max: data.max
      }))
      .sort((a, b) => a.min - b.min)
  }, [animals, selectedRound, currentRound])

  // Prepare weight comparison data for scatter plot (birth weight vs weaning weight)
  const weightComparisonData = useMemo<Array<{ animalNumber: string, birthWeight: number, weaningWeight: number, weightGain: number, gainPercentage: number }>>(() => {
    if (!currentRound || selectedRound === 'Todos' || selectedRound === 'Sin Ronda') {
      return []
    }

    // Filter animals with both birth weight and weaning weight
    const filteredAnimals = animals.filter(a => {
      const matchesRound = a.insemination_round_id === selectedRound
      const isAlive = a.status === 'ALIVE' || a.status === 'alive'
      const hasBirthWeight = a.weight !== undefined && a.weight !== null && a.weight > 0
      const hasWeaningWeight = a.weaning_weight !== undefined && a.weaning_weight !== null && a.weaning_weight > 0
      
      return matchesRound && isAlive && hasBirthWeight && hasWeaningWeight
    })

    if (filteredAnimals.length === 0) return []

    // Calculate gain percentage: (weaning_weight / (weight - 1)) * 100
    return filteredAnimals
      .map(animal => {
        const birthWeight = animal.weight!
        const weaningWeight = animal.weaning_weight!
        const weightGain = weaningWeight - birthWeight
        // Gain percentage formula: ((weaning_weight / birth_weight) - 1) * 100
        const gainPercentage = birthWeight > 0 ? ((weaningWeight / birthWeight) - 1) * 100 : 0
        
        return {
          animalNumber: animal.animal_number,
          birthWeight,
          weaningWeight,
          weightGain,
          gainPercentage
        }
      })
      .sort((a, b) => b.gainPercentage - a.gainPercentage) // Sort by gain percentage descending
  }, [animals, selectedRound, currentRound])

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

              {/* Birth/Weight/Weaning Distribution Plot */}
              {selectedRound !== 'Todos' && selectedRound !== 'Sin Ronda' ? (
                <Card className="border border-muted-foreground/20 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Distribución de Nacimientos</CardTitle>
                        <CardDescription>
                          {plotType === 'births' 
                            ? 'Nacimientos diarios de crías vivas durante la campaña'
                            : plotType === 'weights'
                            ? 'Peso de crías vivas por fecha de nacimiento'
                            : 'Peso al destete de crías vivas por fecha de nacimiento'}
                        </CardDescription>
                      </div>
                      <Select value={plotType} onValueChange={(value) => setPlotType(value as 'births' | 'weights' | 'weaning')}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="births">Nacimientos</SelectItem>
                          <SelectItem value="weights">Pesos</SelectItem>
                          <SelectItem value="weaning">Peso al Destete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Show chart if data exists, otherwise show no data message */}
                    {((plotType === 'births' && distributionData && distributionData.dataPoints && distributionData.dataPoints.length > 0) ||
                      (plotType === 'weights' && weightData && weightData.dataPoints && weightData.dataPoints.length > 0) ||
                      (plotType === 'weaning' && weaningWeightDistribution && weaningWeightDistribution.length > 0)) ? (
                      <>
                    <div className="w-full" style={{ minHeight: isMobile ? '200px' : '260px', height: isMobile ? '200px' : '260px', minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                        {plotType === 'births' && distributionData ? (
                          <BarChart
                            data={distributionData.dataPoints}
                            margin={{ 
                              top: 10, 
                              right: isMobile ? 5 : 12, 
                              bottom: isMobile ? 50 : 40, 
                              left: isMobile ? 40 : 8 
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                              dataKey="formattedDate"
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              label={{
                                value: 'Fecha de nacimiento',
                                position: 'insideBottom',
                                offset: isMobile ? -8 : -12,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                            />
                            <YAxis
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              allowDecimals={false}
                              label={{
                                value: 'Nacimientos',
                                angle: -90,
                                position: isMobile ? 'left' : 'insideLeft',
                                offset: isMobile ? 5 : 0,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                            />
                            <Tooltip
                              cursor={{ fill: 'hsl(var(--muted)/0.25)' }}
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 8,
                                padding: '6px 8px'
                              }}
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length > 0) {
                                  // Find the count value (from Bar), ignore trend (from Line)
                                  const countPayload = payload.find(p => p.dataKey === 'count')
                                  if (countPayload) {
                                    return (
                                      <div>
                                        <p className="font-semibold mb-1">Fecha: {label}</p>
                                        <p className="text-sm">Nacimientos: {countPayload.value}</p>
                                      </div>
                                    )
                                  }
                                }
                                return null
                              }}
                            />
                            <Bar
                              name="count"
                              dataKey="count"
                              fill="hsl(var(--primary) / 0.7)"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                            <Line
                              name="trend"
                              type="monotone"
                              dataKey="trend"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={false}
                              activeDot={false}
                              isAnimationActive={false}
                            />
                          </BarChart>
                        ) : plotType === 'weights' && weightData && weightData.trendData ? (
                          <ComposedChart
                            data={(() => {
                              // Use trendData as base - this defines the X-axis categories
                              const trendLineData = weightData.trendData.map((t: { formattedDate: string, date: string, trend: number }) => ({
                                formattedDate: t.formattedDate,
                                date: t.date,
                                trend: t.trend
                              }))
                              
                              // Verify all dates are present and sorted
                              const sortedData = trendLineData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                              
                              // Log to verify data structure
                              console.log('ComposedChart Trend Data:', {
                                count: sortedData.length,
                                first: sortedData[0],
                                last: sortedData[sortedData.length - 1],
                                hasAllTrends: sortedData.every(d => d.trend !== undefined && !isNaN(d.trend) && d.trend > 0),
                                sample: sortedData.slice(0, 5).map(d => ({ date: d.formattedDate, trend: d.trend })),
                                lastSample: sortedData.slice(-5).map(d => ({ date: d.formattedDate, trend: d.trend }))
                              })
                              
                              return sortedData
                            })()}
                            margin={{ 
                              top: 10, 
                              right: isMobile ? 5 : 12, 
                              bottom: isMobile ? 50 : 40, 
                              left: isMobile ? 40 : 8 
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                              type="category"
                              dataKey="formattedDate"
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              allowDuplicatedCategory={false}
                              label={{
                                value: 'Fecha de nacimiento',
                                position: 'insideBottom',
                                offset: isMobile ? -8 : -12,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                            />
                            <YAxis
                              type="number"
                              yAxisId="weight"
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              label={{
                                value: 'Peso (kg)',
                                angle: -90,
                                position: isMobile ? 'left' : 'insideLeft',
                                offset: isMobile ? 5 : 0,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                              domain={(() => {
                                // Calculate domain from both trend and weight values
                                const allValues = [
                                  ...weightData.dataPoints.map(p => p.trend),
                                  ...weightData.dataPoints.map(p => p.weight)
                                ]
                                const min = Math.min(...allValues)
                                const max = Math.max(...allValues)
                                const padding = (max - min) * 0.1
                                return [Math.max(0, min - padding), max + padding]
                              })()}
                            />
                            <Tooltip
                              cursor={{ strokeDasharray: '3 3' }}
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 8,
                                padding: '6px 8px'
                              }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length > 0) {
                                  const data = payload[0].payload
                                  // Find all animals for this date
                                  const animalsForDate = weightData.dataPoints.filter(p => p.formattedDate === data.formattedDate)
                                  return (
                                    <div>
                                      <p className="font-semibold mb-1">Fecha: {data.formattedDate}</p>
                                      {animalsForDate.length > 0 && (
                                        <>
                                          {animalsForDate.length <= 3 && animalsForDate.map((animal, idx) => (
                                            <p key={idx} className="text-sm">Animal {animal.animalNumber}: {formatWeight(animal.weight)} kg</p>
                                          ))}
                                          {animalsForDate.length > 3 && (
                                            <p className="text-sm text-muted-foreground">+{animalsForDate.length - 3} más</p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )
                                }
                                return null
                              }}
                            />
                            {/* Trend line - render first to ensure it's visible */}
                            <Line
                              type="monotone"
                              dataKey="trend"
                              yAxisId="weight"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2.5}
                              dot={false}
                              activeDot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                              isAnimationActive={false}
                              connectNulls={true}
                              name="Tendencia"
                            />
                            {/* Scatter points for individual animals - render after Line */}
                            <Scatter
                              name="Pesos"
                              yAxisId="weight"
                              data={weightData.dataPoints.map(p => ({
                                formattedDate: p.formattedDate,
                                weight: p.weight,
                                animalNumber: p.animalNumber
                              }))}
                              dataKey="weight"
                              fill="hsl(var(--primary) / 0.7)"
                            >
                              {weightData.dataPoints.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill="hsl(var(--primary) / 0.7)" />
                              ))}
                            </Scatter>
                          </ComposedChart>
                        ) : plotType === 'weaning' && weaningWeightDistribution ? (
                          <BarChart
                            data={weaningWeightDistribution}
                            margin={{ 
                              top: 10, 
                              right: isMobile ? 5 : 12, 
                              bottom: isMobile ? 50 : 40, 
                              left: isMobile ? 40 : 50 
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                              dataKey="bin"
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              label={{
                                value: 'Rango de Peso (kg)',
                                position: 'insideBottom',
                                offset: isMobile ? -8 : -12,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                            />
                            <YAxis
                              className="text-xs"
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                              allowDecimals={false}
                              label={{
                                value: 'Cantidad de Animales',
                                angle: -90,
                                position: 'left',
                                offset: isMobile ? 5 : 10,
                                style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                              }}
                            />
                            <Tooltip
                              cursor={{ fill: 'hsl(var(--muted)/0.25)' }}
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 8,
                                padding: '6px 8px'
                              }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length > 0) {
                                  const countPayload = payload.find(p => p.dataKey === 'count')
                                  if (countPayload) {
                                    const data = payload[0].payload as { bin: string, count: number, min: number, max: number }
                                    return (
                                      <div>
                                        <p className="font-semibold mb-1">Rango: {data.bin} kg</p>
                                        <p className="text-sm">Cantidad: {countPayload.value}</p>
                                      </div>
                                    )
                                  }
                                }
                                return null
                              }}
                            />
                            <Bar
                              name="count"
                              dataKey="count"
                              fill="hsl(var(--primary) / 0.7)"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                          </BarChart>
                        ) : null}
                      </ResponsiveContainer>
                    </div>
                    {/* Phase Performance Visualization */}
                    {plotType === 'births' && distributionData?.phases && (() => {
                      const maxTotal = Math.max(distributionData.phases.initial.total, distributionData.phases.middle.total, distributionData.phases.final.total)
                      const initialHeight = maxTotal > 0 ? (distributionData.phases.initial.total / maxTotal) * 40 : 0
                      const middleHeight = maxTotal > 0 ? (distributionData.phases.middle.total / maxTotal) * 40 : 0
                      const finalHeight = maxTotal > 0 ? (distributionData.phases.final.total / maxTotal) * 40 : 0
                      
                      return (
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Rendimiento por Fase</span>
                          </div>
                          <div className="relative h-16 flex items-end justify-between px-2">
                            {/* Line connecting the three phases */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ height: '64px' }}>
                              <line
                                x1="12.5%"
                                y1={48 - initialHeight}
                                x2="50%"
                                y2={48 - middleHeight}
                                stroke="hsl(var(--primary))"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                opacity={0.6}
                              />
                              <line
                                x1="50%"
                                y1={48 - middleHeight}
                                x2="87.5%"
                                y2={48 - finalHeight}
                                stroke="hsl(var(--primary))"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                opacity={0.6}
                              />
                            </svg>
                            {/* Phase points and labels */}
                            <div className="relative z-10 flex-1 flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary border-2 border-background mb-auto" style={{ marginTop: `${48 - initialHeight - 4}px` }} />
                              <span className="text-xs text-muted-foreground mt-2">Inicial</span>
                              <span className="text-xs font-semibold">{distributionData.phases.initial.total}</span>
                            </div>
                            <div className="relative z-10 flex-1 flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary border-2 border-background mb-auto" style={{ marginTop: `${48 - middleHeight - 4}px` }} />
                              <span className="text-xs text-muted-foreground mt-2">Media</span>
                              <span className="text-xs font-semibold">{distributionData.phases.middle.total}</span>
                            </div>
                            <div className="relative z-10 flex-1 flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-primary border-2 border-background mb-auto" style={{ marginTop: `${48 - finalHeight - 4}px` }} />
                              <span className="text-xs text-muted-foreground mt-2">Final</span>
                              <span className="text-xs font-semibold">{distributionData.phases.final.total}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>
                          {plotType === 'births' 
                            ? 'No hay datos disponibles para mostrar la distribución de nacimientos.'
                            : plotType === 'weights'
                            ? 'No hay datos disponibles para mostrar la distribución de pesos.'
                            : 'No hay datos disponibles para mostrar la distribución de peso al destete.'}
                        </p>
                        <p className="text-sm mt-2">
                          {plotType === 'births'
                            ? 'Se requieren crías vivas con fecha de nacimiento registrada.'
                            : plotType === 'weights'
                            ? 'Se requieren crías vivas con fecha de nacimiento y peso registrados.'
                            : 'Se requieren crías vivas con peso al destete registrado.'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {/* Weight Comparison Scatter Plot - shown when weaning plot type is selected */}
              {plotType === 'weaning' && weightComparisonData.length > 0 && selectedRound !== 'Todos' && selectedRound !== 'Sin Ronda' && (
                <Card className="border border-muted-foreground/20 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Comparación Peso al Nacer vs Peso al Destete</CardTitle>
                    <CardDescription>
                      Identificación de animales con mayor y menor ganancia de peso
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full" style={{ minHeight: isMobile ? '200px' : '260px', height: isMobile ? '200px' : '260px', minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                        <ScatterChart
                          data={weightComparisonData}
                          margin={{ 
                            top: 10, 
                            right: isMobile ? 5 : 12, 
                            bottom: isMobile ? 50 : 40, 
                            left: isMobile ? 40 : 50 
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            type="number"
                            dataKey="birthWeight"
                            name="Peso al Nacer"
                            unit=" kg"
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                            domain={(() => {
                              if (weightComparisonData.length === 0) return ['auto', 'auto']
                              const min = Math.min(...weightComparisonData.map(d => d.birthWeight))
                              const max = Math.max(...weightComparisonData.map(d => d.birthWeight))
                              const padding = (max - min) * 0.05 // 5% padding
                              return [Math.max(0, min - padding), max + padding]
                            })()}
                            label={{
                              value: 'Peso al Nacer (kg)',
                              position: 'insideBottom',
                              offset: isMobile ? -8 : -12,
                              style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                            }}
                          />
                          <YAxis
                            type="number"
                            dataKey="weaningWeight"
                            name="Peso al Destete"
                            unit=" kg"
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 9 : 11 }}
                            domain={(() => {
                              if (weightComparisonData.length === 0) return ['auto', 'auto']
                              const min = Math.min(...weightComparisonData.map(d => d.weaningWeight))
                              const max = Math.max(...weightComparisonData.map(d => d.weaningWeight))
                              const padding = (max - min) * 0.05 // 5% padding
                              return [Math.max(0, min - padding), max + padding]
                            })()}
                            label={{
                              value: 'Peso al Destete (kg)',
                              angle: -90,
                              position: 'left',
                              offset: isMobile ? 5 : 10,
                              style: { textAnchor: 'middle', fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }
                            }}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                            contentStyle={{
                              backgroundColor: 'hsl(var(--popover))',
                              border: '2px solid hsl(var(--primary))',
                              borderRadius: 8,
                              padding: '10px 12px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                              zIndex: 9999,
                              fontSize: '13px',
                              fontWeight: 500
                            }}
                            wrapperStyle={{
                              zIndex: 9999,
                              pointerEvents: 'none'
                            }}
                            itemStyle={{
                              padding: '2px 0'
                            }}
                            labelStyle={{
                              marginBottom: '6px',
                              fontWeight: 600,
                              fontSize: '14px',
                              color: 'hsl(var(--primary))'
                            }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length > 0) {
                                const data = payload[0].payload
                                return (
                                  <div style={{ zIndex: 9999 }}>
                                    <p style={{ 
                                      fontWeight: 600, 
                                      marginBottom: '8px', 
                                      fontSize: '14px',
                                      color: 'hsl(var(--primary))'
                                    }}>
                                      {data.animalNumber}
                                    </p>
                                    <p style={{ marginBottom: '4px', fontSize: '13px' }}>
                                      Peso al Nacer: {formatWeight(data.birthWeight)} kg
                                    </p>
                                    <p style={{ marginBottom: '4px', fontSize: '13px' }}>
                                      Peso al Destete: {formatWeight(data.weaningWeight)} kg
                                    </p>
                                    <p style={{ 
                                      fontWeight: 600, 
                                      fontSize: '13px',
                                      color: 'hsl(var(--primary))',
                                      marginTop: '4px'
                                    }}>
                                      {formatPercentage(data.gainPercentage)}
                                    </p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Scatter
                            name="Comparación"
                            data={weightComparisonData}
                            fill="hsl(var(--primary) / 0.7)"
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                    <div className="space-y-4">
                      {/* Birth Weight Statistics */}
                      <div>
                        <h5 className="font-medium mb-2 text-sm">Peso al Nacer</h5>
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
                      </div>
                      {/* Weaning Weight Statistics - only show if data exists */}
                      {(() => {
                        const filteredAnimals = selectedRound === 'Todos' 
                          ? animals 
                          : animals.filter(a => a.insemination_round_id === selectedRound || (selectedRound === 'Sin Ronda' && !a.insemination_round_id))
                        
                        const weaningWeights = filteredAnimals
                          .filter(a => a.weaning_weight !== undefined && a.weaning_weight !== null && a.weaning_weight > 0)
                          .map(a => a.weaning_weight!)
                        
                        if (weaningWeights.length === 0) return null
                        
                        const sortedWeights = [...weaningWeights].sort((a, b) => a - b)
                        const avgWeaning = weaningWeights.reduce((sum, w) => sum + w, 0) / weaningWeights.length
                        const medianWeaning = sortedWeights.length % 2 === 0
                          ? (sortedWeights[sortedWeights.length / 2 - 1] + sortedWeights[sortedWeights.length / 2]) / 2
                          : sortedWeights[Math.floor(sortedWeights.length / 2)]
                        const minWeaning = Math.min(...weaningWeights)
                        const maxWeaning = Math.max(...weaningWeights)
                        
                        // Calculate average weight gain and gain percentage
                        const animalsWithBothWeights = filteredAnimals.filter(a => 
                          a.weight && a.weight > 0 && a.weaning_weight && a.weaning_weight > 0
                        )
                        const avgWeightGain = animalsWithBothWeights.length > 0
                          ? animalsWithBothWeights.reduce((sum, a) => sum + (a.weaning_weight! - a.weight!), 0) / animalsWithBothWeights.length
                          : 0
                        const avgGainPercentage = animalsWithBothWeights.length > 0
                          ? animalsWithBothWeights.reduce((sum, a) => {
                              const gainPct = a.weight! > 0 ? ((a.weaning_weight! / a.weight!) - 1) * 100 : 0
                              return sum + gainPct
                            }, 0) / animalsWithBothWeights.length
                          : 0
                        
                        return (
                          <div>
                            <h5 className="font-medium mb-2 text-sm">Peso al Destete</h5>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="text-center p-3 bg-muted/30 rounded">
                                <div className="text-xl font-bold text-primary">{formatWeight(avgWeaning)}</div>
                                <div className="text-xs text-muted-foreground">Promedio</div>
                              </div>
                              <div className="text-center p-3 bg-muted/30 rounded">
                                <div className="text-xl font-bold text-primary">{formatWeight(medianWeaning)}</div>
                                <div className="text-xs text-muted-foreground">Mediana</div>
                              </div>
                              <div className="text-center p-3 bg-muted/30 rounded">
                                <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatWeight(minWeaning)}</div>
                                <div className="text-xs text-muted-foreground">Mínimo</div>
                              </div>
                              <div className="text-center p-3 bg-muted/30 rounded">
                                <div className="text-lg font-semibold text-green-600 dark:text-green-400">{formatWeight(maxWeaning)}</div>
                                <div className="text-xs text-muted-foreground">Máximo</div>
                              </div>
                            </div>
                            {animalsWithBothWeights.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                                    <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">{formatWeight(avgWeightGain)}</div>
                                    <div className="text-xs text-muted-foreground">Ganancia Promedio</div>
                                  </div>
                                  <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-800">
                                    <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">{formatPercentage(avgGainPercentage)}</div>
                                    <div className="text-xs text-muted-foreground">Ganancia % Promedio</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
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
