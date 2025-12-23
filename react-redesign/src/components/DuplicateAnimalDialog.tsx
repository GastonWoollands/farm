import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search, X, Calendar, Users, Weight, User } from 'lucide-react'
import { Animal } from '@/services/api'
import { formatDate } from '@/lib/utils'

interface DuplicateAnimalDialogProps {
  existingAnimal: Animal | null
  isOpen: boolean
  onClose: () => void
  onEditExisting: () => void
  onRegisterAnyway: () => void
}

export function DuplicateAnimalDialog({
  existingAnimal,
  isOpen,
  onClose,
  onEditExisting,
  onRegisterAnyway
}: DuplicateAnimalDialogProps) {
  if (!existingAnimal) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[540px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <DialogTitle className="flex items-center gap-2 text-orange-600 text-lg sm:text-xl">
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
            <span>Animal Duplicado Detectado</span>
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            El número de animal <strong className="text-foreground">{existingAnimal.animal_number}</strong> ya existe en el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {/* Warning Alert */}
          <Alert className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 p-3 sm:p-4">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-500 flex-shrink-0" />
            <AlertDescription className="text-xs sm:text-sm text-orange-800 dark:text-orange-200 ml-2 leading-relaxed">
              Registrar animales duplicados puede causar confusión en reportes y métricas. 
              Se recomienda buscar y actualizar el registro existente.
            </AlertDescription>
          </Alert>

          {/* Existing Animal Information */}
          <div className="rounded-lg border bg-muted/30 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Registro Existente
              </h4>
              <Badge variant="secondary" className="text-xs">
                {existingAnimal.status || 'ALIVE'}
              </Badge>
            </div>
            
            <div className="space-y-3">
              {/* Animal Number */}
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">Número de Animal</p>
                  <p className="font-medium text-sm truncate">{existingAnimal.animal_number}</p>
                </div>
              </div>
              
              {/* Birth Date */}
              {existingAnimal.born_date && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Fecha de Nacimiento</p>
                    <p className="font-medium text-sm">{formatDate(existingAnimal.born_date)}</p>
                  </div>
                </div>
              )}
              
              {/* Parents */}
              {(existingAnimal.mother_id || existingAnimal.father_id) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {existingAnimal.mother_id && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Madre</p>
                        <p className="font-medium text-sm truncate">{existingAnimal.mother_id}</p>
                      </div>
                    </div>
                  )}
                  
                  {existingAnimal.father_id && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Padre</p>
                        <p className="font-medium text-sm truncate">{existingAnimal.father_id}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Additional Info Row */}
              {(existingAnimal.weight || existingAnimal.gender) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  {existingAnimal.weight && (
                    <div className="flex items-start gap-2">
                      <Weight className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Peso</p>
                        <p className="font-medium text-sm">{existingAnimal.weight} kg</p>
                      </div>
                    </div>
                  )}
                  
                  {existingAnimal.gender && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Género</p>
                      <p className="font-medium text-sm">{existingAnimal.gender}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full sm:w-auto order-3 sm:order-1 sm:mr-auto"
            size="sm"
          >
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          
          <Button
            variant="outline"
            onClick={onRegisterAnyway}
            className="w-full sm:w-auto order-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            size="sm"
          >
            Registrar de Todos Modos
          </Button>
          
          <Button
            onClick={onEditExisting}
            className="w-full sm:w-auto order-1 sm:order-3"
            size="sm"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar y Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

