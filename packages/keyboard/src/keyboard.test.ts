import { cancelSignal, connectSignal } from '@flighthq/signals/contract';
import type { SoftKeyboardBackend, SoftKeyboardInfo } from '@flighthq/types/contract';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
  SoftKeyboardStyleDefaultKind,
} from '@flighthq/types/contract';

import {
  attachSoftKeyboard,
  createSoftKeyboard,
  detachSoftKeyboard,
  disposeSoftKeyboard,
  getSoftKeyboardBackend,
  getSoftKeyboardHeight,
  getSoftKeyboardInfo,
  hasSoftKeyboardBackend,
  hideSoftKeyboard,
  installSoftKeyboardHostBackend,
  isSoftKeyboardVisible,
  resetSoftKeyboardBackendForTest,
  setSoftKeyboardAccessoryBarVisible,
  setSoftKeyboardBackend,
  setSoftKeyboardResizeMode,
  setSoftKeyboardScrollAssistEnabled,
  setSoftKeyboardStyle,
  showSoftKeyboard,
} from './keyboard';

function fakeBackend(): SoftKeyboardBackend & {
  visible: boolean;
  height: number;
  shown: boolean;
  hidden: boolean;
  resizeMode: string;
  accessoryBarVisible: boolean;
  scrollAssistEnabled: boolean;
  style: string;
  fire(): void;
} {
  let listener: (() => void) | null = null;
  return {
    visible: false,
    height: 0,
    shown: false,
    hidden: false,
    resizeMode: SoftKeyboardResizeNoneKind,
    accessoryBarVisible: false,
    scrollAssistEnabled: false,
    style: SoftKeyboardStyleDefaultKind,
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = this.visible;
      out.height = this.height;
      out.x = 0;
      out.y = 0;
      out.width = this.visible ? 375 : 0;
      return out;
    },
    async subscribe(l: () => void): Promise<(() => void) | null> {
      listener = l;
      return () => {
        listener = null;
      };
    },
    async show(): Promise<boolean> {
      this.shown = true;
      return true;
    },
    async hide(): Promise<boolean> {
      this.hidden = true;
      return true;
    },
    async setResizeMode(mode): Promise<boolean> {
      this.resizeMode = mode;
      return true;
    },
    async setAccessoryBarVisible(v): Promise<boolean> {
      this.accessoryBarVisible = v;
      return true;
    },
    async setScrollAssistEnabled(v): Promise<boolean> {
      this.scrollAssistEnabled = v;
      return true;
    },
    async setStyle(s): Promise<boolean> {
      this.style = s;
      return true;
    },
    fire() {
      listener?.();
    },
  };
}

function nullSubscribeBackend(): SoftKeyboardBackend {
  return {
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = false;
      out.height = 0;
      out.x = 0;
      out.y = 0;
      out.width = 0;
      return out;
    },
    subscribe(): Promise<(() => void) | null> {
      return Promise.resolve(null);
    },
    show(): Promise<boolean> {
      return Promise.resolve(false);
    },
    hide(): Promise<boolean> {
      return Promise.resolve(false);
    },
  };
}

function createScratch(): SoftKeyboardInfo {
  return { visible: false, height: 0, x: 0, y: 0, width: 0 };
}

afterEach(() => {
  setSoftKeyboardBackend(null);
  resetSoftKeyboardBackendForTest();
});

describe('attachSoftKeyboard', () => {
  it('returns true when subscription is acquired', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    expect(await attachSoftKeyboard(keyboard)).toBe(true);
  });

  it('returns false when backend subscribe returns null', async () => {
    setSoftKeyboardBackend(nullSubscribeBackend());
    const keyboard = createSoftKeyboard();
    expect(await attachSoftKeyboard(keyboard)).toBe(false);
  });

  it('returns false with sentinel backend (no backend installed)', async () => {
    const keyboard = createSoftKeyboard();
    expect(await attachSoftKeyboard(keyboard)).toBe(false);
  });

  it('emits onShow when height transitions from 0 to positive', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    let lastHeight = 0;
    connectSignal(keyboard.onShow, (h) => {
      shows++;
      lastHeight = h;
    });
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(shows).toBe(1);
    expect(lastHeight).toBe(300);
  });

  it('emits onHide when height transitions from positive to 0', async () => {
    const backend = fakeBackend();
    backend.visible = true;
    backend.height = 300;
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let hides = 0;
    connectSignal(keyboard.onHide, () => hides++);
    await attachSoftKeyboard(keyboard);
    backend.visible = false;
    backend.height = 0;
    backend.fire();
    expect(hides).toBe(1);
  });

  it('emits onResize when height changes while visible', async () => {
    const backend = fakeBackend();
    backend.visible = true;
    backend.height = 300;
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    let lastHeight = 0;
    connectSignal(keyboard.onResize, (h) => {
      resizes++;
      lastHeight = h;
    });
    await attachSoftKeyboard(keyboard);
    backend.height = 350;
    backend.fire();
    expect(resizes).toBe(1);
    expect(lastHeight).toBe(350);
  });

  it('does not emit onShow when already visible and height is unchanged', async () => {
    const backend = fakeBackend();
    backend.visible = true;
    backend.height = 300;
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    connectSignal(keyboard.onShow, () => shows++);
    await attachSoftKeyboard(keyboard);
    backend.fire();
    expect(shows).toBe(0);
  });

  it('is idempotent: prior subscription torn down on re-attach', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    connectSignal(keyboard.onShow, () => shows++);
    await attachSoftKeyboard(keyboard);
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(shows).toBe(1);
  });

  it('dispatches multiple listeners on a single show edge', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let a = 0;
    let b = 0;
    let c = 0;
    connectSignal(keyboard.onShow, () => a++);
    connectSignal(keyboard.onShow, () => b++);
    connectSignal(keyboard.onShow, () => c++);
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect([a, b, c]).toEqual([1, 1, 1]);
  });

  it('honors listener priority on the onShow signal', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    const order: string[] = [];
    connectSignal(keyboard.onShow, () => order.push('low'), { priority: 0 });
    connectSignal(keyboard.onShow, () => order.push('high'), { priority: 10 });
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(order).toEqual(['high', 'low']);
  });

  it('stops the onShow chain when an earlier listener cancels', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let reached = false;
    connectSignal(keyboard.onShow, () => cancelSignal(keyboard.onShow), { priority: 10 });
    connectSignal(keyboard.onShow, () => (reached = true), { priority: 0 });
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(reached).toBe(false);
  });

  it('tracks visibility correctly across rapid show/hide bursts', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    let hides = 0;
    connectSignal(keyboard.onShow, () => shows++);
    connectSignal(keyboard.onHide, () => hides++);
    await attachSoftKeyboard(keyboard);
    for (let i = 0; i < 5; i++) {
      backend.visible = true;
      backend.height = 300;
      backend.fire();
      backend.visible = false;
      backend.height = 0;
      backend.fire();
    }
    expect(shows).toBe(5);
    expect(hides).toBe(5);
  });

  it('does not re-emit show edges when visibility is unchanged', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    let resizes = 0;
    connectSignal(keyboard.onShow, () => shows++);
    connectSignal(keyboard.onResize, () => resizes++);
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    backend.height = 320;
    backend.fire();
    backend.height = 340;
    backend.fire();
    expect(shows).toBe(1);
    expect(resizes).toBe(2);
  });

  it('survives re-entrant detach from inside a listener', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onShow, () => detachSoftKeyboard(keyboard));
    connectSignal(keyboard.onResize, () => resizes++);
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    expect(() => backend.fire()).not.toThrow();
    backend.fire();
    expect(resizes).toBe(0);
  });

  it('survives re-entrant re-attach from inside a listener', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    connectSignal(keyboard.onShow, () => {
      void attachSoftKeyboard(keyboard);
    });
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    expect(() => backend.fire()).not.toThrow();
  });
});

describe('createSoftKeyboard', () => {
  it('creates an entity with three signals', () => {
    const keyboard = createSoftKeyboard();
    expect(keyboard.onShow).toBeDefined();
    expect(keyboard.onHide).toBeDefined();
    expect(keyboard.onResize).toBeDefined();
  });

  it('has no will/did phase signals', () => {
    const keyboard = createSoftKeyboard() as unknown as Record<string, unknown>;
    expect(keyboard.onWillShow).toBeUndefined();
    expect(keyboard.onWillHide).toBeUndefined();
    expect(keyboard.onWillResize).toBeUndefined();
    expect(keyboard.onDidShow).toBeUndefined();
    expect(keyboard.onDidHide).toBeUndefined();
    expect(keyboard.onDidResize).toBeUndefined();
  });
});

describe('detachSoftKeyboard', () => {
  it('stops further delivery', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    connectSignal(keyboard.onShow, () => shows++);
    await attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(shows).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const keyboard = createSoftKeyboard();
    expect(() => detachSoftKeyboard(keyboard)).not.toThrow();
  });

  it('is safe to call twice', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    await attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    expect(() => detachSoftKeyboard(keyboard)).not.toThrow();
  });

  it('re-attach after detach resumes delivery', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    connectSignal(keyboard.onShow, () => shows++);
    await attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    await attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(shows).toBe(1);
  });
});

describe('disposeSoftKeyboard', () => {
  it('detaches the subscription', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    await attachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });

  it('stops further delivery after dispose', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    connectSignal(keyboard.onShow, () => shows++);
    await attachSoftKeyboard(keyboard);
    disposeSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire();
    expect(shows).toBe(0);
  });

  it('is safe to call when already detached', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    await attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });

  it('is safe to call twice', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    await attachSoftKeyboard(keyboard);
    disposeSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });

  it('is safe to call when never attached', () => {
    const keyboard = createSoftKeyboard();
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });
});

describe('getSoftKeyboardBackend', () => {
  it('returns the sentinel when nothing is installed', () => {
    expect(getSoftKeyboardBackend()).toBeDefined();
  });
});

describe('getSoftKeyboardHeight', () => {
  it('returns the current keyboard height', () => {
    const backend = fakeBackend();
    backend.visible = true;
    backend.height = 320;
    setSoftKeyboardBackend(backend);
    expect(getSoftKeyboardHeight()).toBe(320);
  });

  it('returns 0 when keyboard is hidden', () => {
    const backend = fakeBackend();
    backend.visible = false;
    backend.height = 0;
    setSoftKeyboardBackend(backend);
    expect(getSoftKeyboardHeight()).toBe(0);
  });
});

describe('getSoftKeyboardInfo', () => {
  it('fills the out parameter from the backend', () => {
    const backend = fakeBackend();
    backend.height = 250;
    backend.visible = true;
    setSoftKeyboardBackend(backend);
    const out = createScratch();
    expect(getSoftKeyboardInfo(out)).toBe(out);
    expect(out.height).toBe(250);
    expect(out.visible).toBe(true);
  });

  it('populates rect fields', () => {
    const backend = fakeBackend();
    backend.height = 250;
    backend.visible = true;
    setSoftKeyboardBackend(backend);
    const out = createScratch();
    getSoftKeyboardInfo(out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(375);
  });
});

describe('hasSoftKeyboardBackend', () => {
  it('returns false when no backend is installed', () => {
    expect(hasSoftKeyboardBackend()).toBe(false);
  });

  it('returns true when a custom backend is set', () => {
    setSoftKeyboardBackend(fakeBackend());
    expect(hasSoftKeyboardBackend()).toBe(true);
  });

  it('returns true when a host backend is installed', () => {
    installSoftKeyboardHostBackend(fakeBackend());
    expect(hasSoftKeyboardBackend()).toBe(true);
  });

  it('returns false after clearing a custom backend', () => {
    setSoftKeyboardBackend(fakeBackend());
    setSoftKeyboardBackend(null);
    expect(hasSoftKeyboardBackend()).toBe(false);
  });
});

describe('hideSoftKeyboard', () => {
  it('delegates to the backend hide and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await hideSoftKeyboard()).toBe(true);
    expect(backend.hidden).toBe(true);
  });

  it('returns false with sentinel backend', async () => {
    expect(await hideSoftKeyboard()).toBe(false);
  });
});

describe('installSoftKeyboardHostBackend', () => {
  it('installs a host backend that getSoftKeyboardBackend returns', () => {
    const backend = fakeBackend();
    installSoftKeyboardHostBackend(backend);
    expect(getSoftKeyboardBackend()).toBe(backend);
  });

  it('is first-host-wins: second install is ignored', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installSoftKeyboardHostBackend(first);
    installSoftKeyboardHostBackend(second);
    expect(getSoftKeyboardBackend()).toBe(first);
  });
});

describe('isSoftKeyboardVisible', () => {
  it('returns true when backend reports visible', () => {
    const backend = fakeBackend();
    backend.visible = true;
    backend.height = 300;
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardVisible()).toBe(true);
  });

  it('returns false when backend reports hidden', () => {
    const backend = fakeBackend();
    backend.visible = false;
    backend.height = 0;
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardVisible()).toBe(false);
  });

  it('returns false with sentinel backend', () => {
    expect(isSoftKeyboardVisible()).toBe(false);
  });
});

describe('resetSoftKeyboardBackendForTest', () => {
  it('clears all backend slots', () => {
    setSoftKeyboardBackend(fakeBackend());
    installSoftKeyboardHostBackend(fakeBackend());
    resetSoftKeyboardBackendForTest();
    expect(hasSoftKeyboardBackend()).toBe(false);
  });
});

describe('setSoftKeyboardAccessoryBarVisible', () => {
  it('delegates to backend and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await setSoftKeyboardAccessoryBarVisible(true)).toBe(true);
    expect(backend.accessoryBarVisible).toBe(true);
    expect(await setSoftKeyboardAccessoryBarVisible(false)).toBe(true);
    expect(backend.accessoryBarVisible).toBe(false);
  });

  it('returns false when backend does not support it', async () => {
    setSoftKeyboardBackend(nullSubscribeBackend());
    expect(await setSoftKeyboardAccessoryBarVisible(true)).toBe(false);
  });
});

describe('setSoftKeyboardBackend', () => {
  it('overrides the host backend', () => {
    const host = fakeBackend();
    const custom = fakeBackend();
    installSoftKeyboardHostBackend(host);
    setSoftKeyboardBackend(custom);
    expect(getSoftKeyboardBackend()).toBe(custom);
  });

  it('clears back to the host/sentinel when passed null', () => {
    setSoftKeyboardBackend(fakeBackend());
    setSoftKeyboardBackend(null);
    expect(hasSoftKeyboardBackend()).toBe(false);
  });
});

describe('setSoftKeyboardResizeMode', () => {
  it('delegates to backend and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await setSoftKeyboardResizeMode(SoftKeyboardResizeBodyKind)).toBe(true);
    expect(backend.resizeMode).toBe(SoftKeyboardResizeBodyKind);
  });

  it('returns false when backend does not support it', async () => {
    setSoftKeyboardBackend(nullSubscribeBackend());
    expect(await setSoftKeyboardResizeMode(SoftKeyboardResizeNoneKind)).toBe(false);
  });
});

describe('setSoftKeyboardScrollAssistEnabled', () => {
  it('delegates to backend and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await setSoftKeyboardScrollAssistEnabled(true)).toBe(true);
    expect(backend.scrollAssistEnabled).toBe(true);
    expect(await setSoftKeyboardScrollAssistEnabled(false)).toBe(true);
    expect(backend.scrollAssistEnabled).toBe(false);
  });

  it('returns false when backend does not support it', async () => {
    setSoftKeyboardBackend(nullSubscribeBackend());
    expect(await setSoftKeyboardScrollAssistEnabled(true)).toBe(false);
  });
});

describe('setSoftKeyboardStyle', () => {
  it('delegates to backend and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await setSoftKeyboardStyle(SoftKeyboardStyleDarkKind)).toBe(true);
    expect(backend.style).toBe(SoftKeyboardStyleDarkKind);
  });

  it('returns false when backend does not support it', async () => {
    setSoftKeyboardBackend(nullSubscribeBackend());
    expect(await setSoftKeyboardStyle(SoftKeyboardStyleDefaultKind)).toBe(false);
  });
});

describe('showSoftKeyboard', () => {
  it('delegates to the backend show and returns true', async () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    expect(await showSoftKeyboard()).toBe(true);
    expect(backend.shown).toBe(true);
  });

  it('returns false with sentinel backend', async () => {
    expect(await showSoftKeyboard()).toBe(false);
  });
});
