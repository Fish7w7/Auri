import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readStoredSettings, SettingsService } from '@main/services/settings-service'
import { TestLogger } from '../fixtures/test-logger'

describe('SettingsService', () => {
  let directory: string | undefined
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })

  it('usa defaults e persiste preferências apenas em diretório temporário', () => {
    directory = mkdtempSync(join(tmpdir(), 'auri-settings-'))
    const path = join(directory, 'settings.json')
    const service = new SettingsService(path, new TestLogger())
    expect(service.getSettings()).toMatchObject({ libraryView: 'grid', librarySort: 'last_read_desc', closeToTray: false })
    expect(service.updateSettings({ libraryView: 'list', sidebarCompact: true })).toMatchObject({ libraryView: 'list', sidebarCompact: true })
    expect(service.updateSettings({ cardSize: 'small' })).toMatchObject({ cardSize: 'small', libraryView: 'list', sidebarCompact: true })
    expect(service.updateSettings({ librarySort: 'user_status', coverCacheMaxMb: 750, backupAutomatic: false, backupFrequency: 'weekly', backupRetention: 20 })).toMatchObject({
      libraryView: 'list',
      librarySort: 'user_status',
      cardSize: 'small',
      sidebarCompact: true,
      coverCacheMaxMb: 750,
      backupAutomatic: false,
      backupFrequency: 'weekly',
      backupRetention: 20
    })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ libraryView: 'list', librarySort: 'user_status', cardSize: 'small', sidebarCompact: true, coverCacheMaxMb: 750, backupAutomatic: false, backupFrequency: 'weekly', backupRetention: 20 })
  })

  it('persiste closeToTray e aceita settings legado sem o campo', () => {
    directory = mkdtempSync(join(tmpdir(), 'auri-settings-tray-'))
    const path = join(directory, 'settings.json')
    writeFileSync(path, JSON.stringify({ libraryView: 'list', sidebarCompact: true }), 'utf8')
    const service = new SettingsService(path, new TestLogger())
    const changes: boolean[] = []
    const unsubscribe = service.onDidChange((settings) => changes.push(settings.closeToTray))

    expect(service.getSettings()).toMatchObject({ libraryView: 'list', sidebarCompact: true, closeToTray: false })
    expect(service.updateSettings({ closeToTray: true }).closeToTray).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ closeToTray: true })
    expect(service.updateSettings({ closeToTray: false }).closeToTray).toBe(false)
    expect(changes).toEqual([true, false])

    unsubscribe()
  })

  it('mantém a introdução em perfis legados e aplica o modo rápido na próxima abertura', () => {
    directory = mkdtempSync(join(tmpdir(), 'auri-settings-intro-'))
    const path = join(directory, 'settings.json')
    writeFileSync(path, JSON.stringify({ closeToTray: true }), 'utf8')
    const service = new SettingsService(path, new TestLogger())

    expect(readStoredSettings(path).cinematicIntro).toBe(true)
    service.updateSettings({ cinematicIntro: false })
    expect(readStoredSettings(path)).toMatchObject({ cinematicIntro: false, closeToTray: true })
  })

  it('normaliza HomePreferences e Recentes sem migration de banco', () => {
    directory = mkdtempSync(join(tmpdir(), 'auri-settings-home-'))
    const path = join(directory, 'settings.json')
    writeFileSync(path, JSON.stringify({
      libraryView: 'grid',
      homePreferences: { sectionOrder: ['favorites', 'desconhecida'], enabledSections: { favorites: false }, pinnedCollectionIds: ['one', 'one'] },
      recentWorkIds: Array.from({ length: 25 }, (_, index) => `work-${index}`)
    }), 'utf8')
    const settings = new SettingsService(path, new TestLogger()).getSettings()
    expect(settings.homePreferences.sectionOrder).toEqual(['favorites', 'continueReading', 'recent', 'recentlyAdded', 'one'])
    expect(settings.homePreferences.enabledSections).toEqual({ continueReading: true, recent: true, favorites: false, recentlyAdded: false })
    expect(settings.homePreferences.pinnedCollectionIds).toEqual(['one'])
    expect(settings.recentWorkIds).toHaveLength(20)
  })
})
