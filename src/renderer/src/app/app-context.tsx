import { createContext, useContext } from 'react'
import type { AppSettings, LibrarySummary, UpdateSettingsRequest } from '@shared/contracts'

export interface AppContextValue {
  settings: AppSettings
  summary: LibrarySummary
  updateSettings(patch: UpdateSettingsRequest): Promise<void>
  refreshData(): void
  openAddWork(): void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext precisa estar dentro de AppContext.')
  return context
}

