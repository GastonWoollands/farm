import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from 'lucide-react'
import { authService, AuthUser } from '@/services/auth'

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser) => void
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (isSignUp) {
        if (formData.password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres.')
          setIsLoading(false)
          return
        }
        const user = await authService.signUp(formData.email, formData.password)
        onAuthSuccess(user)
      } else {
        const user = await authService.signIn(formData.email, formData.password)
        onAuthSuccess(user)
      }
    } catch (err: any) {
      setError(err.message || 'Error de autenticación. Intenta nuevamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setError('Por favor ingresa tu email para restablecer la contraseña.')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await authService.resetPassword(formData.email)
      setSuccess('Se ha enviado un email de restablecimiento a tu correo.')
    } catch (err: any) {
      setError(err.message || 'Error al enviar el email de restablecimiento.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
    // Clear messages when user starts typing
    if (error) setError(null)
    if (success) setSuccess(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">LiveStock</CardTitle>
            <CardDescription>
              {isSignUp ? 'Crea tu cuenta para comenzar' : 'Inicia sesión para continuar'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Nombre completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    name="displayName"
                    type="text"
                    placeholder="Tu nombre completo"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="pl-10 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                isSignUp ? 'Crear cuenta' : 'Iniciar sesión'
              )}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm"
              >
                {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí'}
              </Button>
            </div>

            {!isSignUp && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm text-muted-foreground"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                >
                  ¿Olvidaste tu contraseña?
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
