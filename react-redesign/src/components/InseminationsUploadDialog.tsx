import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react'
import { apiService, InseminationRound, InseminationRoundBody } from '@/services/api'

interface InseminationsUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function InseminationsUploadDialog({ open, onOpenChange, onSuccess }: InseminationsUploadDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingRounds, setIsLoadingRounds] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [inseminationRounds, setInseminationRounds] = useState<InseminationRound[]>([])
  const [isCreatingRound, setIsCreatingRound] = useState(false)
  const [formData, setFormData] = useState({
    inseminationRoundId: '',
    newRoundId: new Date().getFullYear().toString(), // Default to current year
    initialDate: '',
    endDate: '',
    roundNotes: ''
  })

  // Fetch insemination rounds on mount
  useEffect(() => {
    if (open) {
      fetchInseminationRounds()
    }
  }, [open])

  const fetchInseminationRounds = async () => {
    setIsLoadingRounds(true)
    try {
      const rounds = await apiService.getInseminationRounds()
      setInseminationRounds(rounds || [])
    } catch (error: any) {
      console.error('Error fetching insemination rounds:', error)
      // Don't show error to user - just log it and show empty state
      setInseminationRounds([])
    } finally {
      setIsLoadingRounds(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const validExtensions = ['.csv', '.xlsx', '.xls']
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Por favor selecciona un archivo CSV o XLSX')
        setSelectedFile(null)
        return
      }
      
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    const input = document.getElementById('file-input') as HTMLInputElement
    if (input) input.value = ''
  }

  const handleCreateRound = async () => {
    if (!formData.newRoundId || !formData.initialDate || !formData.endDate) {
      setError('Por favor completa todos los campos requeridos para crear una nueva ronda')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const roundBody: InseminationRoundBody = {
        insemination_round_id: formData.newRoundId,
        initial_date: formData.initialDate,
        end_date: formData.endDate,
        notes: formData.roundNotes || undefined
      }

      await apiService.createInseminationRound(roundBody)
      await fetchInseminationRounds()
      
      setFormData(prev => ({
        ...prev,
        inseminationRoundId: formData.newRoundId,
        newRoundId: '',
        initialDate: '',
        endDate: '',
        roundNotes: ''
      }))
      setIsCreatingRound(false)
      setSuccess('Ronda de inseminación creada exitosamente')
    } catch (err: any) {
      setError(err.message || 'Error al crear la ronda de inseminación')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile) {
      setError('Por favor selecciona un archivo')
      return
    }

    // Determine which round ID to use
    let roundIdToUse = ''
    if (isCreatingRound) {
      // If creating new round, user must create it first
      if (!formData.newRoundId || !formData.initialDate || !formData.endDate) {
        setError('Por favor completa todos los campos para crear la ronda antes de subir')
        return
      }
      roundIdToUse = formData.newRoundId.trim()
    } else {
      // If selecting existing round, must have a selection
      if (!formData.inseminationRoundId) {
        setError('Por favor selecciona una ronda de inseminación existente o crea una nueva')
        return
      }
      roundIdToUse = formData.inseminationRoundId.trim()
    }

    if (!roundIdToUse) {
      setError('Por favor selecciona o crea una ronda de inseminación')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // If creating new round, create it first
      if (isCreatingRound && formData.newRoundId && formData.initialDate && formData.endDate) {
        try {
          const roundBody: InseminationRoundBody = {
            insemination_round_id: formData.newRoundId,
            initial_date: formData.initialDate,
            end_date: formData.endDate,
            notes: formData.roundNotes || undefined
          }
          await apiService.createInseminationRound(roundBody)
          await fetchInseminationRounds()
          setFormData(prev => ({ ...prev, inseminationRoundId: formData.newRoundId }))
          setIsCreatingRound(false)
        } catch (createError: any) {
          setError(createError.message || 'Error al crear la ronda. Por favor intenta nuevamente.')
          setIsLoading(false)
          return
        }
      }
      
      // Determine which round ID to use (now guaranteed to exist)
      const roundIdToUse = formData.inseminationRoundId.trim()
      
      if (!roundIdToUse) {
        setError('Por favor selecciona una ronda de inseminación')
        setIsLoading(false)
        return
      }
      
      const result = await apiService.uploadInseminations(
        selectedFile,
        roundIdToUse,
        formData.initialDate || undefined,
        formData.endDate || undefined
      )

      if (result.ok) {
        let successMessage = `¡Archivo subido exitosamente! ${result.uploaded || 0} inseminaciones registradas.`
        if (result.skipped) {
          successMessage += ` ${result.skipped} registros omitidos.`
        }
        if (result.warnings && result.warnings.length > 0) {
          successMessage += ` ${result.warnings[0]}`
        }
        setSuccess(successMessage)
        
        // Reset form
        setSelectedFile(null)
        setFormData({
          inseminationRoundId: '',
          newRoundId: new Date().getFullYear().toString(), // Reset to current year
          initialDate: '',
          endDate: '',
          roundNotes: ''
        })
        setIsCreatingRound(false)
        const input = document.getElementById('file-input') as HTMLInputElement
        if (input) input.value = ''

        // Call success callback
        if (onSuccess) {
          setTimeout(() => {
            onSuccess()
            onOpenChange(false)
          }, 2000)
        } else {
          setTimeout(() => {
            onOpenChange(false)
          }, 2000)
        }
      } else {
        setError(result.message || 'Error al subir el archivo')
      }
    } catch (err: any) {
      setError(err.message || 'Error al subir el archivo. Por favor verifica el formato y vuelve a intentar.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setFormData({
      inseminationRoundId: '',
      newRoundId: new Date().getFullYear().toString(), // Reset to current year
      initialDate: '',
      endDate: '',
      roundNotes: ''
    })
    setIsCreatingRound(false)
    setError(null)
    setSuccess(null)
    const input = document.getElementById('file-input') as HTMLInputElement
    if (input) input.value = ''
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-0">
        <DialogHeader>
          <DialogTitle>Registrar Inseminaciones</DialogTitle>
          <DialogDescription>
            Sube un archivo CSV o XLSX con las inseminaciones. El archivo debe contener: IDV (obligatorio), IDE (opcional), nombre del toro (obligatorio) y fecha (obligatorio).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file-input">Archivo (CSV o XLSX) *</Label>
            <div className="flex items-center gap-3">
              <Input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="flex-1"
                disabled={isLoading}
              />
              {selectedFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </span>
              </div>
            )}
          </div>

          {/* Insemination Round Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Ronda de Inseminación *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreatingRound(!isCreatingRound)}
                disabled={isLoading}
              >
                {isCreatingRound ? 'Seleccionar Existente' : 'Crear Nueva Ronda'}
              </Button>
            </div>

            {!isCreatingRound ? (
              <div className="space-y-2">
                {isLoadingRounds ? (
                  <div className="p-4 border rounded-lg bg-muted/30 text-center">
                    <p className="text-sm text-muted-foreground">Cargando rondas...</p>
                  </div>
                ) : inseminationRounds.length === 0 ? (
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground text-center">
                      No hay rondas de inseminación disponibles. Por favor haz clic en "Crear Nueva Ronda" para crear una.
                    </p>
                  </div>
                ) : (
                  <Select
                    value={formData.inseminationRoundId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, inseminationRoundId: value }))}
                    disabled={isLoading || isLoadingRounds}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una ronda existente" />
                    </SelectTrigger>
                    <SelectContent>
                      {inseminationRounds.map((round) => (
                        <SelectItem key={round.id} value={round.insemination_round_id}>
                          {round.insemination_round_id} ({round.initial_date} - {round.end_date})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="newRoundId">ID de la Ronda *</Label>
                  <Input
                    id="newRoundId"
                    value={formData.newRoundId}
                    onChange={(e) => setFormData(prev => ({ ...prev, newRoundId: e.target.value }))}
                    placeholder={new Date().getFullYear().toString()}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Típicamente es el año actual (ej: {new Date().getFullYear()})
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initialDate">Fecha Inicial *</Label>
                    <Input
                      id="initialDate"
                      type="date"
                      value={formData.initialDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, initialDate: e.target.value }))}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Fecha Final *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roundNotes">Notas (opcional)</Label>
                  <Input
                    id="roundNotes"
                    value={formData.roundNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, roundNotes: e.target.value }))}
                    placeholder="Notas adicionales sobre esta ronda"
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateRound}
                  disabled={isLoading || !formData.newRoundId || !formData.initialDate || !formData.endDate}
                  className="w-full"
                >
                  Crear Ronda
                </Button>
              </div>
            )}
          </div>


          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={
                isLoading || 
                !selectedFile || 
                (!formData.inseminationRoundId && !isCreatingRound) ||
                (isCreatingRound && !formData.newRoundId)
              }
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir Archivo
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

