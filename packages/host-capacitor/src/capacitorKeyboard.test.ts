import type { CapacitorApi, SoftKeyboardInfo } from '@flighthq/types/contract';
import { EntityRuntimeKey, SoftKeyboardResizeBodyKind } from '@flighthq/types/contract';

import { createCapacitorKeyboardBackend } from './capacitorKeyboard';

function fakeCapacitor() {
  const calls: Array<{ method: string; arg?: unknown }> = [];
  const listeners = new Map<string, Array<(info?: unknown) => void>>();
  const capacitor = {
    keyboard: {
      async show() {
        calls.push({ method: 'show' });
      },
      async hide() {
        calls.push({ method: 'hide' });
      },
      async setAccessoryBarVisible(arg: unknown) {
        calls.push({ method: 'setAccessoryBarVisible', arg });
      },
      async setResizeMode(arg: unknown) {
        calls.push({ method: 'setResizeMode', arg });
      },
      async setScroll(arg: unknown) {
        calls.push({ method: 'setScroll', arg });
      },
      async setStyle(arg: unknown) {
        calls.push({ method: 'setStyle', arg });
      },
      async addListener(eventName: string, listener: (info?: unknown) => void) {
        const list = listeners.get(eventName) ?? [];
        list.push(listener);
        listeners.set(eventName, list);
        return { async remove() {} };
      },
    },
  } as unknown as CapacitorApi;
  const fire = (eventName: string, info?: unknown) => listeners.get(eventName)?.forEach((l) => l(info));
  return { capacitor, calls, fire };
}

function blankInfo(): SoftKeyboardInfo {
  return { visible: false, height: 0, x: 0, y: 0, width: 0 };
}

describe('createCapacitorKeyboardBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorKeyboardBackend(fakeCapacitor().capacitor)).toBe(true);
  });

  it('maps show/hide onto the plugin and returns true', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    expect(await backend.show()).toBe(true);
    expect(await backend.hide()).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['show', 'hide']);
  });

  it('maps setters onto the plugin and returns true', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    expect(await backend.setResizeMode?.(SoftKeyboardResizeBodyKind)).toBe(true);
    expect(await backend.setScrollAssistEnabled?.(false)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['setResizeMode', 'setScroll']);
    expect(calls[0].arg).toEqual({ mode: 'body' });
    expect(calls[1].arg).toEqual({ isDisabled: true });
  });

  it('tracks the keyboard mirror from will-show/will-hide events', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    await Promise.resolve();
    fire('keyboardWillShow', { keyboardHeight: 320 });
    const shown = backend.getInfo(blankInfo());
    expect(shown.visible).toBe(true);
    expect(shown.height).toBe(320);
    fire('keyboardWillHide');
    expect(backend.getInfo(blankInfo()).visible).toBe(false);
  });

  it('subscribe returns a cleanup function and fires on will events', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    let fires = 0;
    const cleanup = await backend.subscribe(() => fires++);
    expect(cleanup).not.toBeNull();
    fire('keyboardWillShow', { keyboardHeight: 300 });
    fire('keyboardWillHide');
    expect(fires).toBe(2);
    cleanup!();
  });

  it('subscribe returns null when listener attachment fails', async () => {
    const failCapacitor = {
      keyboard: {
        async show() {},
        async hide() {},
        async addListener() {
          throw new Error('not available');
        },
      },
    } as unknown as CapacitorApi;
    const backend = createCapacitorKeyboardBackend(failCapacitor);
    expect(await backend.subscribe(() => {})).toBeNull();
  });

  it('show returns false when plugin rejects', async () => {
    const failCapacitor = {
      keyboard: {
        async show() {
          throw new Error('unavailable');
        },
        async hide() {},
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    const backend = createCapacitorKeyboardBackend(failCapacitor);
    expect(await backend.show()).toBe(false);
  });

  it('hide returns false when plugin rejects', async () => {
    const failCapacitor = {
      keyboard: {
        async show() {},
        async hide() {
          throw new Error('unavailable');
        },
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    const backend = createCapacitorKeyboardBackend(failCapacitor);
    expect(await backend.hide()).toBe(false);
  });
});
