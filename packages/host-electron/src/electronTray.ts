import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
  TrayBalloonEvent,
  TrayDropEvent,
  TrayIcon,
  TrayIconOptions,
  TrayInteractionEvent,
  TrayMenuSelectionEvent,
  Vector2Like,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate';

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

export function createElectronTrayCapabilities<Profile extends DesktopOsProfile>(
  electron: ElectronApi,
  profile: Profile,
): ElectronTrayCapabilitiesFor<Profile> {
  const records = new Map<TrayIcon, TrayRecord>();

  const lifecycle = createEntity({
    async create(tray: TrayIcon, options: Readonly<TrayIconOptions>) {
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
    },
    async destroy(tray: TrayIcon) {
      const record = records.get(tray);
      if (record === undefined) return { outcome: 'destroyed' as const };
      const failures = await releaseRecord(record);
      if (failures.length > 0) return { failures, outcome: 'tray-destroy-failed' as const };
      records.delete(tray);
      return { outcome: 'destroyed' as const };
    },
    isDestroyed: (tray: TrayIcon) => records.get(tray)?.tray.isDestroyed() ?? true,
    list: () => [...records.keys()],
  });

  const image = (() => {
    const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>();
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
    return finishEntity(out);
  })();

  const tooltip = (() => {
    const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>();
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
    return finishEntity(out);
  })();

  const menu = (() => {
    const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>();
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
    return finishEntity(out);
  })();

  const common = {
    bounds: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.get = async (tray: TrayIcon) => {
        const record = records.get(tray);
        if (record === undefined) return { outcome: 'tray-destroyed' as const };
        try {
          return { bounds: toBounds(record.tray.getBounds()), outcome: 'available' as const };
        } catch (error) {
          return { error, outcome: 'bounds-read-failed' as const };
        }
      }; return finishEntity(out); })(),
    image,
    interactionEvents: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.getSignal = (tray: TrayIcon) => records.get(tray)?.interactionEvents ?? null; return finishEntity(out); })(),
    lifecycle,
    menu,
    menuSelectionEvents: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.getSignal = (tray: TrayIcon) => records.get(tray)?.menuSelectionEvents ?? null; return finishEntity(out); })(),
    popupMenu: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.popup = async (tray: TrayIcon, position?: Readonly<Vector2Like>) => {
        const record = records.get(tray);
        if (record === undefined) return { outcome: 'tray-destroyed' as const };
        if (record.menu === null) return { outcome: 'menu-not-set' as const };
        try {
          record.tray.popUpContextMenu(record.menu, position ? { x: position.x, y: position.y } : undefined);
          return { outcome: 'shown' as const };
        } catch (error) {
          return { error, outcome: 'popup-failed' as const };
        }
      }; return finishEntity(out); })(),
    tooltip,
  };

  if (profile === 'macos') {
    const macos = {
      doubleClickPolicy: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.setIgnore = async (tray: TrayIcon, ignore: boolean) => {
          return update(records, tray, 'double-click-policy-update-failed', (record) =>
            record.tray.setIgnoreDoubleClickEvents(ignore),
          );
        }; return finishEntity(out); })(),
      dropEvents: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.getSignal = (tray: TrayIcon) => records.get(tray)?.dropEvents ?? null; return finishEntity(out); })(),
      pressedImage: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.set = async (tray: TrayIcon, source: string) => {
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
        }; return finishEntity(out); })(),
      templateImage: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.set = async (tray: TrayIcon, isTemplate: boolean) => {
          const record = records.get(tray);
          if (record === undefined) return { outcome: 'tray-destroyed' as const };
          try {
            record.image.setTemplateImage(isTemplate);
            record.tray.setImage(record.image);
            return { outcome: 'updated' as const };
          } catch (error) {
            return { error, outcome: 'template-image-update-failed' as const };
          }
        }; return finishEntity(out); })(),
      title: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.get = async (tray: TrayIcon) => {
          const record = records.get(tray);
          return record === undefined
            ? ({ outcome: 'tray-destroyed' as const } as const)
            : ({ outcome: 'available' as const, title: record.title } as const);
        }; out.set = async (tray: TrayIcon, value: string) => {
          const record = records.get(tray);
          if (record === undefined) return { outcome: 'tray-destroyed' as const };
          try {
            record.tray.setTitle(value);
            record.title = value;
            return { outcome: 'updated' as const };
          } catch (error) {
            return { error, outcome: 'title-update-failed' as const };
          }
        }; return finishEntity(out); })(),
    };
    return createEntity({
      ...common,
      ...macos,
    }) as unknown as ElectronTrayCapabilitiesFor<Profile>;
  }

  if (profile === 'windows') {
    const windows = {
      balloon: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.display = async (tray: TrayIcon, options: Parameters<NonNullable<HostTrayCapabilities['balloon']>['display']>[1]) => {
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
        }; out.remove = async (tray: TrayIcon) => {
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
        }; return finishEntity(out); })(),
      balloonEvents: (() => { const out = allocateEntity<ElectronTrayCapabilitiesFor<Profile>>(); out.getSignal = (tray: TrayIcon) => records.get(tray)?.balloonEvents ?? null; return finishEntity(out); })(),
    };
    return createEntity({
      ...common,
      ...windows,
    }) as unknown as ElectronTrayCapabilitiesFor<Profile>;
  }

  // The double cast is what a generic conditional return costs; createEntity is what makes the Entity
  // arm of that claim true at runtime rather than only in the annotation.
  return createEntity(common) as unknown as ElectronTrayCapabilitiesFor<Profile>;

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

  function addListener(record: TrayRecord, event: string, listener: (...args: unknown[]) => void): void {
    record.tray.on(event, listener);
    record.listeners.push({ event, listener });
  }
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
