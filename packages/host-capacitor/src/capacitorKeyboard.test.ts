import type { SoftKeyboardInfo } from '@flighthq/types';
import { SoftKeyboardResizeBodyKind } from '@flighthq/types';

import { createCapacitorKeyboardBackend } from './capacitorKeyboard';
import type { CapacitorApi } from './capacitorModule';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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
  it('maps show/hide and setters onto the plugin', () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    backend.show();
    backend.hide();
    backend.setResizeMode?.(SoftKeyboardResizeBodyKind);
    backend.setScrollAssistEnabled?.(false);
    expect(calls.map((c) => c.method)).toEqual(['show', 'hide', 'setResizeMode', 'setScroll']);
    expect(calls[2].arg).toEqual({ mode: 'body' });
    expect(calls[3].arg).toEqual({ isDisabled: true });
  });

  it('tracks the keyboard mirror from will-show/will-hide events', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    await flush();
    fire('keyboardWillShow', { keyboardHeight: 320 });
    const shown = backend.getInfo(blankInfo());
    expect(shown.visible).toBe(true);
    expect(shown.height).toBe(320);
    fire('keyboardWillHide');
    expect(backend.getInfo(blankInfo()).visible).toBe(false);
  });

  it('delivers will-phase transitions to a subscriber', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorKeyboardBackend(capacitor);
    const events: Array<{ phase: string; height: number }> = [];
    backend.subscribe((phase, transition) => events.push({ phase, height: transition.height }));
    await flush();
    fire('keyboardWillShow', { keyboardHeight: 300 });
    fire('keyboardWillHide');
    expect(events).toEqual([
      { phase: 'will', height: 300 },
      { phase: 'will', height: 0 },
    ]);
  });
});
