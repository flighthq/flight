// Native application and context menu seam. Free functions in @flighthq/menu delegate to the active
// MenuBackend (web default or a native host's). Web has no native menu bar or OS context menu, so the
// web backend returns false / null sentinels rather than throwing — native menus require a native host
// (Electron/Tauri); a real web context-menu renderer is out of scope for the MVP.
export type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';

export type MenuItemRole =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'quit'
  | 'minimize'
  | 'close'
  | 'reload'
  | 'toggleFullscreen'
  | 'about';

export interface MenuItemTemplate {
  id?: string;
  label?: string;
  type?: MenuItemType;
  role?: MenuItemRole;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: MenuItemTemplate[];
}

export interface MenuBackend {
  setApplicationMenu(items: readonly MenuItemTemplate[]): boolean;
  popupContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null>;
  subscribeSelect(listener: (id: string) => void): () => void;
}
