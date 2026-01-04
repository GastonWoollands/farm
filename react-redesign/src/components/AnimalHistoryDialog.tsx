/**
 * Animal History Dialog - Event Sourcing Integration
 * 
 * Displays the complete audit trail of domain events for an animal.
 * This component reads from the new domain_events table to provide
 * an immutable history of all changes.
 * 
 * Note: This is part of the phased event sourcing rollout.
 * Main animal data still comes from registrations table.
 * This component can be used to view event history in parallel.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { History, RefreshCw, AlertCircle } from 'lucide-react'
import { apiService, DomainEvent, Animal } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface AnimalHistoryDialogProps {
  animal: Animal
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Event type display names in Spanish
const EVENT_TYPE_NAMES: Record<string, string> = {
  birth_registered: 'Nacimiento registrado',
  death_recorded: 'Muerte registrada',
  weight_recorded: 'Peso registrado',
  weaning_weight_recorded: 'Peso al destete',
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
  rp_mother_updated: 'RP madre actualizado',
  mother_weight_recorded: 'Peso de madre registrado',
  scrotal_circumference_recorded: 'Circunferencia escrotal registrada',
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

export function AnimalHistoryDialog({ animal, open, onOpenChange }: AnimalHistoryDialogProps) {
  const [events, setEvents] = useState<DomainEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Try by ID first, fall back to animal_number
      let result
      if (animal.id) {
        result = await apiService.getAnimalHistory(animal.id)
      } else {
        result = await apiService.getAnimalHistoryByNumber(animal.animal_number)
      }
      setEvents(result.events)
    } catch (err) {
      console.error('Error fetching animal history:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar historial')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchHistory()
    }
  }, [open, animal.id, animal.animal_number])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Eventos - {animal.animal_number}
          </DialogTitle>
          <DialogDescription>
            Registro completo de todos los eventos para este animal
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHistory}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="h-[400px] overflow-y-auto pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <History className="h-8 w-8 mb-2" />
              <p>No hay eventos registrados</p>
              <p className="text-sm">Los eventos aparecerán aquí cuando se realicen cambios</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="relative pl-6 pb-4 border-l-2 border-muted last:border-l-transparent"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[-5px] top-0 h-2.5 w-2.5 rounded-full bg-primary" />
                  
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge className={getEventTypeColor(event.event_type)}>
                        {getEventTypeName(event.event_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.event_time)}
                      </span>
                    </div>
                    
                    {/* Payload details */}
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
                        {'status' in event.payload && !!event.payload.status && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">Estado:</span>
                            <span>{`${event.payload.status}`}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground mt-2">
                      Usuario: {event.user_id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

