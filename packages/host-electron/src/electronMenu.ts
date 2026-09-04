import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronMenuCapabilities,
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
  let selectListener: ((id: string) => void) | null = null;
  let destroyed = false;
    const out = allocateEntity<ElectronMenuCapabilities>();
  out.application = (() => {
    const b = allocateEntity<MenuApplicationBackend>();
    // Provider lifecycle: releases the OS menu this provider installed. It deliberately does NOT end
    // select subscriptions — those are ended by their own unsubscribe.
    b.destroy = (): void => {
      if (destroyed) return;
      destroyed = true;
      electron.Menu.setApplicationMenu(null);
    };
    b.setApplicationMenu = (items): boolean => {
      electron.Menu.setApplicationMenu(
        electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => selectListener?.(id))),
      );
      return true;
    };
    return finishEntity(b);
  })();
  out.popup = (() => {
    const b = allocateEntity<MenuPopupBackend>();
    // The Electron seam exposes no menu close event, so the Promise resolves on the first item click
    // and never resolves to null from a dismissal — callers treat a non-resolving Promise as "still
    // open". We resolve null only if popup throws.
    b.popup = (items, x, y): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        const menu = electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => resolve(id)));
        try {
          menu.popup({ x, y });
        } catch {
          resolve(null);
        }
      });
    };
    return finishEntity(b);
  })();
  out.select = (() => {
    const b = allocateEntity<MenuSelectBackend>();
    b.subscribe = (listener): (() => void) => {
      selectListener = listener;
      return () => {
        if (selectListener === listener) selectListener = null;
      };
    };
    return finishEntity(b);
  })();
  return finishEntity(out);
}
