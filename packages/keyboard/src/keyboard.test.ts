import { cancelSignal, connectSignal } from '@flighthq/signals';
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

type VirtualKeyboardStub = {
  boundingRect: DOMRect;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  show(): void;
  hide(): void;
};

// Overrides window.innerHeight / innerWidth for the duration of one test; callers restore via the
// surrounding stubVisualViewport restore (window metrics reset on the next jsdom test anyway).
function stubWindowMetrics(innerHeight: number, innerWidth: number): void {
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
}

// Installs (or clears, with null) window.visualViewport and returns a restore function.
function stubVisualViewport(viewport: Readonly<VisualViewport> | { height: number } | null): () => void {
  const had = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return () => {
    if (had !== undefined) Object.defineProperty(window, 'visualViewport', had);
    else Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  };
}

// Installs navigator.virtualKeyboard (the Chromium API) and returns a restore function.
function stubVirtualKeyboard(vk: VirtualKeyboardStub): () => void {
  const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboardStub };
  const had = nav.virtualKeyboard;
  Object.defineProperty(nav, 'virtualKeyboard', { value: vk, configurable: true });
  return () => {
    if (had !== undefined) Object.defineProperty(nav, 'virtualKeyboard', { value: had, configurable: true });
    else delete nav.virtualKeyboard;
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

  it('dispatches multiple listeners on a single did-show edge', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let a = 0;
    let b = 0;
    let c = 0;
    connectSignal(keyboard.onDidShow, () => a++);
    connectSignal(keyboard.onDidShow, () => b++);
    connectSignal(keyboard.onDidShow, () => c++);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    expect([a, b, c]).toEqual([1, 1, 1]);
  });

  it('honors listener priority on the onWillShow edge', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    const order: string[] = [];
    connectSignal(keyboard.onWillShow, () => order.push('low'), { priority: 0 });
    connectSignal(keyboard.onWillShow, () => order.push('high'), { priority: 10 });
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('will', 0.25);
    expect(order).toEqual(['high', 'low']);
  });

  it('stops the onWillShow chain when an earlier listener cancels', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let reached = false;
    connectSignal(keyboard.onWillShow, () => cancelSignal(keyboard.onWillShow), { priority: 10 });
    connectSignal(keyboard.onWillShow, () => (reached = true), { priority: 0 });
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('will', 0.25);
    expect(reached).toBe(false);
  });

  it('keeps the will→did ordering across a full show transition', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    const order: string[] = [];
    connectSignal(keyboard.onWillShow, () => order.push('will'));
    connectSignal(keyboard.onDidShow, () => order.push('did'));
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('will', 0.25);
    backend.fire('did');
    expect(order).toEqual(['will', 'did']);
  });

  it('tracks visibility correctly across rapid show/hide bursts', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    let hides = 0;
    connectSignal(keyboard.onDidShow, () => shows++);
    connectSignal(keyboard.onDidHide, () => hides++);
    attachSoftKeyboard(keyboard);
    for (let i = 0; i < 5; i++) {
      backend.visible = true;
      backend.height = 300;
      backend.fire('did');
      backend.visible = false;
      backend.height = 0;
      backend.fire('did');
    }
    expect(shows).toBe(5);
    expect(hides).toBe(5);
  });

  it('does not re-emit show/hide edges when visibility is unchanged', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let shows = 0;
    let resizes = 0;
    connectSignal(keyboard.onDidShow, () => shows++);
    connectSignal(keyboard.onDidResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    // stay visible across further did edges: no new show, but resize fires each time
    backend.height = 320;
    backend.fire('did');
    backend.height = 340;
    backend.fire('did');
    expect(shows).toBe(1);
    expect(resizes).toBe(3);
  });

  it('survives re-entrant detach from inside a listener', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onDidShow, () => detachSoftKeyboard(keyboard));
    connectSignal(keyboard.onResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    expect(() => backend.fire('did')).not.toThrow();
    // detach during emit forgets the subscription; further fires deliver nothing
    backend.fire('did');
    expect(resizes).toBe(1);
  });

  it('survives re-entrant re-attach from inside a listener', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    connectSignal(keyboard.onDidShow, () => attachSoftKeyboard(keyboard));
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    expect(() => backend.fire('did')).not.toThrow();
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

  it('infers height from a visualViewport shrink relative to window.innerHeight', () => {
    const restore = stubVisualViewport({ height: 600 });
    try {
      stubWindowMetrics(900, 375);
      const out = createSoftKeyboardInfo();
      createWebSoftKeyboardBackend().getInfo(out);
      expect(out.visible).toBe(true);
      expect(out.height).toBe(300);
      expect(out.width).toBe(375);
      expect(out.y).toBe(600);
    } finally {
      restore();
    }
  });

  it('reports no keyboard when the visualViewport has not shrunk', () => {
    const restore = stubVisualViewport({ height: 900 });
    try {
      stubWindowMetrics(900, 375);
      const out = createSoftKeyboardInfo();
      createWebSoftKeyboardBackend().getInfo(out);
      expect(out.visible).toBe(false);
      expect(out.height).toBe(0);
      expect(out.width).toBe(0);
      expect(out.y).toBe(0);
    } finally {
      restore();
    }
  });

  it('subscribes to visualViewport resize/scroll and fires a did transition', () => {
    const events = new Map<string, () => void>();
    const viewport = {
      height: 600,
      addEventListener(type: string, fn: () => void) {
        events.set(type, fn);
      },
      removeEventListener(type: string) {
        events.delete(type);
      },
    };
    const restore = stubVisualViewport(viewport as unknown as VisualViewport);
    try {
      let phase: SoftKeyboardPhase | null = null;
      const unsubscribe = createWebSoftKeyboardBackend().subscribe((p) => (phase = p));
      expect(events.has('resize')).toBe(true);
      expect(events.has('scroll')).toBe(true);
      events.get('resize')!();
      expect(phase).toBe('did');
      unsubscribe();
      expect(events.size).toBe(0);
    } finally {
      restore();
    }
  });

  it('returns a no-op subscription when visualViewport is absent', () => {
    const restore = stubVisualViewport(null);
    try {
      const unsubscribe = createWebSoftKeyboardBackend().subscribe(() => {});
      expect(() => unsubscribe()).not.toThrow();
    } finally {
      restore();
    }
  });

  it('prefers the VirtualKeyboard API for geometry when present', () => {
    const restore = stubVirtualKeyboard({
      boundingRect: { height: 280, width: 320, x: 5, y: 620 } as DOMRect,
      addEventListener() {},
      removeEventListener() {},
      show() {},
      hide() {},
    });
    try {
      const out = createSoftKeyboardInfo();
      createWebSoftKeyboardBackend().getInfo(out);
      expect(out.height).toBe(280);
      expect(out.width).toBe(320);
      expect(out.x).toBe(5);
      expect(out.y).toBe(620);
      expect(out.visible).toBe(true);
    } finally {
      restore();
    }
  });

  it('subscribes via the VirtualKeyboard geometrychange event when present', () => {
    const events = new Map<string, () => void>();
    const restore = stubVirtualKeyboard({
      boundingRect: { height: 0, width: 0, x: 0, y: 0 } as DOMRect,
      addEventListener(type: string, fn: () => void) {
        events.set(type, fn);
      },
      removeEventListener(type: string) {
        events.delete(type);
      },
      show() {},
      hide() {},
    });
    try {
      let phase: SoftKeyboardPhase | null = null;
      const unsubscribe = createWebSoftKeyboardBackend().subscribe((p) => (phase = p));
      expect(events.has('geometrychange')).toBe(true);
      events.get('geometrychange')!();
      expect(phase).toBe('did');
      unsubscribe();
      expect(events.has('geometrychange')).toBe(false);
    } finally {
      restore();
    }
  });

  it('drives show/hide through the VirtualKeyboard API when present', () => {
    let shown = false;
    let hidden = false;
    const restore = stubVirtualKeyboard({
      boundingRect: { height: 0, width: 0, x: 0, y: 0 } as DOMRect,
      addEventListener() {},
      removeEventListener() {},
      show() {
        shown = true;
      },
      hide() {
        hidden = true;
      },
    });
    try {
      const backend = createWebSoftKeyboardBackend();
      backend.show();
      backend.hide();
      expect(shown).toBe(true);
      expect(hidden).toBe(true);
    } finally {
      restore();
    }
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

  it('re-attach after detach resumes delivery', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    let resizes = 0;
    connectSignal(keyboard.onResize, () => resizes++);
    attachSoftKeyboard(keyboard);
    detachSoftKeyboard(keyboard);
    attachSoftKeyboard(keyboard);
    backend.visible = true;
    backend.height = 300;
    backend.fire('did');
    expect(resizes).toBe(1);
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

  it('is safe to call twice', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    attachSoftKeyboard(keyboard);
    disposeSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });

  it('is safe to call when never attached', () => {
    const keyboard = createSoftKeyboard();
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
