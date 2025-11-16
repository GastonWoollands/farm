/**
 * Chatbot component - Minimalist sidebar for LLM-based SQL queries
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { chatbotService, ChatbotMessage } from '@/services/chatbot'

interface ChatbotProps {
  companyId: number | null
}

export function Chatbot({ companyId }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatbotMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when messages change or loading state changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load history from service
  useEffect(() => {
    if (isOpen) {
      setMessages(chatbotService.getHistory())
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!question.trim() || isLoading) return

    // Dismiss keyboard on mobile
    if (inputRef.current) {
      inputRef.current.blur()
    }

    const userQuestion = question.trim()
    setQuestion('')
    setIsLoading(true)

    // Add user message immediately
    const userMessage: ChatbotMessage = { user: userQuestion, bot: '' }
    setMessages(prev => [...prev, userMessage])

    try {
      const response = await chatbotService.ask(userQuestion)
      
      // Update messages with bot response
      setMessages(response.history)
    } catch (error: any) {
      // Add error message
      const errorMessage: ChatbotMessage = {
        user: userQuestion,
        bot: `Error: ${error.message || 'Failed to get response'}`
      }
      setMessages(prev => [...prev.slice(0, -1), errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    chatbotService.clearHistory()
    setMessages([])
  }

  return (
    <>
      {/* Floating button - bottom right, mobile-optimized */}
      <Button
        onClick={() => {
          if (companyId) {
            setIsOpen(true)
          }
        }}
        className="fixed right-4 bottom-24 z-40 h-14 w-14 sm:h-12 sm:w-12 rounded-full shadow-lg hover:shadow-xl transition-all touch-manipulation"
        style={{
          bottom: 'max(6rem, calc(6rem + env(safe-area-inset-bottom, 0px)))',
          touchAction: 'manipulation'
        }}
        size="icon"
        aria-label="Open chatbot"
        title={companyId ? "Abrir asistente" : "Asistente no disponible (sin compañía)"}
        disabled={!companyId}
      >
        <MessageCircle className="h-5 w-5 sm:h-5 sm:w-5" />
      </Button>

      {/* Sidebar drawer - only show if companyId exists */}
      {isOpen && companyId && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar - responsive width, mobile-optimized */}
          <div 
            className="fixed left-0 top-0 w-full sm:max-w-md bg-background border-r shadow-xl flex flex-col animate-in slide-in-from-left duration-300 z-50"
            style={{
              height: '100dvh', // Dynamic viewport height for mobile (falls back to 100vh)
              maxHeight: '100dvh'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - sticky on mobile */}
            <div className="flex items-center justify-between p-4 border-b bg-background flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Asistente</h2>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClear()
                    }}
                    className="text-xs"
                  >
                    Limpiar
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsOpen(false)
                  }}
                  className="relative z-10"
                  aria-label="Cerrar chatbot"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages - scrollable area with proper mobile handling */}
            <div 
              className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0"
              style={{
                WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
                scrollBehavior: 'smooth'
              }}
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
                  <div className="space-y-3">
                    <MessageCircle className="h-10 w-10 mx-auto opacity-50" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Asistente de Datos</p>
                      <p className="text-xs opacity-75">
                        Haz preguntas sobre tu granja en lenguaje natural
                      </p>
                    </div>
                    <div className="pt-4 space-y-1 text-xs opacity-60">
                      <p className="font-medium mb-2">Ejemplos de preguntas:</p>
                      <p className="font-semibold mt-2">Métricas:</p>
                      <p>"¿Qué es Total Animales?"</p>
                      <p>"¿Cuál es la diferencia entre Total Animales y Madres Activas?"</p>
                      <p>"¿Cuál es el peso promedio?"</p>
                      <p className="font-semibold mt-2">Datos:</p>
                      <p>"¿Cuántos animales tengo registrados?"</p>
                      <p>"Dame los terneros de mayor peso"</p>
                      <p>"¿Cuántas inseminaciones hay en 2025?"</p>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className="space-y-2">
                    {/* User message */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[80%] rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-sm break-words">
                        {msg.user}
                      </div>
                    </div>
                    {/* Bot message */}
                    {msg.bot && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] sm:max-w-[80%] rounded-lg bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap border break-words">
                          {msg.bot}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input - sticky at bottom, always visible on mobile */}
            <form 
              onSubmit={handleSubmit} 
              className="p-4 border-t bg-background flex-shrink-0 chatbot-input-container"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))'
              }}
              onKeyDown={(e) => {
                // Prevent form submission on Enter (handled in textarea)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                }
              }}
            >
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Pregunta sobre tus datos..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2.5 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-32"
                  style={{ 
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    fontSize: '16px', // Prevent iOS zoom on focus
                    WebkitAppearance: 'none', // Remove iOS styling
                    borderRadius: '6px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  onInput={(e) => {
                    // Auto-resize textarea
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`
                  }}
                />
                <Button
                  type="submit"
                  disabled={!question.trim() || isLoading}
                  size="icon"
                  className="flex-shrink-0 h-10 w-10 min-h-[44px] min-w-[44px] touch-manipulation"
                  aria-label="Enviar mensaje"
                  style={{
                    touchAction: 'manipulation' // Better touch handling on mobile
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

