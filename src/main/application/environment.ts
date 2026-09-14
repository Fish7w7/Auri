import { join } from 'node:path'
import type { App } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'
import { APP_USER_MODEL_ID } from '../app/app-identity'
import { isNativeBridgeStartup } from '../app/native-bridge-startup'
import { separateDevelopmentUserData } from '../app/user-data-path'

export interface MainProcessEnvironment {
  isApplicationSmoke: boolean
  isScreenshotSmoke: boolean
  isSettingsScrollSmoke: boolean
  isBackupSmoke: boolean
  isReleasePersistenceSmoke: boolean
  isReleaseBackupRestoreSmoke: boolean
  isReleaseDataSmoke: boolean
  isAutomatedRuntime: boolean
  isNativeBridgeStart: boolean
}

export function configureMainProcessEnvironment(app: App, commandLine: readonly string[]): MainProcessEnvironment {
  const environment = resolveMainProcessEnvironment(commandLine)

  app.setName(APP_BRAND.name)
  separateDevelopmentUserData(app)
  app.setAppUserModelId(APP_USER_MODEL_ID)

  if (environment.isAutomatedRuntime) {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('in-process-gpu')
    app.setPath('userData', join(app.getPath('temp'), resolveAutomatedUserDataDirectory(environment)))
  }

  return environment
}

export function resolveMainProcessEnvironment(commandLine: readonly string[]): MainProcessEnvironment {
  const isApplicationSmoke = commandLine.includes('--smoke-test')
  const isScreenshotSmoke = commandLine.includes('--screenshot-test')
  const isSettingsScrollSmoke = commandLine.includes('--settings-scroll-test')
  const isBackupSmoke = commandLine.includes('--backup-smoke-test')
  const isReleasePersistenceSmoke = commandLine.includes('--release-persistence-smoke-test')
  const isReleaseBackupRestoreSmoke = commandLine.includes('--release-backup-restore-test')
  const isReleaseDataSmoke = isReleasePersistenceSmoke || isReleaseBackupRestoreSmoke
  const isAutomatedRuntime = isApplicationSmoke || isScreenshotSmoke || isSettingsScrollSmoke || isBackupSmoke || isReleaseDataSmoke
  return {
    isApplicationSmoke,
    isScreenshotSmoke,
    isSettingsScrollSmoke,
    isBackupSmoke,
    isReleasePersistenceSmoke,
    isReleaseBackupRestoreSmoke,
    isReleaseDataSmoke,
    isAutomatedRuntime,
    isNativeBridgeStart: isNativeBridgeStartup(commandLine)
  }
}

function resolveAutomatedUserDataDirectory(environment: MainProcessEnvironment): string {
  if (environment.isScreenshotSmoke) return 'auri-screenshot-test'
  if (environment.isSettingsScrollSmoke) return 'auri-settings-scroll-test'
  if (environment.isBackupSmoke) return 'auri-backup-smoke-test'
  if (environment.isReleasePersistenceSmoke) return 'auri-release-persistence-test'
  if (environment.isReleaseBackupRestoreSmoke) return 'auri-release-backup-restore-test'
  return 'auri-smoke-test'
}
