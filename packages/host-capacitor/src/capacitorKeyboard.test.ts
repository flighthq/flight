import type { CapacitorApi, SoftKeyboardInfo } from '@flighthq/types/contract';
import { EntityRuntimeKey, SoftKeyboardResizeBodyKind } from '@flighthq/types/contract';

import {
  createCapacitorSoftKeyboardAccessoryBarBackend,
  createCapacitorSoftKeyboardChangeBackend,
  createCapacitorSoftKeyboardInfoBackend,
  createCapacitorSoftKeyboardResizeModeWriteBackend,
  createCapacitorSoftKeyboardScrollAssistBackend,
  createCapacitorSoftKeyboardStyleBackend,
  createCapacitorSoftKeyboardVisibilityBackend,
} from './capacitorKeyboard';

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

describe('createCapacitorSoftKeyboardAccessoryBarBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorSoftKeyboardAccessoryBarBackend(fakeCapacitor().capacitor)).toBe(true);
  });

  it('returns ok on success', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardAccessoryBarBackend(capacitor);
    expect(await backend.setAccessoryBarVisible(true)).toBe('ok');
    expect(calls[0].arg).toEqual({ isVisible: true });
  });

  it('returns operation-failed on plugin rejection', async () => {
    const failCapacitor = {
      keyboard: {
        async setAccessoryBarVisible() {
          throw new Error('unavailable');
        },
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    expect(await createCapacitorSoftKeyboardAccessoryBarBackend(failCapacitor).setAccessoryBarVisible(true)).toBe(
      'operation-failed',
    );
  });
});

describe('createCapacitorSoftKeyboardChangeBackend', () => {
  it('subscribe returns ok with unsubscribe and fires on will events', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardChangeBackend(capacitor);
    let fires = 0;
    const subscription = await backend.subscribe(() => fires++);
    expect(subscription.result).toBe('ok');
    expect(subscription.unsubscribe).not.toBeNull();
    fire('keyboardWillShow', { keyboardHeight: 300 });
    fire('keyboardWillHide');
    expect(fires).toBe(2);
    subscription.unsubscribe!();
  });

  it('subscribe returns acquisition-failed when listener attachment fails', async () => {
    const failCapacitor = {
      keyboard: {
        async addListener() {
          throw new Error('not available');
        },
      },
    } as unknown as CapacitorApi;
    const subscription = await createCapacitorSoftKeyboardChangeBackend(failCapacitor).subscribe(() => {});
    expect(subscription.result).toBe('acquisition-failed');
    expect(subscription.unsubscribe).toBeNull();
  });
});

describe('createCapacitorSoftKeyboardInfoBackend', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorSoftKeyboardInfoBackend(fakeCapacitor().capacitor)).toBe(true);
  });

  it('tracks the keyboard mirror from will-show/will-hide events', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardInfoBackend(capacitor);
    await Promise.resolve();
    fire('keyboardWillShow', { keyboardHeight: 320 });
    const shown = backend.getInfo(blankInfo());
    expect(shown.visible).toBe(true);
    expect(shown.height).toBe(320);
    fire('keyboardWillHide');
    expect(backend.getInfo(blankInfo()).visible).toBe(false);
  });
});

describe('createCapacitorSoftKeyboardResizeModeWriteBackend', () => {
  it('returns ok on success and maps the mode', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardResizeModeWriteBackend(capacitor);
    expect(await backend.setResizeMode(SoftKeyboardResizeBodyKind)).toBe('ok');
    expect(calls[0].arg).toEqual({ mode: 'body' });
  });

  it('returns operation-failed on plugin rejection', async () => {
    const failCapacitor = {
      keyboard: {
        async setResizeMode() {
          throw new Error('unavailable');
        },
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    expect(await createCapacitorSoftKeyboardResizeModeWriteBackend(failCapacitor).setResizeMode('None')).toBe(
      'operation-failed',
    );
  });
});

describe('createCapacitorSoftKeyboardScrollAssistBackend', () => {
  it('returns ok on success', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardScrollAssistBackend(capacitor);
    expect(await backend.setScrollAssistEnabled(false)).toBe('ok');
    expect(calls[0].arg).toEqual({ isDisabled: true });
  });

  it('returns operation-failed on plugin rejection', async () => {
    const failCapacitor = {
      keyboard: {
        async setScroll() {
          throw new Error('unavailable');
        },
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    expect(await createCapacitorSoftKeyboardScrollAssistBackend(failCapacitor).setScrollAssistEnabled(true)).toBe(
      'operation-failed',
    );
  });
});

describe('createCapacitorSoftKeyboardStyleBackend', () => {
  it('returns ok on success', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardStyleBackend(capacitor);
    expect(await backend.setStyle('Dark')).toBe('ok');
    expect(calls[0].arg).toEqual({ style: 'DARK' });
  });

  it('returns operation-failed on plugin rejection', async () => {
    const failCapacitor = {
      keyboard: {
        async setStyle() {
          throw new Error('unavailable');
        },
        async addListener() {
          return { async remove() {} };
        },
      },
    } as unknown as CapacitorApi;
    expect(await createCapacitorSoftKeyboardStyleBackend(failCapacitor).setStyle('Dark')).toBe('operation-failed');
  });
});

describe('createCapacitorSoftKeyboardVisibilityBackend', () => {
  it('returns ok when show/hide succeed', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorSoftKeyboardVisibilityBackend(capacitor);
    expect(await backend.show()).toBe('ok');
    expect(await backend.hide()).toBe('ok');
    expect(calls.map((c) => c.method)).toEqual(['show', 'hide']);
  });

  it('returns operation-failed when show rejects', async () => {
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
    expect(await createCapacitorSoftKeyboardVisibilityBackend(failCapacitor).show()).toBe('operation-failed');
  });

  it('returns operation-failed when hide rejects', async () => {
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
    expect(await createCapacitorSoftKeyboardVisibilityBackend(failCapacitor).hide()).toBe('operation-failed');
  });
});
