import type { MenuItemTemplate } from '@flighthq/types';

import {
  createDefaultAppMenuTemplate,
  createDefaultEditMenuTemplate,
  createDefaultFileMenuTemplate,
  createDefaultHelpMenuTemplate,
  createDefaultViewMenuTemplate,
  createDefaultWindowMenuTemplate,
} from './menu-templates';

function collectIds(items: readonly MenuItemTemplate[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.id !== undefined) ids.push(item.id);
    if (item.submenu !== undefined) ids.push(...collectIds(item.submenu));
  }
  return ids;
}

describe('createDefaultAppMenuTemplate', () => {
  it('returns a submenu template with the app name as label', () => {
    const menu = createDefaultAppMenuTemplate('MyApp');
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('MyApp');
    expect(menu.role).toBe('appMenu');
  });
  it('includes about, hide, quit items with app name interpolation', () => {
    const menu = createDefaultAppMenuTemplate('MyApp');
    const sub = menu.submenu!;
    const about = sub.find((i) => i.id === 'about');
    const quit = sub.find((i) => i.id === 'quit');
    const hide = sub.find((i) => i.id === 'hide');
    expect(about?.label).toBe('About MyApp');
    expect(quit?.label).toBe('Quit MyApp');
    expect(hide?.label).toBe('Hide MyApp');
  });
  it('includes accelerators for hide and quit', () => {
    const menu = createDefaultAppMenuTemplate('MyApp');
    const sub = menu.submenu!;
    const quit = sub.find((i) => i.id === 'quit');
    const hide = sub.find((i) => i.id === 'hide');
    expect(quit?.accelerator).toBeDefined();
    expect(hide?.accelerator).toBeDefined();
  });
  it('all items have enabled true by default', () => {
    const menu = createDefaultAppMenuTemplate('MyApp');
    const items = [menu, ...(menu.submenu ?? [])];
    for (const item of items) {
      if (item.type !== 'separator') {
        expect(item.enabled).toBe(true);
      }
    }
  });
});

describe('createDefaultEditMenuTemplate', () => {
  it('returns a submenu template with label Edit and role editMenu', () => {
    const menu = createDefaultEditMenuTemplate();
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('Edit');
    expect(menu.role).toBe('editMenu');
  });
  it('includes undo, redo, cut, copy, paste, delete, selectAll', () => {
    const menu = createDefaultEditMenuTemplate();
    const ids = collectIds([menu]);
    expect(ids).toContain('undo');
    expect(ids).toContain('redo');
    expect(ids).toContain('cut');
    expect(ids).toContain('copy');
    expect(ids).toContain('paste');
    expect(ids).toContain('delete');
    expect(ids).toContain('selectAll');
  });
  it('items carry well-known role strings', () => {
    const menu = createDefaultEditMenuTemplate();
    const undo = menu.submenu!.find((i) => i.id === 'undo');
    expect(undo?.role).toBe('undo');
  });
  it('includes separators between groups', () => {
    const menu = createDefaultEditMenuTemplate();
    const hasSeparator = menu.submenu!.some((i) => i.type === 'separator');
    expect(hasSeparator).toBe(true);
  });
});

describe('createDefaultFileMenuTemplate', () => {
  it('returns a submenu template with label File and role fileMenu', () => {
    const menu = createDefaultFileMenuTemplate();
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('File');
    expect(menu.role).toBe('fileMenu');
  });
  it('includes newFile, openFile, saveFile, saveFileAs, closeFile', () => {
    const menu = createDefaultFileMenuTemplate();
    const ids = collectIds([menu]);
    expect(ids).toContain('newFile');
    expect(ids).toContain('openFile');
    expect(ids).toContain('saveFile');
    expect(ids).toContain('saveFileAs');
    expect(ids).toContain('closeFile');
  });
  it('includes accelerators for New and Save', () => {
    const menu = createDefaultFileMenuTemplate();
    const newItem = menu.submenu!.find((i) => i.id === 'newFile');
    const saveItem = menu.submenu!.find((i) => i.id === 'saveFile');
    expect(newItem?.accelerator).toBeDefined();
    expect(saveItem?.accelerator).toBeDefined();
  });
  it('includes separators between groups', () => {
    const menu = createDefaultFileMenuTemplate();
    const hasSeparator = menu.submenu!.some((i) => i.type === 'separator');
    expect(hasSeparator).toBe(true);
  });
});

describe('createDefaultHelpMenuTemplate', () => {
  it('returns a submenu template with label Help and role helpMenu', () => {
    const menu = createDefaultHelpMenuTemplate();
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('Help');
    expect(menu.role).toBe('helpMenu');
  });
  it('includes a help search item', () => {
    const menu = createDefaultHelpMenuTemplate();
    const ids = collectIds([menu]);
    expect(ids).toContain('help');
  });
});

describe('createDefaultViewMenuTemplate', () => {
  it('returns a submenu template with label View and role viewMenu', () => {
    const menu = createDefaultViewMenuTemplate();
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('View');
    expect(menu.role).toBe('viewMenu');
  });
  it('includes reload, zoomIn, zoomOut, resetZoom, toggleFullscreen', () => {
    const menu = createDefaultViewMenuTemplate();
    const ids = collectIds([menu]);
    expect(ids).toContain('reload');
    expect(ids).toContain('zoomIn');
    expect(ids).toContain('zoomOut');
    expect(ids).toContain('resetZoom');
    expect(ids).toContain('toggleFullscreen');
  });
});

describe('createDefaultWindowMenuTemplate', () => {
  it('returns a submenu template with label Window and role windowMenu', () => {
    const menu = createDefaultWindowMenuTemplate();
    expect(menu.type).toBe('submenu');
    expect(menu.label).toBe('Window');
    expect(menu.role).toBe('windowMenu');
  });
  it('includes minimize and close items', () => {
    const menu = createDefaultWindowMenuTemplate();
    const ids = collectIds([menu]);
    expect(ids).toContain('minimize');
    expect(ids).toContain('close');
  });
});
