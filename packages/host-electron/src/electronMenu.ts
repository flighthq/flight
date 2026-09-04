import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronMenuCapabilities,
  EntityConstruction,
  MenuApplicationBackend,
  MenuPopupBackend,
  MenuSelectBackend,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate';

// Maps Flight's menu slots onto Electron's Menu module. Flight menu items are plain templates with a
// stable `id`; Electron delivers selection through per-item `click` callbacks, so the seam funnels those
// clicks back through an explicit onSelect. Application-menu clicks go to the listener registered on the
// select slot; context-menu clicks resolve the popup Promise with the clicked id.
//
// The three slots are built together because `application` and `select` genuinely SHARE state: the
// listener the select slot registers is the one setApplicationMenu wires into the rebuilt menu. They stay
// separate SLOTS because their shapes are incompatible — a command returning boolean and an event
// subscription returning an unsubscribe — but a caller taking only one of them still gets a coherent
// pair, because both read the same closure.
export function createElectronMenuBackends(electron: ElectronApi): ElectronMenuCapabilities {
  const menuState = { selectListener: null as ((id: string) => void) | null, destroyed: false };
  const application = (() => {
    const b = allocateEntity<MenuApplicationBackend>();
    initializeMenuApplicationBackend(b, electron, menuState);
    return finishEntity(b);
  })();
  const popup = (() => {
    const b = allocateEntity<MenuPopupBackend>();
    initializeMenuPopupBackend(b, electron);
    return finishEntity(b);
  })();
  const select = (() => {
    const b = allocateEntity<MenuSelectBackend>();
    initializeMenuSelectBackend(b, menuState);
    return finishEntity(b);
  })();
  const out = allocateEntity<ElectronMenuCapabilities>();
  initializeElectronMenuCapabilities(out, application, popup, select);
  return finishEntity(out);
}

export function initializeElectronMenuCapabilities(
  out: EntityConstruction<ElectronMenuCapabilities>,
  application: MenuApplicationBackend,
  popup: MenuPopupBackend,
  select: MenuSelectBackend,
): void {
  out.application = application;
  out.popup = popup;
  out.select = select;
}

export function initializeMenuApplicationBackend(
  out: EntityConstruction<MenuApplicationBackend>,
  electron: ElectronApi,
  menuState: { selectListener: ((id: string) => void) | null; destroyed: boolean },
): void {
  // Provider lifecycle: releases the OS menu this provider installed. It deliberately does NOT end
  // select subscriptions — those are ended by their own unsubscribe.
  out.destroy = (): void => {
    if (menuState.destroyed) return;
    menuState.destroyed = true;
    electron.Menu.setApplicationMenu(null);
  };
  out.setApplicationMenu = (items): boolean => {
    electron.Menu.setApplicationMenu(
      electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => menuState.selectListener?.(id))),
    );
    return true;
  };
}

export function initializeMenuPopupBackend(out: EntityConstruction<MenuPopupBackend>, electron: ElectronApi): void {
  // The Electron seam exposes no menu close event, so the Promise resolves on the first item click
  // and never resolves to null from a dismissal — callers treat a non-resolving Promise as "still
  // open". We resolve null only if popup throws.
  out.popup = (items, x, y): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      const menu = electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => resolve(id)));
      try {
        menu.popup({ x, y });
      } catch {
        resolve(null);
      }
    });
  };
}

export function initializeMenuSelectBackend(
  out: EntityConstruction<MenuSelectBackend>,
  menuState: { selectListener: ((id: string) => void) | null; destroyed: boolean },
): void {
  out.subscribe = (listener): (() => void) => {
    menuState.selectListener = listener;
    return () => {
      if (menuState.selectListener === listener) menuState.selectListener = null;
    };
  };
}
