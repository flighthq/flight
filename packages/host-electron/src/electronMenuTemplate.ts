import type { ElectronMenuItemOptions, ElectronMenuItemRole, MenuItemTemplate } from '@flighthq/types/contract';

// Recursively maps Flight's open menu descriptor onto Electron's closed role enum. Unknown vendor
// roles are intentionally omitted; the two differently-spelled built-ins map to Electron's spelling.
export function toElectronTemplate(
  items: readonly MenuItemTemplate[],
  onSelect?: (id: string) => void,
): ElectronMenuItemOptions[] {
  return items.map((item) => {
    const options: ElectronMenuItemOptions = {
      accelerator: item.accelerator,
      checked: item.checked,
      enabled: item.enabled,
      id: item.id,
      label: item.label,
      role: toElectronRole(item.role),
      type: item.type,
    };
    if (item.submenu) {
      options.submenu = toElectronTemplate(item.submenu, onSelect);
    } else if (onSelect && item.id !== undefined) {
      options.click = () => onSelect(item.id!);
    }
    return options;
  });
}

const electronRoles: ReadonlySet<string> = new Set<ElectronMenuItemRole>([
  'about',
  'appMenu',
  'clearRecentDocuments',
  'close',
  'copy',
  'cut',
  'delete',
  'editMenu',
  'fileMenu',
  'forceReload',
  'front',
  'help',
  'hide',
  'hideOthers',
  'mergeAllWindows',
  'minimize',
  'moveTabToNewWindow',
  'paste',
  'pasteAndMatchStyle',
  'quit',
  'recentDocuments',
  'redo',
  'reload',
  'resetZoom',
  'selectAll',
  'selectNextTab',
  'selectPreviousTab',
  'services',
  'shareMenu',
  'showAllTabs',
  'startSpeaking',
  'stopSpeaking',
  'toggleDevTools',
  'toggleSpellChecker',
  'toggleTabBar',
  'togglefullscreen',
  'undo',
  'unhide',
  'viewMenu',
  'window',
  'windowMenu',
  'zoom',
  'zoomIn',
  'zoomOut',
]);

function toElectronRole(role: MenuItemTemplate['role']): ElectronMenuItemRole | undefined {
  if (role === 'toggleFullscreen') return 'togglefullscreen';
  if (role === 'helpMenu') return 'help';
  return role !== undefined && electronRoles.has(role) ? (role as ElectronMenuItemRole) : undefined;
}
