/**
 * Chatbot service for LLM-based SQL queries
 */

import { apiService } from './api'

export interface ChatbotMessage {
  user: string
  bot: string
}

export interface ChatbotResponse {
  final_answer: string
  history: ChatbotMessage[]
  sql?: string
  error?: string
  question: string
  success: boolean
}

class ChatbotService {
  private history: ChatbotMessage[] = []

  /**
   * Ask a question to the chatbot
   */
  async ask(question: string): Promise<ChatbotResponse> {
    try {
      const response = await apiService.askChatbot(question, this.history)
      
      // Update local history
      this.history = response.history
      
      return response
    } catch (error: any) {
      return {
        final_answer: `Error: ${error.message || 'Failed to get response'}`,
        history: this.history,
        question,
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): ChatbotMessage[] {
    return this.history
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = []
  }

  /**
   * Set conversation history
   */
  setHistory(history: ChatbotMessage[]): void {
    this.history = history
  }
}

export const chatbotService = new ChatbotService()

