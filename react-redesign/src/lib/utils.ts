import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility functions for data formatting
export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function formatWeight(weight: number): string {
  return `${weight.toFixed(1)} kg`
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

export function normalizeString(str: string | null | undefined): string | null {
  if (!str || str.trim() === '') return null
  return str.trim().toUpperCase()
}

// Animal type helpers
export function getAnimalTypeName(type: number): string {
  const types = {
    1: 'Vaca',
    2: 'Toro',
    3: 'Becerro'
  }
  return types[type as keyof typeof types] || 'Desconocido'
}

export function getGenderName(gender: string): string {
  const genders = {
    'MALE': 'Macho',
    'FEMALE': 'Hembra',
    'UNKNOWN': 'Desconocido'
  }
  return genders[gender as keyof typeof genders] || gender
}

export function getStatusName(status: string): string {
  const statuses = {
    'ALIVE': 'Vivo',
    'DEAD': 'Muerto',
    'UNKNOWN': 'Desconocido'
  }
  return statuses[status as keyof typeof statuses] || status
}
