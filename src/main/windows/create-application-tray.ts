import { Menu, nativeImage, Tray } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'
import { resolveWindowIcon } from './create-main-window'
import type { TrayActions } from './window-tray-controller'

export function createApplicationTray(actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(resolveWindowIcon()).resize({ width: 20, height: 20 })
  const tray = new Tray(icon)
  tray.setToolTip(APP_BRAND.name)
  tray.on('click', actions.open)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Auri', click: actions.open },
    { type: 'separator' },
    { label: 'Sair do Auri', click: actions.quit }
  ]))
  return tray
}
