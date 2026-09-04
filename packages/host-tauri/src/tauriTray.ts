import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  DesktopOsProfile,
  MenuItemTemplate,
  Signal,
  TauriApi,
  TauriMenu,
  TauriMenuItemHandle,
  TauriTrayIcon,
  TauriTrayIconEvent,
  TauriTrayIconOptions,
  TauriTrayCapabilitiesFor,
  TrayIcon,
  TrayIconOptions,
  TrayInteractionEvent,
  TrayMenuSelectionEvent,
} from '@flighthq/types/contract';

interface TrayRecord {
  destroying: boolean;
  icon: TauriTrayIcon;
  interactionEvents: Signal<(event: Readonly<TrayInteractionEvent>) => void>;
  menuGeneration: number;
  menus: TauriMenu[];
  menuSelectionEvents: Signal<(event: Readonly<TrayMenuSelectionEvent>) => void>;
  nativePending: boolean;
  pendingMenuOperations: Set<Promise<void>>;
  title: string;
  tooltip: string;
}

export function createTauriTrayCapabilities<Profile extends DesktopOsProfile>(
  tauri: TauriApi,
  profile: Profile,
): TauriTrayCapabilitiesFor<Profile> {
  const records = new Map<TrayIcon, TrayRecord>();

  const lifecycle = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.create = async (tray: TrayIcon, options: Readonly<TrayIconOptions>) => {
      if (options.signal?.aborted) return { outcome: 'cancelled' as const };
      const interactionEvents = createSignal<(event: Readonly<TrayInteractionEvent>) => void>();
      const menuSelectionEvents = createSignal<(event: Readonly<TrayMenuSelectionEvent>) => void>();
      const nativeOptions: TauriTrayIconOptions = {
        action: (event) => emitInteraction(interactionEvents, event),
        icon: options.icon,
      };
      if (profile === 'linux' || profile === 'macos') nativeOptions.title = options.title;
      if (profile === 'windows' || profile === 'macos') nativeOptions.tooltip = options.tooltip;
      if (profile === 'macos') nativeOptions.iconAsTemplate = options.iconTemplate;
      let icon: TauriTrayIcon;
      try {
        icon = await tauri.tray.TrayIcon.new(nativeOptions);
      } catch (error) {
        return { error, outcome: 'tray-create-failed' as const };
      }
      if (options.signal?.aborted) {
        try {
          await icon.close();
          return { outcome: 'cancelled' as const };
        } catch (error) {
          return { error, outcome: 'tray-create-failed' as const };
        }
      }
      records.set(tray, {
        destroying: false,
        icon,
        interactionEvents,
        menuGeneration: 0,
        menus: [],
        menuSelectionEvents,
        nativePending: true,
        pendingMenuOperations: new Set(),
        title: options.title ?? '',
        tooltip: options.tooltip ?? '',
      });
      return { outcome: 'created' as const };
    };
    out.destroy = async (tray: TrayIcon) => {
      const record = records.get(tray);
      if (record === undefined) return { outcome: 'destroyed' as const };
      record.destroying = true;
      record.menuGeneration++;
      await Promise.all([...record.pendingMenuOperations]);
      const failures: Array<{ error?: unknown; step: 'native-resource' }> = [];
      for (let index = record.menus.length - 1; index >= 0; index--) {
        let closed = false;
        try {
          await record.menus[index]!.close();
          closed = true;
        } catch (error) {
          failures.push({ error, step: 'native-resource' });
        }
        if (closed) record.menus.splice(index, 1);
      }
      if (record.nativePending) {
        try {
          await record.icon.close();
          record.nativePending = false;
        } catch (error) {
          failures.push({ error, step: 'native-resource' });
        }
      }
      if (failures.length > 0) return { failures, outcome: 'tray-destroy-failed' as const };
      records.delete(tray);
      return { outcome: 'destroyed' as const };
    };
    out.isDestroyed = (tray: TrayIcon) => records.get(tray)?.destroying ?? true;
    out.list = () => [...records.entries()].filter(([, record]) => !record.destroying).map(([tray]) => tray);
    return finishEntity(out);
  })();

  const image = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.set = async (tray: TrayIcon, icon: string) => {
      return update(records, tray, 'image-update-failed', async (record) => record.icon.setIcon(icon));
    };
    return finishEntity(out);
  })();

  const menu = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.set = async (tray: TrayIcon, items: readonly MenuItemTemplate[]) => {
      const record = activeRecord(records, tray);
      if (record === null) return { outcome: 'tray-destroyed' as const };
      let finishOperation!: () => void;
      const pendingOperation = new Promise<void>((resolve) => {
        finishOperation = resolve;
      });
      record.pendingMenuOperations.add(pendingOperation);
      try {
        const generation = ++record.menuGeneration;
        let built: TauriMenu;
        try {
          const handles = await buildTrayItems(tauri.menu, items, (id) =>
            emitSignal(record.menuSelectionEvents, { id }),
          );
          built = await tauri.menu.Menu.new({ items: handles });
        } catch (error) {
          return { error, outcome: 'menu-build-failed' as const };
        }
        if (record.destroying || generation !== record.menuGeneration) {
          await closeStaleMenu(record, built);
          return record.destroying
            ? ({ outcome: 'tray-destroyed' as const } as const)
            : ({
                error: new Error('A newer Tray menu superseded this build'),
                outcome: 'menu-install-failed' as const,
              } as const);
        }
        try {
          await record.icon.setMenu(built);
        } catch (error) {
          await closeStaleMenu(record, built);
          return { error, outcome: 'menu-install-failed' as const };
        }
        if (record.destroying || generation !== record.menuGeneration) {
          await closeStaleMenu(record, built);
          return record.destroying
            ? ({ outcome: 'tray-destroyed' as const } as const)
            : ({
                error: new Error('A newer Tray menu superseded this install'),
                outcome: 'menu-install-failed' as const,
              } as const);
        }
        const previous = record.menus.slice();
        record.menus.push(built);
        const failures: unknown[] = [];
        for (const oldMenu of previous) {
          try {
            await oldMenu.close();
            record.menus.splice(record.menus.indexOf(oldMenu), 1);
          } catch (error) {
            failures.push(error);
          }
        }
        return failures.length === 0
          ? ({ outcome: 'updated' as const } as const)
          : ({ error: failures, outcome: 'menu-install-failed' as const } as const);
      } finally {
        record.pendingMenuOperations.delete(pendingOperation);
        finishOperation();
      }
    };
    return finishEntity(out);
  })();

  const common = {
    image,
    lifecycle,
    menu,
    menuSelectionEvents: (() => { const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>(); out.getSignal = (tray: TrayIcon) => activeRecord(records, tray)?.menuSelectionEvents ?? null; return finishEntity(out); })(),
  };

  const title = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.get = async (tray: TrayIcon) => {
      const record = activeRecord(records, tray);
      return record === null
        ? ({ outcome: 'tray-destroyed' as const } as const)
        : ({ outcome: 'available' as const, title: record.title } as const);
    };
    out.set = async (tray: TrayIcon, value: string) => {
      const result = await update(records, tray, 'title-update-failed', async (record) => record.icon.setTitle(value));
      if (result.outcome === 'updated') records.get(tray)!.title = value;
      return result;
    };
    return finishEntity(out);
  })();

  if (profile === 'linux') {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.image = common.image;
    out.lifecycle = common.lifecycle;
    out.menu = common.menu;
    out.menuSelectionEvents = common.menuSelectionEvents;
    out.title = title;
    return finishEntity(out) as unknown as TauriTrayCapabilitiesFor<Profile>;
  }

  const interactionEvents = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.getSignal = (tray: TrayIcon) => activeRecord(records, tray)?.interactionEvents ?? null;
    return finishEntity(out);
  })();
  const tooltip = (() => {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.get = async (tray: TrayIcon) => {
      const record = activeRecord(records, tray);
      return record === null
        ? ({ outcome: 'tray-destroyed' as const } as const)
        : ({ outcome: 'available' as const, tooltip: record.tooltip } as const);
    };
    out.set = async (tray: TrayIcon, value: string) => {
      const result = await update(records, tray, 'tooltip-update-failed', async (record) =>
        record.icon.setTooltip(value),
      );
      if (result.outcome === 'updated') records.get(tray)!.tooltip = value;
      return result;
    };
    return finishEntity(out);
  })();

  if (profile === 'windows') {
    const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
    out.image = common.image;
    out.lifecycle = common.lifecycle;
    out.menu = common.menu;
    out.menuSelectionEvents = common.menuSelectionEvents;
    out.interactionEvents = interactionEvents;
    out.tooltip = tooltip;
    return finishEntity(out) as unknown as TauriTrayCapabilitiesFor<Profile>;
  }
  // The double cast is what a generic conditional return costs; allocateEntity/finishEntity is what
  // makes the Entity arm of that claim true at runtime rather than only in the annotation.
  const templateImageEntity = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
  templateImageEntity.set = async (tray: TrayIcon, isTemplate: boolean) => {
    return update(records, tray, 'template-image-update-failed', async (record) =>
      record.icon.setIconAsTemplate(isTemplate),
    );
  };
  const templateImage = finishEntity(templateImageEntity);
  const out = allocateEntity<TauriTrayCapabilitiesFor<Profile>>();
  out.image = common.image;
  out.lifecycle = common.lifecycle;
  out.menu = common.menu;
  out.menuSelectionEvents = common.menuSelectionEvents;
  out.interactionEvents = interactionEvents;
  out.templateImage = templateImage;
  out.title = title;
  out.tooltip = tooltip;
  return finishEntity(out) as unknown as TauriTrayCapabilitiesFor<Profile>;
}

function activeRecord(records: ReadonlyMap<TrayIcon, TrayRecord>, tray: TrayIcon): TrayRecord | null {
  const record = records.get(tray);
  return record !== undefined && !record.destroying ? record : null;
}

function emitInteraction(
  signal: Signal<(event: Readonly<TrayInteractionEvent>) => void>,
  event: Readonly<TauriTrayIconEvent>,
): void {
  const type = toInteractionType(event);
  if (type === null) return;
  emitSignal(signal, {
    altKey: false,
    bounds: event.rect
      ? {
          height: event.rect.size.height,
          width: event.rect.size.width,
          x: event.rect.position.x,
          y: event.rect.position.y,
        }
      : null,
    ctrlKey: false,
    metaKey: false,
    position: event.position ? { x: event.position.x, y: event.position.y } : null,
    shiftKey: false,
    type,
  });
}

function toInteractionType(event: Readonly<TauriTrayIconEvent>): TrayInteractionEvent['type'] | null {
  if (event.type === 'DoubleClick') return 'doubleClick';
  if (event.type === 'Click') return event.button === 'Right' ? 'rightClick' : 'click';
  return null;
}

async function buildTrayItems(
  menuModule: TauriApi['menu'],
  items: readonly MenuItemTemplate[],
  onSelect: (id: string) => void,
): Promise<TauriMenuItemHandle[]> {
  const built: TauriMenuItemHandle[] = [];
  for (const item of items) {
    if (item.type === 'separator') {
      built.push(await menuModule.PredefinedMenuItem.new({ item: 'Separator' }));
    } else if (item.submenu) {
      built.push(
        await menuModule.Submenu.new({
          enabled: item.enabled,
          items: await buildTrayItems(menuModule, item.submenu, onSelect),
          text: item.label,
        }),
      );
    } else {
      built.push(
        await menuModule.MenuItem.new({
          accelerator: item.accelerator,
          action: item.id === undefined ? undefined : () => onSelect(item.id!),
          enabled: item.enabled,
          id: item.id,
          text: item.label,
        }),
      );
    }
  }
  return built;
}

async function closeStaleMenu(record: TrayRecord, menu: TauriMenu): Promise<void> {
  try {
    await menu.close();
  } catch {
    record.menus.push(menu);
  }
}

async function update<
  Failure extends
    | 'image-update-failed'
    | 'template-image-update-failed'
    | 'title-update-failed'
    | 'tooltip-update-failed',
>(
  records: ReadonlyMap<TrayIcon, TrayRecord>,
  tray: TrayIcon,
  failure: Failure,
  operation: (record: TrayRecord) => Promise<void>,
) {
  const record = activeRecord(records, tray);
  if (record === null) return { outcome: 'tray-destroyed' as const };
  try {
    await operation(record);
    return { outcome: 'updated' as const };
  } catch (error) {
    return { error, outcome: failure };
  }
}
