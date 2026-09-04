import {
  createTrayIcon,
  destroyTrayIcon,
  displayTrayBalloon,
  onTrayInteraction,
  onTrayMenuSelection,
  setTrayIconContextMenu,
  setTrayIconTemplate,
} from '@flighthq/tray/contract';
import type {
  ElectronApi,
  ElectronMenu,
  ElectronMenuItemOptions,
  ElectronNativeImage,
  ElectronTray,
  TrayIconForHost,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createElectronTrayCapabilities,
  initializeTrayBalloonBackend,
  initializeTrayBalloonEventsBackend,
  initializeTrayBoundsBackend,
  initializeTrayDoubleClickPolicyBackend,
  initializeTrayDropEventsBackend,
  initializeTrayImageBackend,
  initializeTrayInteractionEventsBackend,
  initializeTrayLifecycleBackend,
  initializeTrayMenuBackend,
  initializeTrayMenuSelectionEventsBackend,
  initializeTrayPopupMenuBackend,
  initializeTrayPressedImageBackend,
  initializeTrayTemplateImageBackend,
  initializeTrayTitleBackend,
  initializeTrayTooltipBackend,
} from './electronTray';

interface FakeImage extends ElectronNativeImage {
  source: string;
  template: boolean;
}

interface FakeTray extends ElectronTray {
  destroyed: boolean;
  destroyFailures: number;
  handlers: Record<string, Array<(...args: unknown[]) => void>>;
  image: ElectronNativeImage;
  menu: ElectronMenu | null;
  removeFailures: number;
  title: string;
  tooltip: string;
}

function fakeElectron() {
  const trays: FakeTray[] = [];
  const templates: ElectronMenuItemOptions[][] = [];
  const decode = (source: string): FakeImage => ({
    isEmpty: () => source === 'invalid',
    setTemplateImage(value: boolean) {
      this.template = value;
    },
    source,
    template: false,
    toDataURL: () => source,
  });
  const electron = {
    nativeImage: { createFromDataURL: decode, createFromPath: decode },
    Menu: {
      buildFromTemplate(template: ElectronMenuItemOptions[]) {
        templates.push(template);
        return { popup() {} };
      },
      setApplicationMenu() {},
    },
    Tray: function (this: FakeTray, image: ElectronNativeImage) {
      this.destroyed = false;
      this.destroyFailures = 0;
      this.handlers = {};
      this.image = image;
      this.menu = null;
      this.removeFailures = 0;
      this.title = '';
      this.tooltip = '';
      this.destroy = () => {
        if (this.destroyFailures-- > 0) throw new Error('destroy failed');
        this.destroyed = true;
      };
      this.displayBalloon = () => {};
      this.getBounds = () => ({ height: 4, width: 3, x: 1, y: 2 });
      this.isDestroyed = () => this.destroyed;
      this.on = (event, listener) => {
        (this.handlers[event] ??= []).push(listener);
      };
      this.popUpContextMenu = () => {};
      this.removeBalloon = () => {};
      this.removeListener = (event, listener) => {
        if (this.removeFailures-- > 0) throw new Error('remove failed');
        this.handlers[event] = (this.handlers[event] ?? []).filter((value) => value !== listener);
      };
      this.setContextMenu = (menu) => {
        this.menu = menu;
      };
      this.setIgnoreDoubleClickEvents = () => {};
      this.setImage = (value) => {
        this.image = value as ElectronNativeImage;
      };
      this.setPressedImage = () => {};
      this.setTitle = (value) => {
        this.title = value;
      };
      this.setToolTip = (value) => {
        this.tooltip = value;
      };
      trays.push(this);
    },
  } as unknown as ElectronApi;
  return { electron, templates, trays };
}

async function acquire<
  Host extends { tray: { lifecycle: NonNullable<ReturnType<typeof createElectronTrayCapabilities>['lifecycle']> } },
>(host: Host): Promise<TrayIconForHost<Host>> {
  const result = await createTrayIcon(host, { icon: 'icon.png' });
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return result.tray;
}

describe('createElectronTrayCapabilities', () => {
  it('exposes only the slots supported by the injected OS profile', () => {
    const { electron } = fakeElectron();
    expect(Object.keys(createElectronTrayCapabilities(electron, 'linux')).sort()).toEqual(
      [
        'bounds',
        'image',
        'interactionEvents',
        'lifecycle',
        'menu',
        'menuSelectionEvents',
        'popupMenu',
        'tooltip',
      ].sort(),
    );
    expect(Object.keys(createElectronTrayCapabilities(electron, 'macos')).sort()).toEqual(
      [
        'bounds',
        'doubleClickPolicy',
        'dropEvents',
        'image',
        'interactionEvents',
        'lifecycle',
        'menu',
        'menuSelectionEvents',
        'popupMenu',
        'pressedImage',
        'templateImage',
        'title',
        'tooltip',
      ].sort(),
    );
    expect(Object.keys(createElectronTrayCapabilities(electron, 'windows')).sort()).toEqual(
      [
        'balloon',
        'balloonEvents',
        'bounds',
        'image',
        'interactionEvents',
        'lifecycle',
        'menu',
        'menuSelectionEvents',
        'popupMenu',
        'tooltip',
      ].sort(),
    );
  });

  it('constructs the native resource before publishing the Entity', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'macos') };
    const result = await createTrayIcon(host, {
      icon: 'icon.png',
      iconTemplate: true,
      title: 'Flight',
      tooltip: 'Ready',
    });
    expect(result.outcome).toBe('created');
    expect(trays[0].title).toBe('Flight');
    expect(trays[0].tooltip).toBe('Ready');
    expect((trays[0].image as FakeImage).template).toBe(true);
  });

  it('keeps one native listener while delivering full pointer payload to multiple subscribers', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'linux') };
    const tray = await acquire(host);
    const first = vi.fn();
    const second = vi.fn();
    onTrayInteraction(tray, first);
    onTrayInteraction(tray, second);
    expect(trays[0].handlers.click).toHaveLength(1);
    trays[0].handlers.click[0]!({ altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }, { x: 7, y: 9 });
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ altKey: true, position: { x: 7, y: 9 }, type: 'click' }),
    );
    expect(second).toHaveBeenCalledOnce();
  });

  it('routes a menu selection only through that Tray signal', async () => {
    const { electron, templates } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'linux') };
    const first = await acquire(host);
    const second = await acquire(host);
    const firstIds: string[] = [];
    const secondIds: string[] = [];
    onTrayMenuSelection(first, ({ id }) => firstIds.push(id));
    onTrayMenuSelection(second, ({ id }) => secondIds.push(id));
    await setTrayIconContextMenu(first, [{ id: 'open', label: 'Open' }]);
    templates[0][0].click?.();
    expect(firstIds).toEqual(['open']);
    expect(secondIds).toEqual([]);
  });

  it('realizes later template changes through the current native image', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'macos') };
    const tray = await acquire(host);
    expect((await setTrayIconTemplate(tray, true)).outcome).toBe('updated');
    expect((trays[0].image as FakeImage).template).toBe(true);
  });

  it('returns invalid-icon without publishing a ghost record', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'linux') };
    const result = await createTrayIcon(host, { icon: 'invalid' });
    expect(result.outcome).toBe('invalid-icon');
    expect(trays).toHaveLength(0);
    expect(host.tray.lifecycle.list()).toEqual([]);
  });

  it('attempts listener and native teardown, then retries only failed steps', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'linux') };
    const tray = await acquire(host);
    trays[0].removeFailures = 1;
    trays[0].destroyFailures = 1;
    expect((await destroyTrayIcon(tray)).outcome).toBe('tray-destroy-failed');
    expect((await destroyTrayIcon(tray)).outcome).toBe('destroyed');
    expect(trays[0].destroyed).toBe(true);
  });

  it('owns balloon commands only on the Windows shape', async () => {
    const { electron } = fakeElectron();
    const host = { tray: createElectronTrayCapabilities(electron, 'windows') };
    const tray = await acquire(host);
    expect((await displayTrayBalloon(tray, { text: 'Done', title: 'Flight' })).outcome).toBe('displayed');
  });
});
describe('initializeTrayBalloonBackend', () => {
  it('is the construction initializer of createTrayBalloonBackend', () => {
    expect(typeof initializeTrayBalloonBackend).toBe('function');
  });
});

describe('initializeTrayBalloonEventsBackend', () => {
  it('is the construction initializer of createTrayBalloonEventsBackend', () => {
    expect(typeof initializeTrayBalloonEventsBackend).toBe('function');
  });
});

describe('initializeTrayBoundsBackend', () => {
  it('is the construction initializer of createTrayBoundsBackend', () => {
    expect(typeof initializeTrayBoundsBackend).toBe('function');
  });
});

describe('initializeTrayDoubleClickPolicyBackend', () => {
  it('is the construction initializer of createTrayDoubleClickPolicyBackend', () => {
    expect(typeof initializeTrayDoubleClickPolicyBackend).toBe('function');
  });
});

describe('initializeTrayDropEventsBackend', () => {
  it('is the construction initializer of createTrayDropEventsBackend', () => {
    expect(typeof initializeTrayDropEventsBackend).toBe('function');
  });
});

describe('initializeTrayImageBackend', () => {
  it('is the construction initializer of createTrayImageBackend', () => {
    expect(typeof initializeTrayImageBackend).toBe('function');
  });
});

describe('initializeTrayInteractionEventsBackend', () => {
  it('is the construction initializer of createTrayInteractionEventsBackend', () => {
    expect(typeof initializeTrayInteractionEventsBackend).toBe('function');
  });
});

describe('initializeTrayLifecycleBackend', () => {
  it('is the construction initializer of createTrayLifecycleBackend', () => {
    expect(typeof initializeTrayLifecycleBackend).toBe('function');
  });
});

describe('initializeTrayMenuBackend', () => {
  it('is the construction initializer of createTrayMenuBackend', () => {
    expect(typeof initializeTrayMenuBackend).toBe('function');
  });
});

describe('initializeTrayMenuSelectionEventsBackend', () => {
  it('is the construction initializer of createTrayMenuSelectionEventsBackend', () => {
    expect(typeof initializeTrayMenuSelectionEventsBackend).toBe('function');
  });
});

describe('initializeTrayPopupMenuBackend', () => {
  it('is the construction initializer of createTrayPopupMenuBackend', () => {
    expect(typeof initializeTrayPopupMenuBackend).toBe('function');
  });
});

describe('initializeTrayPressedImageBackend', () => {
  it('is the construction initializer of createTrayPressedImageBackend', () => {
    expect(typeof initializeTrayPressedImageBackend).toBe('function');
  });
});

describe('initializeTrayTemplateImageBackend', () => {
  it('is the construction initializer of createTrayTemplateImageBackend', () => {
    expect(typeof initializeTrayTemplateImageBackend).toBe('function');
  });
});

describe('initializeTrayTitleBackend', () => {
  it('is the construction initializer of createTrayTitleBackend', () => {
    expect(typeof initializeTrayTitleBackend).toBe('function');
  });
});

describe('initializeTrayTooltipBackend', () => {
  it('is the construction initializer of createTrayTooltipBackend', () => {
    expect(typeof initializeTrayTooltipBackend).toBe('function');
  });
});
