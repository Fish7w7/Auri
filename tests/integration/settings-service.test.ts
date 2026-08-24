import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsService } from '@main/services/settings-service'
import { TestLogger } from '../helpers/test-logger'

describe('SettingsService', () => {
  let directory: string | undefined
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })

  it('usa defaults e persiste preferências apenas em diretório temporário', () => {
    directory = mkdtempSync(join(tmpdir(), 'auri-settings-'))
    const path = join(directory, 'settings.json')
    const service = new SettingsService(path, new TestLogger())
    expect(service.getSettings()).toMatchObject({ libraryView: 'grid', librarySort: 'last_read_desc' })
    expect(service.updateSettings({ libraryView: 'list', sidebarCompact: true })).toMatchObject({ libraryView: 'list', sidebarCompact: true })
    expect(service.updateSettings({ cardSize: 'small' })).toMatchObject({ cardSize: 'small', libraryView: 'list', sidebarCompact: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ libraryView: 'list', sidebarCompact: true })
  })
})
