import type { TrayEventType } from '@flighthq/types';

import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions, ElectronTray } from './electronModule';
import { createElectronTrayBackend } from './electronTray';

interface FakeTray extends ElectronTray {
  icon: string;
  tooltip: string;
  title: string;
  contextMenu: ElectronMenu | null;
  destroyed: boolean;
  handlers: Record<string, () => void>;
}

function fakeElectron(): {
  electron: ElectronApi;
  trays: FakeTray[];
  built: ElectronMenuItemOptions[][];
} {
  const trays: FakeTray[] = [];
  const built: ElectronMenuItemOptions[][] = [];
  const electron = {
    Tray: function (this: FakeTray, icon: string) {
      this.icon = icon;
      this.tooltip = '';
      this.title = '';
      this.contextMenu = null;
      this.destroyed = false;
      this.handlers = {};
      this.setToolTip = (t: string) => {
        this.tooltip = t;
      };
      this.setTitle = (t: string) => {
        this.title = t;
      };
      this.setContextMenu = (menu: ElectronMenu | null) => {
        this.contextMenu = menu;
      };
      this.on = (event: string, listener: () => void) => {
        this.handlers[event] = listener;
      };
      this.destroy = () => {
        this.destroyed = true;
      };
      trays.push(this);
    },
    Menu: {
      buildFromTemplate: (template: ElectronMenuItemOptions[]) => {
        built.push(template);
        return { template } as unknown as ElectronMenu;
      },
    },
  } as unknown as ElectronApi;
  return { electron, trays, built };
}

describe('createElectronTrayBackend', () => {
  it('creates a tray with icon, tooltip, and title and returns a numeric id', () => {
    const { electron, trays } = fakeElectron();
    const backend = createElectronTrayBackend(electron);
    const id = backend.create({ icon: 'i.png', tooltip: 'hello', title: 'T' });
    expect(typeof id).toBe('number');
    expect(trays[0].icon).toBe('i.png');
    expect(trays[0].tooltip).toBe('hello');
    expect(trays[0].title).toBe('T');
  });

  it('destroys a tray and ignores unknown ids', () => {
    const { electron, trays } = fakeElectron();
    const backend = createElectronTrayBackend(electron);
    const id = backend.create({});
    backend.destroy(id);
    expect(trays[0].destroyed).toBe(true);
    expect(() => backend.destroy(999)).not.toThrow();
  });

  it('updates tooltip, title, and context menu', () => {
    const { electron, trays, built } = fakeElectron();
    const backend = createElectronTrayBackend(electron);
    const id = backend.create({});
    backend.setTooltip(id, 'tip');
    backend.setTitle(id, 'name');
    backend.setContextMenu(id, [{ id: 'x', label: 'X' }]);
    expect(trays[0].tooltip).toBe('tip');
    expect(trays[0].title).toBe('name');
    expect(trays[0].contextMenu).not.toBeNull();
    expect(built[built.length - 1][0].id).toBe('x');
  });

  it('forwards click events to the subscribed listener and stops after unsubscribe', () => {
    const { electron, trays } = fakeElectron();
    const backend = createElectronTrayBackend(electron);
    const id = backend.create({});
    const events: [number, TrayEventType][] = [];
    const unsubscribe = backend.subscribe((trayId, event) => events.push([trayId, event]));
    trays[0].handlers['click']();
    trays[0].handlers['right-click']();
    trays[0].handlers['double-click']();
    unsubscribe();
    trays[0].handlers['click']();
    expect(events).toEqual([
      [id, 'click'],
      [id, 'rightClick'],
      [id, 'doubleClick'],
    ]);
  });
});
