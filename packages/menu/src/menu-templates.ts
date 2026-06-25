import type { MenuItemTemplate } from '@flighthq/types';
import { WellKnownMenuItemRole } from '@flighthq/types';

// Returns a standard macOS-style application menu (the first menu, labeled with the app name).
// On Windows/Linux this menu is typically omitted; native backends handle that automatically when
// the whole-submenu role 'appMenu' is set. Includes About, Services, Hide/Show, and Quit.
export function createDefaultAppMenuTemplate(appName: string): MenuItemTemplate {
  return {
    label: appName,
    role: WellKnownMenuItemRole.appMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'about',
        label: `About ${appName}`,
        role: WellKnownMenuItemRole.about,
        type: 'normal',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'services',
        label: 'Services',
        role: WellKnownMenuItemRole.services,
        type: 'submenu',
        submenu: [],
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'hide',
        label: `Hide ${appName}`,
        role: WellKnownMenuItemRole.hide,
        accelerator: 'CmdOrCtrl+H',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'hideOthers',
        label: 'Hide Others',
        role: WellKnownMenuItemRole.hideOthers,
        accelerator: 'CmdOrCtrl+Alt+H',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'unhide',
        label: 'Show All',
        role: WellKnownMenuItemRole.unhide,
        type: 'normal',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'quit',
        label: `Quit ${appName}`,
        role: WellKnownMenuItemRole.quit,
        accelerator: 'CmdOrCtrl+Q',
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}

// Returns a standard Edit menu template with common text-editing operations. The whole-submenu
// role 'editMenu' is set so native hosts (Electron/Tauri) can substitute their own platform-native
// Edit menu where that is more appropriate. Items are also individually role-tagged for finer
// native control.
export function createDefaultEditMenuTemplate(): MenuItemTemplate {
  return {
    label: 'Edit',
    role: WellKnownMenuItemRole.editMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'undo',
        label: 'Undo',
        role: WellKnownMenuItemRole.undo,
        accelerator: 'CmdOrCtrl+Z',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'redo',
        label: 'Redo',
        role: WellKnownMenuItemRole.redo,
        accelerator: 'Shift+CmdOrCtrl+Z',
        type: 'normal',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'cut',
        label: 'Cut',
        role: WellKnownMenuItemRole.cut,
        accelerator: 'CmdOrCtrl+X',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'copy',
        label: 'Copy',
        role: WellKnownMenuItemRole.copy,
        accelerator: 'CmdOrCtrl+C',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'paste',
        label: 'Paste',
        role: WellKnownMenuItemRole.paste,
        accelerator: 'CmdOrCtrl+V',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'pasteAndMatchStyle',
        label: 'Paste and Match Style',
        role: WellKnownMenuItemRole.pasteAndMatchStyle,
        accelerator: 'Shift+CmdOrCtrl+V',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'delete',
        label: 'Delete',
        role: WellKnownMenuItemRole.delete,
        type: 'normal',
        enabled: true,
      },
      {
        id: 'selectAll',
        label: 'Select All',
        role: WellKnownMenuItemRole.selectAll,
        accelerator: 'CmdOrCtrl+A',
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}

// Returns a standard File menu template. The whole-submenu role 'fileMenu' signals native backends
// to place the menu in the standard File slot. Includes New, Open, Save, Save As, and Close.
export function createDefaultFileMenuTemplate(): MenuItemTemplate {
  return {
    label: 'File',
    role: WellKnownMenuItemRole.fileMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'newFile',
        label: 'New',
        type: 'normal',
        accelerator: 'CmdOrCtrl+N',
        enabled: true,
      },
      {
        id: 'openFile',
        label: 'Open…',
        type: 'normal',
        accelerator: 'CmdOrCtrl+O',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'saveFile',
        label: 'Save',
        type: 'normal',
        accelerator: 'CmdOrCtrl+S',
        enabled: true,
      },
      {
        id: 'saveFileAs',
        label: 'Save As…',
        type: 'normal',
        accelerator: 'Shift+CmdOrCtrl+S',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'closeFile',
        label: 'Close',
        role: WellKnownMenuItemRole.close,
        accelerator: 'CmdOrCtrl+W',
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}

// Returns a standard Help menu template. The whole-submenu role 'helpMenu' signals native backends
// to place the menu in the standard Help slot (macOS help-menu convention).
export function createDefaultHelpMenuTemplate(): MenuItemTemplate {
  return {
    label: 'Help',
    role: WellKnownMenuItemRole.helpMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'help',
        label: 'Search',
        role: WellKnownMenuItemRole.help,
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}

// Returns a standard View menu template covering reload and zoom. The whole-submenu role 'viewMenu'
// signals native backends to substitute a platform-native View menu where appropriate.
export function createDefaultViewMenuTemplate(): MenuItemTemplate {
  return {
    label: 'View',
    role: WellKnownMenuItemRole.viewMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'reload',
        label: 'Reload',
        role: WellKnownMenuItemRole.reload,
        accelerator: 'CmdOrCtrl+R',
        type: 'normal',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'resetZoom',
        label: 'Actual Size',
        role: WellKnownMenuItemRole.resetZoom,
        accelerator: 'CmdOrCtrl+0',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'zoomIn',
        label: 'Zoom In',
        role: WellKnownMenuItemRole.zoomIn,
        accelerator: 'CmdOrCtrl+Plus',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'zoomOut',
        label: 'Zoom Out',
        role: WellKnownMenuItemRole.zoomOut,
        accelerator: 'CmdOrCtrl+-',
        type: 'normal',
        enabled: true,
      },
      { type: 'separator', enabled: true },
      {
        id: 'toggleFullscreen',
        label: 'Toggle Full Screen',
        role: WellKnownMenuItemRole.toggleFullscreen,
        accelerator: 'F11',
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}

// Returns a standard Window menu template. The whole-submenu role 'windowMenu' signals native
// backends (notably macOS) to manage the Window menu list automatically.
export function createDefaultWindowMenuTemplate(): MenuItemTemplate {
  return {
    label: 'Window',
    role: WellKnownMenuItemRole.windowMenu,
    type: 'submenu',
    submenu: [
      {
        id: 'minimize',
        label: 'Minimize',
        role: WellKnownMenuItemRole.minimize,
        accelerator: 'CmdOrCtrl+M',
        type: 'normal',
        enabled: true,
      },
      {
        id: 'close',
        label: 'Close',
        role: WellKnownMenuItemRole.close,
        accelerator: 'CmdOrCtrl+W',
        type: 'normal',
        enabled: true,
      },
    ],
    enabled: true,
  };
}
