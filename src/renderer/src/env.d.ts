/// <reference types="vite/client" />

import type { LumiApi } from '@shared/contracts'

declare global {
  interface Window {
    lumi: LumiApi
  }
}

export {}

