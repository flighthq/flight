// The documented set of well-known MenuItemRole string values. MenuItemRole is an open contract
// (type MenuItemRole = string), so custom roles are allowed; vendor-prefix them to avoid collisions
// with future built-in roles (e.g. 'acme.myRole'). Backends ignore roles they do not recognize.
//
// Platform support matrix:
//   macOS-only:       hide, hideOthers, unhide, front, services, startSpeaking, stopSpeaking,
//                     toggleTabBar, selectNextTab, selectPreviousTab, mergeAllWindows,
//                     moveTabToNewWindow, recentDocuments, clearRecentDocuments, shareMenu,
//                     toggleSpellChecker
//   Windows/Linux:    quit, minimize, close
//   Electron desktop: zoom, zoomIn, zoomOut, resetZoom, reload, forceReload, toggleDevTools,
//                     toggleFullscreen
//   All platforms:    undo, redo, cut, copy, paste, delete, selectAll, about, help,
//                     pasteAndMatchStyle
//
// Whole-submenu roles (set on a submenu container to let native hosts substitute a platform menu):
//   appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu, recentDocuments, shareMenu
export const WellKnownMenuItemRole = {
  // --- Edit ---
  copy: 'copy',
  cut: 'cut',
  delete: 'delete',
  paste: 'paste',
  pasteAndMatchStyle: 'pasteAndMatchStyle',
  redo: 'redo',
  selectAll: 'selectAll',
  toggleSpellChecker: 'toggleSpellChecker',
  undo: 'undo',
  // --- App / Window ---
  about: 'about',
  close: 'close',
  front: 'front',
  hide: 'hide',
  hideOthers: 'hideOthers',
  mergeAllWindows: 'mergeAllWindows',
  minimize: 'minimize',
  moveTabToNewWindow: 'moveTabToNewWindow',
  quit: 'quit',
  selectNextTab: 'selectNextTab',
  selectPreviousTab: 'selectPreviousTab',
  toggleTabBar: 'toggleTabBar',
  unhide: 'unhide',
  zoom: 'zoom',
  // --- View ---
  forceReload: 'forceReload',
  reload: 'reload',
  resetZoom: 'resetZoom',
  toggleDevTools: 'toggleDevTools',
  toggleFullscreen: 'toggleFullscreen',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  // --- Help / Services (macOS) ---
  help: 'help',
  services: 'services',
  startSpeaking: 'startSpeaking',
  stopSpeaking: 'stopSpeaking',
  // --- Recent documents (macOS) ---
  clearRecentDocuments: 'clearRecentDocuments',
  recentDocuments: 'recentDocuments',
  // --- Whole-submenu roles (native backends substitute a platform-standard menu) ---
  appMenu: 'appMenu',
  editMenu: 'editMenu',
  fileMenu: 'fileMenu',
  helpMenu: 'helpMenu',
  shareMenu: 'shareMenu',
  viewMenu: 'viewMenu',
  windowMenu: 'windowMenu',
};

export type WellKnownMenuItemRoleValue = (typeof WellKnownMenuItemRole)[keyof typeof WellKnownMenuItemRole];
