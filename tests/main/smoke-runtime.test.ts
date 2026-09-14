import { describe, expect, it } from 'vitest'
import type { MainProcessEnvironment } from '@main/application/environment'
import { createSmokeAppContextOptions } from '@main/smoke/smoke-runtime'

const base = {
  isApplicationSmoke: false,
  isScreenshotSmoke: false,
  isSettingsScrollSmoke: false,
  isBackupSmoke: false,
  isReleasePersistenceSmoke: false,
  isReleaseBackupRestoreSmoke: false,
  isReleaseDataSmoke: false,
  isAutomatedRuntime: false,
  isNativeBridgeStart: false
} satisfies MainProcessEnvironment

describe('runtime isolado dos smokes', () => {
  it('carrega fixtures somente nos runners que já dependiam delas', () => {
    expect(createSmokeAppContextOptions(base)).toEqual({})
    expect(createSmokeAppContextOptions({ ...base, isApplicationSmoke: true, isAutomatedRuntime: true })).toMatchObject({
      metadataProviders: expect.any(Array),
      coverClient: expect.any(Object),
      pageFetcher: expect.any(Object)
    })
    expect(createSmokeAppContextOptions({ ...base, isScreenshotSmoke: true, isAutomatedRuntime: true })).toMatchObject({
      updater: expect.any(Object),
      updaterEnvironment: { isPackaged: true, isConfigured: true }
    })
  })
})
