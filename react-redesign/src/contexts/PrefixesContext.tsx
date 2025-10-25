import { createContext, useContext, useState, ReactNode } from 'react'

interface Prefixes {
  animalPrefix: string
  motherPrefix: string
  fatherPrefix: string
}

interface PrefixesContextType {
  prefixes: Prefixes
  setPrefixes: (prefixes: Prefixes) => void
  updatePrefix: (key: keyof Prefixes, value: string) => void
}

const PrefixesContext = createContext<PrefixesContextType | undefined>(undefined)

export function PrefixesProvider({ children }: { children: ReactNode }) {
  const [prefixes, setPrefixes] = useState<Prefixes>({
    animalPrefix: 'AC988',
    motherPrefix: 'AC988',
    fatherPrefix: ''
  })

  const updatePrefix = (key: keyof Prefixes, value: string) => {
    setPrefixes(prev => ({
      ...prev,
      [key]: value
    }))
  }

  return (
    <PrefixesContext.Provider value={{ prefixes, setPrefixes, updatePrefix }}>
      {children}
    </PrefixesContext.Provider>
  )
}

export function usePrefixes() {
  const context = useContext(PrefixesContext)
  if (context === undefined) {
    throw new Error('usePrefixes must be used within a PrefixesProvider')
  }
  return context
}
