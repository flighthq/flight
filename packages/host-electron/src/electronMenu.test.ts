import { createElectronMenuBackend } from './electronMenu';
import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from './electronModule';

function fakeElectron(): {
  electron: ElectronApi;
  built: ElectronMenuItemOptions[][];
  applied: (ElectronMenu | null)[];
  popups: { x?: number; y?: number }[];
} {
  const built: ElectronMenuItemOptions[][] = [];
  const applied: (ElectronMenu | null)[] = [];
  const popups: { x?: number; y?: number }[] = [];
  const electron = {
    Menu: {
      buildFromTemplate: (template: ElectronMenuItemOptions[]) => {
        built.push(template);
        return {
          template,
          popup: (options?: { x?: number; y?: number }) => {
            popups.push(options ?? {});
          },
        } as unknown as ElectronMenu;
      },
      setApplicationMenu: (menu: ElectronMenu | null) => {
        applied.push(menu);
      },
    },
  } as unknown as ElectronApi;
  return { electron, built, applied, popups };
}

// Clicks the menu item with the given id from the most recently built template.
function clickItem(built: ElectronMenuItemOptions[][], id: string): void {
  const findIn = (items: ElectronMenuItemOptions[]): ElectronMenuItemOptions | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.submenu) {
        const found = findIn(item.submenu);
        if (found) return found;
      }
    }
    return undefined;
  };
  const item = findIn(built[built.length - 1]);
  item?.click?.();
}

describe('createElectronMenuBackend', () => {
  it('builds and applies the application menu and reports clicks via subscribeSelect', () => {
    const { electron, built, applied } = fakeElectron();
    const backend = createElectronMenuBackend(electron);
    const seen: string[] = [];
    backend.subscribeSelect((id) => seen.push(id));
    expect(
      backend.setApplicationMenu([
        { id: 'open', label: 'Open' },
        { label: 'Edit', submenu: [{ id: 'copy', label: 'Copy' }] },
      ]),
    ).toBe(true);
    expect(applied.length).toBe(1);
    clickItem(built, 'open');
    clickItem(built, 'copy');
    expect(seen).toEqual(['open', 'copy']);
  });

  it('stops delivering selects after unsubscribe', () => {
    const { electron, built } = fakeElectron();
    const backend = createElectronMenuBackend(electron);
    const seen: string[] = [];
    const unsubscribe = backend.subscribeSelect((id) => seen.push(id));
    backend.setApplicationMenu([{ id: 'a', label: 'A' }]);
    unsubscribe();
    clickItem(built, 'a');
    expect(seen).toEqual([]);
  });

  it('resolves the context menu promise with the clicked id', async () => {
    const { electron, built, popups } = fakeElectron();
    const backend = createElectronMenuBackend(electron);
    const pending = backend.popupContextMenu([{ id: 'paste', label: 'Paste' }], 10, 20);
    expect(popups).toEqual([{ x: 10, y: 20 }]);
    clickItem(built, 'paste');
    expect(await pending).toBe('paste');
  });
});
