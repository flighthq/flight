import { createEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type {
  SoftKeyboardAccessoryBarBackend,
  SoftKeyboardChangeBackend,
  SoftKeyboardInfo,
  SoftKeyboardInfoBackend,
  SoftKeyboardResizeModeWriteBackend,
  SoftKeyboardScrollAssistBackend,
  SoftKeyboardSetterResult,
  SoftKeyboardStyleBackend,
  SoftKeyboardVisibilityBackend,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

type OmitRuntime<T> = Omit<T, typeof EntityRuntimeKey>;

import {
  attachSoftKeyboard,
  createSoftKeyboard,
  detachSoftKeyboard,
  disposeSoftKeyboard,
  getSoftKeyboardAccessoryBarBackend,
  getSoftKeyboardChangeBackend,
  getSoftKeyboardHeight,
  getSoftKeyboardInfo,
  getSoftKeyboardInfoBackend,
  getSoftKeyboardResizeModeWriteBackend,
  getSoftKeyboardScrollAssistBackend,
  getSoftKeyboardStyleBackend,
  getSoftKeyboardVisibilityBackend,
  hideSoftKeyboard,
  installSoftKeyboardAccessoryBarHostBackend,
  installSoftKeyboardChangeHostBackend,
  installSoftKeyboardInfoHostBackend,
  installSoftKeyboardResizeModeWriteHostBackend,
  installSoftKeyboardScrollAssistHostBackend,
  installSoftKeyboardStyleHostBackend,
  installSoftKeyboardVisibilityHostBackend,
  isSoftKeyboardVisible,
  resetSoftKeyboardBackendForTest,
  setSoftKeyboardAccessoryBarBackend,
  setSoftKeyboardAccessoryBarVisible,
  setSoftKeyboardChangeBackend,
  setSoftKeyboardInfoBackend,
  setSoftKeyboardResizeMode,
  setSoftKeyboardResizeModeWriteBackend,
  setSoftKeyboardScrollAssistBackend,
  setSoftKeyboardScrollAssistEnabled,
  setSoftKeyboardStyle,
  setSoftKeyboardStyleBackend,
  setSoftKeyboardVisibilityBackend,
  showSoftKeyboard,
} from './keyboard';

function blankInfo(): SoftKeyboardInfo {
  return { visible: false, height: 0, x: 0, y: 0, width: 0 };
}

function fakeInfoBackend(info: Partial<SoftKeyboardInfo> = {}): SoftKeyboardInfoBackend & { _state: SoftKeyboardInfo } {
  const state: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0, ...info };
  return createEntity({
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = state.visible;
      out.height = state.height;
      out.x = state.x;
      out.y = state.y;
      out.width = state.width;
      return out;
    },
    _state: state,
  } satisfies OmitRuntime<SoftKeyboardInfoBackend> & { _state: SoftKeyboardInfo });
}

function fakeChangeBackend(): SoftKeyboardChangeBackend & { fire(): void } {
  let listener: (() => void) | null = null;
  const backend = createEntity({
    async subscribe(fn: () => void): Promise<(() => void) | null> {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  } satisfies OmitRuntime<SoftKeyboardChangeBackend>);
  const extended = backend as SoftKeyboardChangeBackend & { fire(): void };
  (extended as unknown as { fire(): void }).fire = () => listener?.();
  return extended;
}

function fakeAccessoryBarBackend(result: SoftKeyboardSetterResult = 'ok'): SoftKeyboardAccessoryBarBackend {
  return createEntity({
    async setAccessoryBarVisible(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  } satisfies OmitRuntime<SoftKeyboardAccessoryBarBackend>);
}

function fakeResizeModeWriteBackend(result: SoftKeyboardSetterResult = 'ok'): SoftKeyboardResizeModeWriteBackend {
  return createEntity({
    async setResizeMode(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  } satisfies OmitRuntime<SoftKeyboardResizeModeWriteBackend>);
}

function fakeScrollAssistBackend(result: SoftKeyboardSetterResult = 'ok'): SoftKeyboardScrollAssistBackend {
  return createEntity({
    async setScrollAssistEnabled(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  } satisfies OmitRuntime<SoftKeyboardScrollAssistBackend>);
}

function fakeStyleBackend(result: SoftKeyboardSetterResult = 'ok'): SoftKeyboardStyleBackend {
  return createEntity({
    async setStyle(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  } satisfies OmitRuntime<SoftKeyboardStyleBackend>);
}

function fakeVisibilityBackend(
  showResult: SoftKeyboardVisibilityResult = 'ok',
  hideResult: SoftKeyboardVisibilityResult = 'ok',
): SoftKeyboardVisibilityBackend {
  return createEntity({
    async show(): Promise<SoftKeyboardVisibilityResult> {
      return showResult;
    },
    async hide(): Promise<SoftKeyboardVisibilityResult> {
      return hideResult;
    },
  } satisfies OmitRuntime<SoftKeyboardVisibilityBackend>);
}

afterEach(() => resetSoftKeyboardBackendForTest());

describe('attachSoftKeyboard', () => {
  it('returns no-provider when info backend is absent', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardChangeBackend(fakeChangeBackend());
    expect(await attachSoftKeyboard(keyboard)).toBe('no-provider');
  });

  it('returns no-provider when change backend is absent', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardInfoBackend(fakeInfoBackend());
    expect(await attachSoftKeyboard(keyboard)).toBe('no-provider');
  });

  it('returns ok when both info and change are present', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardInfoBackend(fakeInfoBackend());
    setSoftKeyboardChangeBackend(fakeChangeBackend());
    expect(await attachSoftKeyboard(keyboard)).toBe('ok');
  });

  it('returns acquisition-failed when subscribe returns null', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardInfoBackend(fakeInfoBackend());
    setSoftKeyboardChangeBackend(
      createEntity({
        async subscribe(): Promise<(() => void) | null> {
          return null;
        },
      } satisfies OmitRuntime<SoftKeyboardChangeBackend>),
    );
    expect(await attachSoftKeyboard(keyboard)).toBe('acquisition-failed');
  });

  it('fires onShow when keyboard appears', async () => {
    const keyboard = createSoftKeyboard();
    const info = fakeInfoBackend();
    const change = fakeChangeBackend();
    setSoftKeyboardInfoBackend(info);
    setSoftKeyboardChangeBackend(change);
    await attachSoftKeyboard(keyboard);
    const heights: number[] = [];
    connectSignal(keyboard.onShow, (h) => heights.push(h));
    (info as unknown as { _state: SoftKeyboardInfo })._state.visible = true;
    (info as unknown as { _state: SoftKeyboardInfo })._state.height = 300;
    change.fire();
    expect(heights).toEqual([300]);
  });

  it('fires onHide when keyboard disappears', async () => {
    const keyboard = createSoftKeyboard();
    const info = fakeInfoBackend({ visible: true, height: 300 });
    const change = fakeChangeBackend();
    setSoftKeyboardInfoBackend(info);
    setSoftKeyboardChangeBackend(change);
    await attachSoftKeyboard(keyboard);
    let hides = 0;
    connectSignal(keyboard.onHide, () => hides++);
    (info as unknown as { _state: SoftKeyboardInfo })._state.visible = false;
    (info as unknown as { _state: SoftKeyboardInfo })._state.height = 0;
    change.fire();
    expect(hides).toBe(1);
  });

  it('fires onResize when visible height changes', async () => {
    const keyboard = createSoftKeyboard();
    const info = fakeInfoBackend({ visible: true, height: 300 });
    const change = fakeChangeBackend();
    setSoftKeyboardInfoBackend(info);
    setSoftKeyboardChangeBackend(change);
    await attachSoftKeyboard(keyboard);
    const resizes: number[] = [];
    connectSignal(keyboard.onResize, (h) => resizes.push(h));
    (info as unknown as { _state: SoftKeyboardInfo })._state.height = 350;
    change.fire();
    expect(resizes).toEqual([350]);
  });

  it('detaches previous subscription on re-attach', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardInfoBackend(fakeInfoBackend());
    const change = fakeChangeBackend();
    setSoftKeyboardChangeBackend(change);
    await attachSoftKeyboard(keyboard);
    let fires = 0;
    connectSignal(keyboard.onShow, () => fires++);
    const change2 = fakeChangeBackend();
    setSoftKeyboardChangeBackend(change2);
    const info2 = fakeInfoBackend();
    setSoftKeyboardInfoBackend(info2);
    await attachSoftKeyboard(keyboard);
    (info2 as unknown as { _state: SoftKeyboardInfo })._state.height = 300;
    change.fire();
    expect(fires).toBe(0);
  });
});

describe('createSoftKeyboard', () => {
  it('returns an Entity', () => {
    const keyboard = createSoftKeyboard();
    expect(EntityRuntimeKey in keyboard).toBe(true);
  });

  it('has onShow, onHide, onResize signals', () => {
    const keyboard = createSoftKeyboard();
    expect(keyboard.onShow).toBeDefined();
    expect(keyboard.onHide).toBeDefined();
    expect(keyboard.onResize).toBeDefined();
  });
});

describe('detachSoftKeyboard', () => {
  it('does not throw when not attached', () => {
    const keyboard = createSoftKeyboard();
    expect(() => detachSoftKeyboard(keyboard)).not.toThrow();
  });

  it('stops signal fires after detach', async () => {
    const keyboard = createSoftKeyboard();
    const info = fakeInfoBackend();
    const change = fakeChangeBackend();
    setSoftKeyboardInfoBackend(info);
    setSoftKeyboardChangeBackend(change);
    await attachSoftKeyboard(keyboard);
    let fires = 0;
    connectSignal(keyboard.onShow, () => fires++);
    detachSoftKeyboard(keyboard);
    (info as unknown as { _state: SoftKeyboardInfo })._state.height = 300;
    change.fire();
    expect(fires).toBe(0);
  });
});

describe('disposeSoftKeyboard', () => {
  it('detaches an attached keyboard', async () => {
    const keyboard = createSoftKeyboard();
    setSoftKeyboardInfoBackend(fakeInfoBackend());
    setSoftKeyboardChangeBackend(fakeChangeBackend());
    await attachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });
});

describe('getSoftKeyboardAccessoryBarBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardAccessoryBarBackend()).toBeNull();
  });

  it('returns the custom backend when set', () => {
    const backend = fakeAccessoryBarBackend();
    setSoftKeyboardAccessoryBarBackend(backend);
    expect(getSoftKeyboardAccessoryBarBackend()).toBe(backend);
  });

  it('prefers custom over host backend', () => {
    const host = fakeAccessoryBarBackend();
    const custom = fakeAccessoryBarBackend();
    installSoftKeyboardAccessoryBarHostBackend(host);
    setSoftKeyboardAccessoryBarBackend(custom);
    expect(getSoftKeyboardAccessoryBarBackend()).toBe(custom);
  });
});

describe('getSoftKeyboardChangeBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardChangeBackend()).toBeNull();
  });
});

describe('getSoftKeyboardHeight', () => {
  it('returns 0 when no info backend is set', () => {
    expect(getSoftKeyboardHeight()).toBe(0);
  });

  it('returns the backend height', () => {
    setSoftKeyboardInfoBackend(fakeInfoBackend({ height: 250 }));
    expect(getSoftKeyboardHeight()).toBe(250);
  });
});

describe('getSoftKeyboardInfo', () => {
  it('returns zeroed info when no backend is set', () => {
    const out = blankInfo();
    getSoftKeyboardInfo(out);
    expect(out.visible).toBe(false);
    expect(out.height).toBe(0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
  });

  it('delegates to the info backend', () => {
    setSoftKeyboardInfoBackend(fakeInfoBackend({ visible: true, height: 300, x: 10, y: 500, width: 400 }));
    const out = blankInfo();
    getSoftKeyboardInfo(out);
    expect(out.visible).toBe(true);
    expect(out.height).toBe(300);
    expect(out.x).toBe(10);
    expect(out.y).toBe(500);
    expect(out.width).toBe(400);
  });
});

describe('getSoftKeyboardInfoBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardInfoBackend()).toBeNull();
  });
});

describe('getSoftKeyboardResizeModeWriteBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardResizeModeWriteBackend()).toBeNull();
  });
});

describe('getSoftKeyboardScrollAssistBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardScrollAssistBackend()).toBeNull();
  });
});

describe('getSoftKeyboardStyleBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardStyleBackend()).toBeNull();
  });
});

describe('getSoftKeyboardVisibilityBackend', () => {
  it('returns null when no backend is set', () => {
    expect(getSoftKeyboardVisibilityBackend()).toBeNull();
  });
});

describe('hideSoftKeyboard', () => {
  it('returns runtime-unavailable when no visibility backend is set', async () => {
    expect(await hideSoftKeyboard()).toBe('runtime-unavailable');
  });

  it('returns ok when visibility backend is present', async () => {
    setSoftKeyboardVisibilityBackend(fakeVisibilityBackend());
    expect(await hideSoftKeyboard()).toBe('ok');
  });

  it('returns operation-failed when backend reports failure', async () => {
    setSoftKeyboardVisibilityBackend(fakeVisibilityBackend('ok', 'operation-failed'));
    expect(await hideSoftKeyboard()).toBe('operation-failed');
  });
});

describe('installSoftKeyboardAccessoryBarHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeAccessoryBarBackend();
    installSoftKeyboardAccessoryBarHostBackend(backend);
    expect(getSoftKeyboardAccessoryBarBackend()).toBe(backend);
  });
});

describe('installSoftKeyboardChangeHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeChangeBackend();
    installSoftKeyboardChangeHostBackend(backend);
    expect(getSoftKeyboardChangeBackend()).toBe(backend);
  });
});

describe('installSoftKeyboardInfoHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeInfoBackend();
    installSoftKeyboardInfoHostBackend(backend);
    expect(getSoftKeyboardInfoBackend()).toBe(backend);
  });

  it('rejects a second install', () => {
    const first = fakeInfoBackend();
    const second = fakeInfoBackend();
    installSoftKeyboardInfoHostBackend(first);
    installSoftKeyboardInfoHostBackend(second);
    expect(getSoftKeyboardInfoBackend()).toBe(first);
  });
});

describe('installSoftKeyboardResizeModeWriteHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeResizeModeWriteBackend();
    installSoftKeyboardResizeModeWriteHostBackend(backend);
    expect(getSoftKeyboardResizeModeWriteBackend()).toBe(backend);
  });
});

describe('installSoftKeyboardScrollAssistHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeScrollAssistBackend();
    installSoftKeyboardScrollAssistHostBackend(backend);
    expect(getSoftKeyboardScrollAssistBackend()).toBe(backend);
  });
});

describe('installSoftKeyboardStyleHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeStyleBackend();
    installSoftKeyboardStyleHostBackend(backend);
    expect(getSoftKeyboardStyleBackend()).toBe(backend);
  });
});

describe('installSoftKeyboardVisibilityHostBackend', () => {
  it('installs the host backend', () => {
    const backend = fakeVisibilityBackend();
    installSoftKeyboardVisibilityHostBackend(backend);
    expect(getSoftKeyboardVisibilityBackend()).toBe(backend);
  });
});

describe('isSoftKeyboardVisible', () => {
  it('returns false when no info backend is set', () => {
    expect(isSoftKeyboardVisible()).toBe(false);
  });

  it('returns true when the info backend reports visible', () => {
    setSoftKeyboardInfoBackend(fakeInfoBackend({ visible: true, height: 300 }));
    expect(isSoftKeyboardVisible()).toBe(true);
  });
});

describe('setSoftKeyboardAccessoryBarVisible', () => {
  it('returns operation-unavailable when no backend is set', async () => {
    expect(await setSoftKeyboardAccessoryBarVisible(true)).toBe('operation-unavailable');
  });

  it('returns ok when backend is present', async () => {
    setSoftKeyboardAccessoryBarBackend(fakeAccessoryBarBackend());
    expect(await setSoftKeyboardAccessoryBarVisible(true)).toBe('ok');
  });
});

describe('setSoftKeyboardResizeMode', () => {
  it('returns operation-unavailable when no backend is set', async () => {
    expect(await setSoftKeyboardResizeMode('None')).toBe('operation-unavailable');
  });

  it('returns ok when backend is present', async () => {
    setSoftKeyboardResizeModeWriteBackend(fakeResizeModeWriteBackend());
    expect(await setSoftKeyboardResizeMode('Body')).toBe('ok');
  });
});

describe('setSoftKeyboardScrollAssistEnabled', () => {
  it('returns operation-unavailable when no backend is set', async () => {
    expect(await setSoftKeyboardScrollAssistEnabled(true)).toBe('operation-unavailable');
  });

  it('returns ok when backend is present', async () => {
    setSoftKeyboardScrollAssistBackend(fakeScrollAssistBackend());
    expect(await setSoftKeyboardScrollAssistEnabled(false)).toBe('ok');
  });
});

describe('setSoftKeyboardStyle', () => {
  it('returns operation-unavailable when no backend is set', async () => {
    expect(await setSoftKeyboardStyle('Dark')).toBe('operation-unavailable');
  });

  it('returns ok when backend is present', async () => {
    setSoftKeyboardStyleBackend(fakeStyleBackend());
    expect(await setSoftKeyboardStyle('Dark')).toBe('ok');
  });
});

describe('showSoftKeyboard', () => {
  it('returns runtime-unavailable when no visibility backend is set', async () => {
    expect(await showSoftKeyboard()).toBe('runtime-unavailable');
  });

  it('returns ok when visibility backend is present', async () => {
    setSoftKeyboardVisibilityBackend(fakeVisibilityBackend());
    expect(await showSoftKeyboard()).toBe('ok');
  });

  it('returns operation-failed when backend reports failure', async () => {
    setSoftKeyboardVisibilityBackend(fakeVisibilityBackend('operation-failed', 'ok'));
    expect(await showSoftKeyboard()).toBe('operation-failed');
  });
});
