/**
 * Chatbot component - Minimalist sidebar for LLM-based SQL queries
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      {/* Floating button - bottom right */}
      <Button
        onClick={() => {
          if (companyId) {
            setIsOpen(true)
          }
        }}
        className="fixed right-4 bottom-24 z-40 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
        size="icon"
        aria-label="Open chatbot"
        title={companyId ? "Abrir asistente SQL" : "Asistente SQL no disponible (sin compañía)"}
        disabled={!companyId}
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      {/* Sidebar drawer - only show if companyId exists */}
      {isOpen && companyId && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar - responsive width */}
          <div 
            className="fixed left-0 top-0 h-full w-full sm:max-w-md bg-background border-r shadow-xl flex flex-col animate-in slide-in-from-left duration-300 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Asistente SQL</h2>
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
                  <div className="space-y-3">
                    <MessageCircle className="h-10 w-10 mx-auto opacity-50" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Asistente SQL</p>
                      <p className="text-xs opacity-75">
                        Haz preguntas sobre tus datos en lenguaje natural
                      </p>
                    </div>
                    <div className="pt-4 space-y-1 text-xs opacity-60">
                      <p>Ejemplos:</p>
                      <p>"¿Cuántos registros hay?"</p>
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
                      <div className="max-w-[80%] rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-sm">
                        {msg.user}
                      </div>
                    </div>
                    {/* Bot message */}
                    {msg.bot && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap border">
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

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Pregunta sobre tus datos..."
                  disabled={isLoading}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={!question.trim() || isLoading}
                  size="icon"
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

