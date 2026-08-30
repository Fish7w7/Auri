import { join } from 'node:path'
import type { App } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'

export function resolveApplicationUserDataPath(appDataPath: string, isPackaged: boolean): string {
  return join(appDataPath, isPackaged ? APP_BRAND.name : `${APP_BRAND.name}-Dev`)
}

export function separateDevelopmentUserData(app: Pick<App, 'isPackaged' | 'getPath' | 'setPath'>): void {
  if (app.isPackaged) return
  app.setPath('userData', resolveApplicationUserDataPath(app.getPath('appData'), false))
}
