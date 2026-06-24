import { connectSignal } from '@flighthq/signals';
import type {
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardPhase,
  SoftKeyboardResizeMode,
  SoftKeyboardTransition,
} from '@flighthq/types';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
  SoftKeyboardStyleDefaultKind,
} from '@flighthq/types';

import {
  attachSoftKeyboard,
  createSoftKeyboard,
  createSoftKeyboardInfo,
  createSoftKeyboardTransition,
  createWebSoftKeyboardBackend,
  detachSoftKeyboard,
  disposeSoftKeyboard,
  getSoftKeyboardBackend,
  getSoftKeyboardHeight,
  getSoftKeyboardInfo,
  getSoftKeyboardResizeMode,
  hideSoftKeyboard,
  isSoftKeyboardAccessoryBarVisible,
  isSoftKeyboardScrollAssistEnabled,
  setSoftKeyboardAccessoryBarVisible,
  setSoftKeyboardBackend,
  setSoftKeyboardResizeMode,
  setSoftKeyboardScrollAssistEnabled,
  setSoftKeyboardStyle,
  showSoftKeyboard,
} from './keyboard';

type BackendListener = (phase: SoftKeyboardPhase, transition: Readonly<SoftKeyboardTransition>) => void;

function fakeBackend(): SoftKeyboardBackend & {
  visible: boolean;
  height: number;
  shown: boolean;
  hidden: boolean;
  resizeMode: string;
  accessoryBarVisible: boolean;
  scrollAssistEnabled: boolean;
  style: string;
  fire(phase?: SoftKeyboardPhase, durationSeconds?: number): void;
} {
  let listener: BackendListener | null = null;
  return {
    visible: false,
    height: 0,
    shown: false,
    hidden: false,
    resizeMode: SoftKeyboardResizeNoneKind,
    accessoryBarVisible: false,
    scrollAssistEnabled: false,
    style: SoftKeyboardStyleDefaultKind,
    getInfo(out) {
      out.visible = this.visible;
      out.height = this.height;
      out.x = 0;
      out.y = 0;
      out.width = this.visible ? 375 : 0;
      return out;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    show() {
      this.shown = true;
    },
    hide() {
      this.hidden = true;
    },
    getResizeMode(): SoftKeyboardResizeMode {
      return this.resizeMode as SoftKeyboardResizeMode;
    },
    setResizeMode(mode) {
      this.resizeMode = mode;
    },
    setStyle(s) {
      this.style = s;
    },
    getAccessoryBarVisible() {
      return this.accessoryBarVisible;
    },
    setAccessoryBarVisible(v) {
      this.accessoryBarVisible = v;
    },
    getScrollAssistEnabled() {
      return this.scrollAssistEnabled;
    },
    setScrollAssistEnabled(v) {
      this.scrollAssistEnabled = v;
    },
    fire(phase: SoftKeyboardPhase = 'did', durationSeconds = 0) {
      listener?.call(null, phase, { durationSeconds, height: this.height });
    },
  };
}

afterEach(() => setSoftKeyboardBackend(null));

describe('attachSoftKeyboard', () => {
  it('emits onResize and onShow when the keyboard becomes visible (did phase)', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    let shows = 0;
    connectSignal(keyboard.onResize, () => resizes++);
    connectSignal(keyboard.onShow, () => shows++);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    expect(resizes).toBe(1);
    expect(shows).toBe(1);
  });

  it('emits onWillShow before the animation on will phase', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    const willTransitions: Readonly<SoftKeyboardTransition>[] = [];
    connectSignal(keyboard.onWillShow, (t) => willTransitions.push(t));
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('will', 0.25);
    expect(willTransitions).toHaveLength(1);
    expect(willTransitions[0].durationSeconds).toBe(0.25);
    expect(willTransitions[0].height).toBe(300);
  });

  it('emits onWillHide on will phase when transitioning hidden', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    backend.visible = true;
    backend.height = 300;
    const willHides: Readonly<SoftKeyboardTransition>[] = [];
    connectSignal(keyboard.onWillHide, (t) => willHides.push(t));
    attachSoftKeyboard(keyboard);
    // keyboard is currently visible, now hide
    backend.visible = false;
    backend.height = 0;
    backend.fire('will', 0.3);
    expect(willHides).toHaveLength(1);
  });

  it('emits onWillResize (not will show/hide) when visible stays the same', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    backend.visible = true;
    backend.height = 300;
    const willResizes: Readonly<SoftKeyboardTransition>[] = [];
    const willShows: Readonly<SoftKeyboardTransition>[] = [];
    connectSignal(keyboard.onWillResize, (t) => willResizes.push(t));
    connectSignal(keyboard.onWillShow, (t) => willShows.push(t));
    attachSoftKeyboard(keyboard);
    // stay visible but change height
    backend.height = 350;
    backend.fire('will', 0.1);
    expect(willResizes).toHaveLength(1);
    expect(willShows).toHaveLength(0);
  });

  it('emits did aliases alongside simple-path aliases', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let didShows = 0;
    let onShows = 0;
    connectSignal(keyboard.onDidShow, () => didShows++);
    connectSignal(keyboard.onShow, () => onShows++);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    expect(didShows).toBe(1);
    expect(onShows).toBe(1);
  });

  it('emits onHide and onDidHide when keyboard hides', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    backend.visible = true;
    backend.height = 300;
    let hides = 0;
    let didHides = 0;
    connectSignal(keyboard.onHide, () => hides++);
    connectSignal(keyboard.onDidHide, () => didHides++);
    attachSoftKeyboard(keyboard);
    backend.visible = false;
    backend.height = 0;
    backend.fire('did');
    expect(hides).toBe(1);
    expect(didHides).toBe(1);
  });

  it('is idempotent: prior subscription torn down on re-attach', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    expect(resizes).toBe(1);
  });
});

describe('createSoftKeyboard', () => {
  it('creates an entity with nine signals', () => {
    const keyboard = createSoftKeyboard();
    expect(keyboard.onShow).toBeDefined();
    expect(keyboard.onHide).toBeDefined();
    expect(keyboard.onResize).toBeDefined();
    expect(keyboard.onWillShow).toBeDefined();
    expect(keyboard.onWillHide).toBeDefined();
    expect(keyboard.onWillResize).toBeDefined();
    expect(keyboard.onDidShow).toBeDefined();
    expect(keyboard.onDidHide).toBeDefined();
    expect(keyboard.onDidResize).toBeDefined();
  });
});

describe('createSoftKeyboardInfo', () => {
  it('allocates a zeroed info including rect fields', () => {
    expect(createSoftKeyboardInfo()).toEqual({ visible: false, height: 0, x: 0, y: 0, width: 0 });
  });
});

describe('createSoftKeyboardTransition', () => {
  it('allocates a zeroed transition', () => {
    expect(createSoftKeyboardTransition()).toEqual({ durationSeconds: 0, height: 0 });
  });
});

describe('createWebSoftKeyboardBackend', () => {
  it('reads info without throwing', () => {
    const out = createSoftKeyboardInfo();
    expect(typeof createWebSoftKeyboardBackend().getInfo(out).visible).toBe('boolean');
  });

  it('returns rect fields with height 0 when no keyboard is present', () => {
    const out = createSoftKeyboardInfo();
    createWebSoftKeyboardBackend().getInfo(out);
    expect(out.height).toBe(0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
  });

  it('subscribes and unsubscribes without throwing', () => {
    const unsubscribe = createWebSoftKeyboardBackend().subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('show and hide are no-ops without throwing', () => {
    const backend = createWebSoftKeyboardBackend();
    expect(() => {
      backend.show();
      backend.hide();
    }).not.toThrow();
  });
});

describe('detachSoftKeyboard', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    backend.fire();
    expect(resizes).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const keyboard = createSoftKeyboard();
    expect(() => detachSoftKeyboard(keyboard)).not.toThrow();
  });

  it('is safe to call twice', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    expect(() => detachSoftKeyboard(keyboard)).not.toThrow();
  });
});

describe('disposeSoftKeyboard', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    attachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });

  it('stops further delivery after dispose', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    disposeSoftKeyboard(keyboard);
    backend.fire();
    expect(resizes).toBe(0);
  });

  it('is safe to call when already detached', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });
});

describe('getSoftKeyboardBackend', () => {
  it('falls back to a web backend', () => {
    expect(getSoftKeyboardBackend()).not.toBeNull();
  });
});

describe('getSoftKeyboardHeight', () => {
  it('returns the current keyboard height without allocating', () => {
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
    const out = createSoftKeyboardInfo();
    expect(getSoftKeyboardInfo(out)).toBe(out);
    expect(out.height).toBe(250);
    expect(out.visible).toBe(true);
  });

  it('populates rect fields', () => {
    const backend = fakeBackend();
    backend.height = 250;
    backend.visible = true;
    setSoftKeyboardBackend(backend);
    const out = createSoftKeyboardInfo();
    getSoftKeyboardInfo(out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(375);
  });
});

describe('getSoftKeyboardResizeMode', () => {
  it('delegates to backend getResizeMode', () => {
    const backend = fakeBackend();
    backend.resizeMode = SoftKeyboardResizeBodyKind;
    setSoftKeyboardBackend(backend);
    expect(getSoftKeyboardResizeMode()).toBe(SoftKeyboardResizeBodyKind);
  });

  it('returns SoftKeyboardResizeNoneKind when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(getSoftKeyboardResizeMode()).toBe(SoftKeyboardResizeNoneKind);
  });
});

describe('hideSoftKeyboard', () => {
  it('delegates to the backend hide', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    hideSoftKeyboard();
    expect(backend.hidden).toBe(true);
  });
});

describe('isSoftKeyboardAccessoryBarVisible', () => {
  it('delegates to backend getAccessoryBarVisible', () => {
    const backend = fakeBackend();
    backend.accessoryBarVisible = true;
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardAccessoryBarVisible()).toBe(true);
  });

  it('returns false when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardAccessoryBarVisible()).toBe(false);
  });
});

describe('isSoftKeyboardScrollAssistEnabled', () => {
  it('delegates to backend getScrollAssistEnabled', () => {
    const backend = fakeBackend();
    backend.scrollAssistEnabled = true;
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardScrollAssistEnabled()).toBe(true);
  });

  it('returns false when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(isSoftKeyboardScrollAssistEnabled()).toBe(false);
  });
});

describe('setSoftKeyboardAccessoryBarVisible', () => {
  it('delegates to backend setAccessoryBarVisible', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    setSoftKeyboardAccessoryBarVisible(true);
    expect(backend.accessoryBarVisible).toBe(true);
    setSoftKeyboardAccessoryBarVisible(false);
    expect(backend.accessoryBarVisible).toBe(false);
  });

  it('is a no-op when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(() => setSoftKeyboardAccessoryBarVisible(true)).not.toThrow();
  });
});

describe('setSoftKeyboardBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setSoftKeyboardBackend(fakeBackend());
    setSoftKeyboardBackend(null);
    expect(getSoftKeyboardBackend()).not.toBeNull();
  });
});

describe('setSoftKeyboardResizeMode', () => {
  it('delegates to backend setResizeMode', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    setSoftKeyboardResizeMode(SoftKeyboardResizeBodyKind);
    expect(backend.resizeMode).toBe(SoftKeyboardResizeBodyKind);
  });

  it('is a no-op when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(() => setSoftKeyboardResizeMode(SoftKeyboardResizeBodyKind)).not.toThrow();
  });
});

describe('setSoftKeyboardScrollAssistEnabled', () => {
  it('delegates to backend setScrollAssistEnabled', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    setSoftKeyboardScrollAssistEnabled(true);
    expect(backend.scrollAssistEnabled).toBe(true);
    setSoftKeyboardScrollAssistEnabled(false);
    expect(backend.scrollAssistEnabled).toBe(false);
  });

  it('is a no-op when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(() => setSoftKeyboardScrollAssistEnabled(true)).not.toThrow();
  });
});

describe('setSoftKeyboardStyle', () => {
  it('delegates to backend setStyle', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    setSoftKeyboardStyle(SoftKeyboardStyleDarkKind);
    expect(backend.style).toBe(SoftKeyboardStyleDarkKind);
  });

  it('is a no-op when backend does not support it', () => {
    const backend: SoftKeyboardBackend = {
      getInfo(out) {
        return out;
      },
      subscribe() {
        return () => {};
      },
      show() {},
      hide() {},
    };
    setSoftKeyboardBackend(backend);
    expect(() => setSoftKeyboardStyle(SoftKeyboardStyleDarkKind)).not.toThrow();
  });
});

describe('showSoftKeyboard', () => {
  it('delegates to the backend show', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    showSoftKeyboard();
    expect(backend.shown).toBe(true);
  });
});
