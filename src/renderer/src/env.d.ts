/// <reference types="vite/client" />

import type { AuriApi } from '@shared/contracts'

declare global {
  interface Window {
    auri: AuriApi
  }
}

export {}

