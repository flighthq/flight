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
  TrayIcon,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  electronHostTray,
  electronHostTrayBalloon,
  electronHostTrayBalloonEvents,
  electronHostTrayBounds,
  electronHostTrayDoubleClickPolicy,
  electronHostTrayDropEvents,
  electronHostTrayImage,
  electronHostTrayInteractionEvents,
  electronHostTrayLifecycle,
  electronHostTrayMenu,
  electronHostTrayMenuSelectionEvents,
  electronHostTrayPopupMenu,
  electronHostTrayPressedImage,
  electronHostTrayTemplateImage,
  electronHostTrayTitle,
  electronHostTrayTooltip,
  populateElectronHostTrayBalloon,
  populateElectronHostTrayBalloonEvents,
  populateElectronHostTrayBounds,
  populateElectronHostTrayDoubleClickPolicy,
  populateElectronHostTrayDropEvents,
  populateElectronHostTrayImage,
  populateElectronHostTrayInteractionEvents,
  populateElectronHostTrayLifecycle,
  populateElectronHostTrayMenu,
  populateElectronHostTrayMenuSelectionEvents,
  populateElectronHostTrayPopupMenu,
  populateElectronHostTrayPressedImage,
  populateElectronHostTrayTemplateImage,
  populateElectronHostTrayTitle,
  populateElectronHostTrayTooltip,
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
      setAppMenu() {},
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

async function acquire(
  hostTrayLifecycle: NonNullable<ReturnType<typeof electronHostTray>['lifecycle']>,
): Promise<TrayIcon> {
  const result = await createTrayIcon(hostTrayLifecycle, { icon: 'icon.png' });
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return result.tray;
}

describe('electronHostTray', () => {
  it('exposes the slots supported by the injected OS profile and none exclusive to another', () => {
    const { electron } = fakeElectron();
    const supported = {
      linux: [
        'bounds',
        'image',
        'interactionEvents',
        'lifecycle',
        'menu',
        'menuSelectionEvents',
        'popupMenu',
        'tooltip',
      ],
      macos: [
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
      ],
      windows: [
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
      ],
    } as const;
    for (const profile of ['linux', 'macos', 'windows'] as const) {
      const slots = Object.keys(electronHostTray(electron, profile));
      const exclusiveElsewhere: readonly string[] = Object.entries(supported)
        .filter(([other]) => other !== profile)
        .flatMap(([, others]) => others)
        .filter((slot) => !(supported[profile] as readonly string[]).includes(slot));
      expect(slots, profile).toEqual(expect.arrayContaining([...supported[profile]]));
      expect(
        slots.filter((slot) => exclusiveElsewhere.includes(slot)),
        profile,
      ).toEqual([]);
    }
  });

  it('constructs the native resource before publishing', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'macos') };
    const result = await createTrayIcon(host.tray.lifecycle, {
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
    const host = { tray: electronHostTray(electron, 'linux') };
    const tray = await acquire(host.tray.lifecycle);
    const first = vi.fn();
    const second = vi.fn();
    onTrayInteraction(host.tray.interactionEvents, tray, first);
    onTrayInteraction(host.tray.interactionEvents, tray, second);
    expect(trays[0].handlers.click).toHaveLength(1);
    trays[0].handlers.click[0]!({ altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }, { x: 7, y: 9 });
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ altKey: true, position: { x: 7, y: 9 }, type: 'click' }),
    );
    expect(second).toHaveBeenCalledOnce();
  });

  it('routes a menu selection only through that Tray signal', async () => {
    const { electron, templates } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'linux') };
    const first = await acquire(host.tray.lifecycle);
    const second = await acquire(host.tray.lifecycle);
    const firstIds: string[] = [];
    const secondIds: string[] = [];
    onTrayMenuSelection(host.tray.menuSelectionEvents, first, ({ id }) => firstIds.push(id));
    onTrayMenuSelection(host.tray.menuSelectionEvents, second, ({ id }) => secondIds.push(id));
    await setTrayIconContextMenu(host.tray.menu, first, [{ id: 'open', label: 'Open' }]);
    templates[0][0].click?.();
    expect(firstIds).toEqual(['open']);
    expect(secondIds).toEqual([]);
  });

  it('realizes later template changes through the current native image', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'macos') };
    const tray = await acquire(host.tray.lifecycle);
    expect((await setTrayIconTemplate(host.tray.templateImage, tray, true)).outcome).toBe('updated');
    expect((trays[0].image as FakeImage).template).toBe(true);
  });

  it('returns invalid-icon without publishing a ghost record', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'linux') };
    const result = await createTrayIcon(host.tray.lifecycle, { icon: 'invalid' });
    expect(result.outcome).toBe('invalid-icon');
    expect(trays).toHaveLength(0);
    expect(host.tray.lifecycle.list()).toEqual([]);
  });

  it('attempts listener and native teardown, then retries only failed steps', async () => {
    const { electron, trays } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'linux') };
    const tray = await acquire(host.tray.lifecycle);
    trays[0].removeFailures = 1;
    trays[0].destroyFailures = 1;
    expect((await destroyTrayIcon(tray)).outcome).toBe('tray-destroy-failed');
    expect((await destroyTrayIcon(tray)).outcome).toBe('destroyed');
    expect(trays[0].destroyed).toBe(true);
  });

  it('owns balloon commands only on the Windows shape', async () => {
    const { electron } = fakeElectron();
    const host = { tray: electronHostTray(electron, 'windows') };
    const tray = await acquire(host.tray.lifecycle);
    expect((await displayTrayBalloon(host.tray.balloon, tray, { text: 'Done', title: 'Flight' })).outcome).toBe(
      'displayed',
    );
  });
});

describe('electronHostTrayBalloon', () => {
  it('constructs a tray balloon provider', () => {
    expect(electronHostTrayBalloon(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayBalloonEvents', () => {
  it('constructs a tray balloon events provider', () => {
    expect(electronHostTrayBalloonEvents(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayBounds', () => {
  it('constructs a tray bounds provider', () => {
    expect(electronHostTrayBounds(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayDoubleClickPolicy', () => {
  it('constructs a tray double click policy provider', () => {
    expect(electronHostTrayDoubleClickPolicy(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayDropEvents', () => {
  it('constructs a tray drop events provider', () => {
    expect(electronHostTrayDropEvents(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayImage', () => {
  it('constructs a tray image provider', () => {
    expect(electronHostTrayImage(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayInteractionEvents', () => {
  it('constructs a tray interaction events provider', () => {
    expect(electronHostTrayInteractionEvents(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayLifecycle', () => {
  it('constructs a tray lifecycle provider', () => {
    expect(electronHostTrayLifecycle(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayMenu', () => {
  it('constructs a tray menu provider', () => {
    expect(electronHostTrayMenu(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayMenuSelectionEvents', () => {
  it('constructs a tray menu selection events provider', () => {
    expect(electronHostTrayMenuSelectionEvents(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayPopupMenu', () => {
  it('constructs a tray popup menu provider', () => {
    expect(electronHostTrayPopupMenu(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('electronHostTrayPressedImage', () => {
  it('constructs a tray pressed image provider', () => {
    expect(electronHostTrayPressedImage(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayTemplateImage', () => {
  it('constructs a tray template image provider', () => {
    expect(electronHostTrayTemplateImage(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayTitle', () => {
  it('constructs a tray title provider', () => {
    expect(electronHostTrayTitle(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostTrayTooltip', () => {
  it('constructs a tray tooltip provider', () => {
    expect(electronHostTrayTooltip(fakeElectron().electron, 'linux')).toBeDefined();
  });
});

describe('populateElectronHostTrayBalloon', () => {
  it('is the construction initializer of electronHostTrayBalloon', () => {
    expect(typeof populateElectronHostTrayBalloon).toBe('function');
  });
});

describe('populateElectronHostTrayBalloonEvents', () => {
  it('is the construction initializer of electronHostTrayBalloonEvents', () => {
    expect(typeof populateElectronHostTrayBalloonEvents).toBe('function');
  });
});

describe('populateElectronHostTrayBounds', () => {
  it('is the construction initializer of electronHostTrayBounds', () => {
    expect(typeof populateElectronHostTrayBounds).toBe('function');
  });
});

describe('populateElectronHostTrayDoubleClickPolicy', () => {
  it('is the construction initializer of electronHostTrayDoubleClickPolicy', () => {
    expect(typeof populateElectronHostTrayDoubleClickPolicy).toBe('function');
  });
});

describe('populateElectronHostTrayDropEvents', () => {
  it('is the construction initializer of electronHostTrayDropEvents', () => {
    expect(typeof populateElectronHostTrayDropEvents).toBe('function');
  });
});

describe('populateElectronHostTrayImage', () => {
  it('is the construction initializer of electronHostTrayImage', () => {
    expect(typeof populateElectronHostTrayImage).toBe('function');
  });
});

describe('populateElectronHostTrayInteractionEvents', () => {
  it('is the construction initializer of electronHostTrayInteractionEvents', () => {
    expect(typeof populateElectronHostTrayInteractionEvents).toBe('function');
  });
});

describe('populateElectronHostTrayLifecycle', () => {
  it('is the construction initializer of electronHostTrayLifecycle', () => {
    expect(typeof populateElectronHostTrayLifecycle).toBe('function');
  });
});

describe('populateElectronHostTrayMenu', () => {
  it('is the construction initializer of electronHostTrayMenu', () => {
    expect(typeof populateElectronHostTrayMenu).toBe('function');
  });
});

describe('populateElectronHostTrayMenuSelectionEvents', () => {
  it('is the construction initializer of electronHostTrayMenuSelectionEvents', () => {
    expect(typeof populateElectronHostTrayMenuSelectionEvents).toBe('function');
  });
});

describe('populateElectronHostTrayPopupMenu', () => {
  it('is the construction initializer of electronHostTrayPopupMenu', () => {
    expect(typeof populateElectronHostTrayPopupMenu).toBe('function');
  });
});

describe('populateElectronHostTrayPressedImage', () => {
  it('is the construction initializer of electronHostTrayPressedImage', () => {
    expect(typeof populateElectronHostTrayPressedImage).toBe('function');
  });
});

describe('populateElectronHostTrayTemplateImage', () => {
  it('is the construction initializer of electronHostTrayTemplateImage', () => {
    expect(typeof populateElectronHostTrayTemplateImage).toBe('function');
  });
});

describe('populateElectronHostTrayTitle', () => {
  it('is the construction initializer of electronHostTrayTitle', () => {
    expect(typeof populateElectronHostTrayTitle).toBe('function');
  });
});

describe('populateElectronHostTrayTooltip', () => {
  it('is the construction initializer of electronHostTrayTooltip', () => {
    expect(typeof populateElectronHostTrayTooltip).toBe('function');
  });
});
