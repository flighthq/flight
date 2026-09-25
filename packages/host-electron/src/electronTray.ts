import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  DesktopOsProfile,
  ElectronApi,
  ElectronMenu,
  ElectronNativeImage,
  ElectronRectangle,
  ElectronTray,
  ElectronTrayCapabilitiesFor,
  HostTrayCapabilities,
  MenuItemTemplate,
  Signal,
  HostTrayBalloonCapability,
  TrayBalloonEvent,
  HostTrayBalloonEventsCapability,
  HostTrayBoundsCapability,
  HostTrayDoubleClickPolicyCapability,
  TrayDropEvent,
  HostTrayDropEventsCapability,
  TrayIcon,
  TrayIconOptions,
  HostTrayImageCapability,
  TrayInteractionEvent,
  HostTrayInteractionEventsCapability,
  HostTrayLifecycleCapability,
  HostTrayMenuCapability,
  TrayMenuSelectionEvent,
  HostTrayMenuSelectionEventsCapability,
  HostTrayPopupMenuCapability,
  HostTrayPressedImageCapability,
  HostTrayTemplateImageCapability,
  HostTrayTitleCapability,
  HostTrayTooltipCapability,
  Vector2Like,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate.ts';

interface NativeListener {
  event: string;
  listener: (...args: unknown[]) => void;
}

interface TrayRecord {
  balloonActive: boolean;
  balloonEvents: Signal<(event: Readonly<TrayBalloonEvent>) => void>;
  dropEvents: Signal<(event: Readonly<TrayDropEvent>) => void>;
  image: ElectronNativeImage;
  interactionEvents: Signal<(event: Readonly<TrayInteractionEvent>) => void>;
  listeners: NativeListener[];
  menu: ElectronMenu | null;
  menuSelectionEvents: Signal<(event: Readonly<TrayMenuSelectionEvent>) => void>;
  nativePending: boolean;
  title: string;
  tooltip: string;
  tray: ElectronTray;
}

export function electronHostTray<Profile extends DesktopOsProfile>(
  electron: ElectronApi,
  profile: Profile,
): ElectronTrayCapabilitiesFor<Profile> {
  const records = new Map<TrayIcon, TrayRecord>();

  const lifecycle = (() => {
    const out = {} as HostTrayLifecycleCapability;
    populateElectronHostTrayLifecycle(out, records, electron, profile);
    return out;
  })();

  const image = (() => {
    const out = {} as HostTrayImageCapability;
    populateElectronHostTrayImage(out, records, electron);
    return out;
  })();

  const tooltip = (() => {
    const out = {} as HostTrayTooltipCapability;
    populateElectronHostTrayTooltip(out, records);
    return out;
  })();

  const menu = (() => {
    const out = {} as HostTrayMenuCapability;
    populateElectronHostTrayMenu(out, records, electron);
    return out;
  })();

  const common = {
    bounds: (() => {
      const out = {} as HostTrayBoundsCapability;
      populateElectronHostTrayBounds(out, records);
      return out;
    })(),
    image,
    interactionEvents: (() => {
      const out = {} as HostTrayInteractionEventsCapability;
      populateElectronHostTrayInteractionEvents(out, records);
      return out;
    })(),
    lifecycle,
    menu,
    menuSelectionEvents: (() => {
      const out = {} as HostTrayMenuSelectionEventsCapability;
      populateElectronHostTrayMenuSelectionEvents(out, records);
      return out;
    })(),
    popupMenu: (() => {
      const out = {} as HostTrayPopupMenuCapability;
      populateElectronHostTrayPopupMenu(out, records);
      return out;
    })(),
    tooltip,
  };

  if (profile === 'macos') {
    const macos = {
      doubleClickPolicy: (() => {
        const out = {} as HostTrayDoubleClickPolicyCapability;
        populateElectronHostTrayDoubleClickPolicy(out, records);
        return out;
      })(),
      dropEvents: (() => {
        const out = {} as HostTrayDropEventsCapability;
        populateElectronHostTrayDropEvents(out, records);
        return out;
      })(),
      pressedImage: (() => {
        const out = {} as HostTrayPressedImageCapability;
        populateElectronHostTrayPressedImage(out, records, electron);
        return out;
      })(),
      templateImage: (() => {
        const out = {} as HostTrayTemplateImageCapability;
        populateElectronHostTrayTemplateImage(out, records);
        return out;
      })(),
      title: (() => {
        const out = {} as HostTrayTitleCapability;
        populateElectronHostTrayTitle(out, records);
        return out;
      })(),
    };
    return Object.freeze({ ...common, ...macos }) as unknown as ElectronTrayCapabilitiesFor<Profile>;
  }

  if (profile === 'windows') {
    const windows = {
      balloon: (() => {
        const out = {} as HostTrayBalloonCapability;
        populateElectronHostTrayBalloon(out, records);
        return out;
      })(),
      balloonEvents: (() => {
        const out = {} as HostTrayBalloonEventsCapability;
        populateElectronHostTrayBalloonEvents(out, records);
        return out;
      })(),
    };
    return Object.freeze({ ...common, ...windows }) as unknown as ElectronTrayCapabilitiesFor<Profile>;
  }

  return Object.freeze({ ...common }) as unknown as ElectronTrayCapabilitiesFor<Profile>;
}

export function electronHostTrayBalloon(electron: ElectronApi): HostTrayBalloonCapability {
  return electronHostTray(electron, 'windows').balloon;
}

export function electronHostTrayBalloonEvents(electron: ElectronApi): HostTrayBalloonEventsCapability {
  return electronHostTray(electron, 'windows').balloonEvents;
}

export function electronHostTrayBounds(electron: ElectronApi, profile: DesktopOsProfile): HostTrayBoundsCapability {
  return electronHostTray(electron, profile).bounds;
}

export function electronHostTrayDoubleClickPolicy(electron: ElectronApi): HostTrayDoubleClickPolicyCapability {
  return electronHostTray(electron, 'macos').doubleClickPolicy;
}

export function electronHostTrayDropEvents(electron: ElectronApi): HostTrayDropEventsCapability {
  return electronHostTray(electron, 'macos').dropEvents;
}

export function electronHostTrayImage(electron: ElectronApi, profile: DesktopOsProfile): HostTrayImageCapability {
  return electronHostTray(electron, profile).image;
}

export function electronHostTrayInteractionEvents(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): HostTrayInteractionEventsCapability {
  return electronHostTray(electron, profile).interactionEvents;
}

export function electronHostTrayLifecycle(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): HostTrayLifecycleCapability {
  return electronHostTray(electron, profile).lifecycle;
}

export function electronHostTrayMenu(electron: ElectronApi, profile: DesktopOsProfile): HostTrayMenuCapability {
  return electronHostTray(electron, profile).menu;
}

export function electronHostTrayMenuSelectionEvents(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): HostTrayMenuSelectionEventsCapability {
  return electronHostTray(electron, profile).menuSelectionEvents;
}

export function electronHostTrayPopupMenu(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): HostTrayPopupMenuCapability {
  return electronHostTray(electron, profile).popupMenu;
}

export function electronHostTrayPressedImage(electron: ElectronApi): HostTrayPressedImageCapability {
  return electronHostTray(electron, 'macos').pressedImage;
}

export function electronHostTrayTemplateImage(electron: ElectronApi): HostTrayTemplateImageCapability {
  return electronHostTray(electron, 'macos').templateImage;
}

export function electronHostTrayTitle(electron: ElectronApi): HostTrayTitleCapability {
  return electronHostTray(electron, 'macos').title;
}

export function electronHostTrayTooltip(electron: ElectronApi, profile: DesktopOsProfile): HostTrayTooltipCapability {
  return electronHostTray(electron, profile).tooltip;
}

export function populateElectronHostTrayBalloon(
  out: HostTrayBalloonCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.display = async (
    tray: TrayIcon,
    options: Parameters<NonNullable<HostTrayCapabilities['balloon']>['display']>[1],
  ) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    try {
      record.tray.displayBalloon({
        content: options.text,
        icon: options.icon,
        iconType: options.iconType,
        largeIcon: options.largeIcon,
        noSound: options.noSound,
        respectQuietTime: options.respectQuietTime,
        title: options.title,
      });
      record.balloonActive = true;
      return { outcome: 'displayed' as const };
    } catch (error) {
      return { error, outcome: 'balloon-display-failed' as const };
    }
  };
  out.remove = async (tray: TrayIcon) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    if (!record.balloonActive) return { outcome: 'balloon-not-active' as const };
    try {
      record.tray.removeBalloon();
      record.balloonActive = false;
      return { outcome: 'removed' as const };
    } catch (error) {
      return { error, outcome: 'balloon-remove-failed' as const };
    }
  };
}

export function populateElectronHostTrayBalloonEvents(
  out: HostTrayBalloonEventsCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.getSignal = (tray: TrayIcon) => records.get(tray)?.balloonEvents ?? null;
}

export function populateElectronHostTrayBounds(
  out: HostTrayBoundsCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.get = async (tray: TrayIcon) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    try {
      return { bounds: toBounds(record.tray.getBounds()), outcome: 'available' as const };
    } catch (error) {
      return { error, outcome: 'bounds-read-failed' as const };
    }
  };
}

export function populateElectronHostTrayDoubleClickPolicy(
  out: HostTrayDoubleClickPolicyCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.setIgnore = async (tray: TrayIcon, ignore: boolean) => {
    return update(records, tray, 'double-click-policy-update-failed', (record) =>
      record.tray.setIgnoreDoubleClickEvents(ignore),
    );
  };
}

export function populateElectronHostTrayDropEvents(
  out: HostTrayDropEventsCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.getSignal = (tray: TrayIcon) => records.get(tray)?.dropEvents ?? null;
}

export function populateElectronHostTrayImage(
  out: HostTrayImageCapability,
  records: Map<TrayIcon, TrayRecord>,
  electron: ElectronApi,
): void {
  out.set = async (tray: TrayIcon, source: string) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    let decoded: ElectronNativeImage;
    try {
      decoded = decodeImage(electron, source);
    } catch (error) {
      return { error, outcome: 'invalid-icon' as const };
    }
    try {
      record.tray.setImage(decoded);
      record.image = decoded;
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'image-update-failed' as const };
    }
  };
}

export function populateElectronHostTrayInteractionEvents(
  out: HostTrayInteractionEventsCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.getSignal = (tray: TrayIcon) => records.get(tray)?.interactionEvents ?? null;
}

export function populateElectronHostTrayLifecycle(
  out: HostTrayLifecycleCapability,
  records: Map<TrayIcon, TrayRecord>,
  electron: ElectronApi,
  profile: DesktopOsProfile,
): void {
  function addListener(record: TrayRecord, event: string, listener: (...args: unknown[]) => void): void {
    record.tray.on(event, listener);
    record.listeners.push({ event, listener });
  }

  function attachNativeListeners(record: TrayRecord, osProfile: DesktopOsProfile): void {
    const interaction =
      (type: TrayInteractionEvent['type']) =>
      (...args: unknown[]) => {
        const modifiers = objectValue(args[0]);
        const position = pointValue(args[1]);
        emitSignal(record.interactionEvents, {
          altKey: modifiers.altKey === true,
          bounds: toBounds(record.tray.getBounds()),
          ctrlKey: modifiers.ctrlKey === true,
          metaKey: modifiers.metaKey === true,
          position,
          shiftKey: modifiers.shiftKey === true,
          type,
        });
      };
    addListener(record, 'click', interaction('click'));
    addListener(record, 'right-click', interaction('rightClick'));
    addListener(record, 'double-click', interaction('doubleClick'));
    if (osProfile === 'windows') {
      addListener(record, 'balloon-click', () => emitSignal(record.balloonEvents, { type: 'click' }));
      addListener(record, 'balloon-closed', () => emitSignal(record.balloonEvents, { type: 'close' }));
      addListener(record, 'balloon-show', () => emitSignal(record.balloonEvents, { type: 'show' }));
    }
    if (osProfile === 'macos') {
      addListener(record, 'drop-files', (...args) => {
        const files = Array.isArray(args.at(-1)) ? (args.at(-1) as string[]) : [];
        emitSignal(record.dropEvents, { files: files.slice(), type: 'files' });
      });
      addListener(record, 'drop-text', (...args) => {
        const text = args.at(-1);
        emitSignal(record.dropEvents, { text: typeof text === 'string' ? text : '', type: 'text' });
      });
    }
  }

  out.create = async (tray: TrayIcon, options: Readonly<TrayIconOptions>) => {
    if (options.signal?.aborted) return { outcome: 'cancelled' as const };
    let image: ElectronNativeImage;
    try {
      image = decodeImage(electron, options.icon ?? '');
      image.setTemplateImage(options.iconTemplate ?? false);
    } catch (error) {
      return { error, outcome: 'invalid-icon' as const };
    }
    let nativeTray: ElectronTray;
    try {
      nativeTray = new electron.Tray(image);
    } catch (error) {
      return { error, outcome: 'tray-create-failed' as const };
    }
    const record: TrayRecord = {
      balloonActive: false,
      balloonEvents: createSignal(),
      dropEvents: createSignal(),
      image,
      interactionEvents: createSignal(),
      listeners: [],
      menu: null,
      menuSelectionEvents: createSignal(),
      nativePending: true,
      title: '',
      tooltip: '',
      tray: nativeTray,
    };
    try {
      if (options.title !== undefined && profile === 'macos') {
        nativeTray.setTitle(options.title);
        record.title = options.title;
      }
      if (options.tooltip !== undefined) {
        nativeTray.setToolTip(options.tooltip);
        record.tooltip = options.tooltip;
      }
      attachNativeListeners(record, profile);
      if (options.signal?.aborted) {
        await releaseRecord(record);
        return { outcome: 'cancelled' as const };
      }
      records.set(tray, record);
      return { outcome: 'created' as const };
    } catch (error) {
      await releaseRecord(record);
      return { error, outcome: 'tray-create-failed' as const };
    }
  };
  out.destroy = async (tray: TrayIcon) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'destroyed' as const };
    const failures = await releaseRecord(record);
    if (failures.length > 0) return { failures, outcome: 'tray-destroy-failed' as const };
    records.delete(tray);
    return { outcome: 'destroyed' as const };
  };
  out.isDestroyed = (tray: TrayIcon) => records.get(tray)?.tray.isDestroyed() ?? true;
  out.list = () => [...records.keys()];
}

export function populateElectronHostTrayMenu(
  out: HostTrayMenuCapability,
  records: Map<TrayIcon, TrayRecord>,
  electron: ElectronApi,
): void {
  out.set = async (tray: TrayIcon, items: readonly MenuItemTemplate[]) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    let built: ElectronMenu;
    try {
      built = electron.Menu.buildFromTemplate(
        toElectronTemplate(items, (id) => emitSignal(record.menuSelectionEvents, { id })),
      );
    } catch (error) {
      return { error, outcome: 'menu-build-failed' as const };
    }
    try {
      record.tray.setContextMenu(built);
      record.menu = built;
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'menu-install-failed' as const };
    }
  };
}

export function populateElectronHostTrayMenuSelectionEvents(
  out: HostTrayMenuSelectionEventsCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.getSignal = (tray: TrayIcon) => records.get(tray)?.menuSelectionEvents ?? null;
}

export function populateElectronHostTrayPopupMenu(
  out: HostTrayPopupMenuCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.popup = async (tray: TrayIcon, position?: Readonly<Vector2Like>) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    if (record.menu === null) return { outcome: 'menu-not-set' as const };
    try {
      record.tray.popUpContextMenu(record.menu, position ? { x: position.x, y: position.y } : undefined);
      return { outcome: 'shown' as const };
    } catch (error) {
      return { error, outcome: 'popup-failed' as const };
    }
  };
}

export function populateElectronHostTrayPressedImage(
  out: HostTrayPressedImageCapability,
  records: Map<TrayIcon, TrayRecord>,
  electron: ElectronApi,
): void {
  out.set = async (tray: TrayIcon, source: string) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    let decoded: ElectronNativeImage;
    try {
      decoded = decodeImage(electron, source);
    } catch (error) {
      return { error, outcome: 'invalid-icon' as const };
    }
    try {
      record.tray.setPressedImage(decoded);
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'pressed-image-update-failed' as const };
    }
  };
}

export function populateElectronHostTrayTemplateImage(
  out: HostTrayTemplateImageCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.set = async (tray: TrayIcon, isTemplate: boolean) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    try {
      record.image.setTemplateImage(isTemplate);
      record.tray.setImage(record.image);
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'template-image-update-failed' as const };
    }
  };
}

export function populateElectronHostTrayTitle(out: HostTrayTitleCapability, records: Map<TrayIcon, TrayRecord>): void {
  out.get = async (tray: TrayIcon) => {
    const record = records.get(tray);
    return record === undefined
      ? ({ outcome: 'tray-destroyed' as const } as const)
      : ({ outcome: 'available' as const, title: record.title } as const);
  };
  out.set = async (tray: TrayIcon, value: string) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    try {
      record.tray.setTitle(value);
      record.title = value;
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'title-update-failed' as const };
    }
  };
}

export function populateElectronHostTrayTooltip(
  out: HostTrayTooltipCapability,
  records: Map<TrayIcon, TrayRecord>,
): void {
  out.get = async (tray: TrayIcon) => {
    const record = records.get(tray);
    return record === undefined
      ? ({ outcome: 'tray-destroyed' as const } as const)
      : ({ outcome: 'available' as const, tooltip: record.tooltip } as const);
  };
  out.set = async (tray: TrayIcon, value: string) => {
    const record = records.get(tray);
    if (record === undefined) return { outcome: 'tray-destroyed' as const };
    try {
      record.tray.setToolTip(value);
      record.tooltip = value;
      return { outcome: 'updated' as const };
    } catch (error) {
      return { error, outcome: 'tooltip-update-failed' as const };
    }
  };
}

async function releaseRecord(record: TrayRecord): Promise<Array<{ error?: unknown; step: 'native-resource' }>> {
  const failures: Array<{ error?: unknown; step: 'native-resource' }> = [];
  for (let index = record.listeners.length - 1; index >= 0; index--) {
    const nativeListener = record.listeners[index]!;
    try {
      record.tray.removeListener(nativeListener.event, nativeListener.listener);
      record.listeners.splice(index, 1);
    } catch (error) {
      failures.push({ error, step: 'native-resource' });
    }
  }
  if (record.nativePending) {
    try {
      record.tray.destroy();
      record.nativePending = false;
    } catch (error) {
      failures.push({ error, step: 'native-resource' });
    }
  }
  return failures;
}

function decodeImage(electron: ElectronApi, source: string): ElectronNativeImage {
  const image = source.startsWith('data:')
    ? electron.nativeImage.createFromDataURL(source)
    : electron.nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error('Electron rejected the tray icon');
  return image;
}

function toBounds(bounds: Readonly<ElectronRectangle>) {
  return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function pointValue(value: unknown): Readonly<Vector2Like> | null {
  const point = objectValue(value);
  return typeof point.x === 'number' && typeof point.y === 'number' ? { x: point.x, y: point.y } : null;
}

async function update(
  records: ReadonlyMap<TrayIcon, TrayRecord>,
  tray: TrayIcon,
  failure: 'double-click-policy-update-failed',
  operation: (record: TrayRecord) => void,
) {
  const record = records.get(tray);
  if (record === undefined) return { outcome: 'tray-destroyed' as const };
  try {
    operation(record);
    return { outcome: 'updated' as const };
  } catch (error) {
    return { error, outcome: failure };
  }
}
