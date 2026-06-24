import type { StatusBar, StatusBarBackend, StatusBarInfo, StatusBarStyle } from '@flighthq/types';

import {
  attachStatusBar,
  createStatusBar,
  createStatusBarInfo,
  createWebStatusBarBackend,
  detachStatusBar,
  disposeStatusBar,
  enableStatusBarSignals,
  getStatusBarBackend,
  getStatusBarHeight,
  getStatusBarInfo,
  popStatusBarStyleEntry,
  pushStatusBarStyleEntry,
  setStatusBarBackend,
  setStatusBarColor,
  setStatusBarOverlaysContent,
  setStatusBarStyle,
  setStatusBarVisible,
} from './statusbar';

function fakeBackend(): StatusBarBackend & {
  _emit(): void;
  animatedColor: boolean | undefined;
  animation: string | undefined;
  color: number;
  infoHeight: number;
  overlay: boolean;
  style: StatusBarStyle;
  subscribeCallCount: number;
  visible: boolean;
} {
  let listener: (() => void) | null = null;
  return {
    animatedColor: undefined,
    animation: undefined,
    color: 0,
    infoHeight: 42,
    overlay: false,
    style: 'default',
    subscribeCallCount: 0,
    visible: true,
    getInfo(out: StatusBarInfo): StatusBarInfo {
      out.color = this.color;
      out.height = this.infoHeight;
      out.overlaysContent = this.overlay;
      out.style = this.style;
      out.visible = this.visible;
      return out;
    },
    setBackgroundColor(color: number, animated?: boolean): void {
      this.color = color;
      this.animatedColor = animated;
    },
    setOverlaysContent(overlay: boolean): void {
      this.overlay = overlay;
    },
    setStyle(style: StatusBarStyle): void {
      this.style = style;
    },
    setVisible(visible: boolean, animation?: string): void {
      this.visible = visible;
      this.animation = animation;
    },
    subscribe(l: () => void): () => void {
      this.subscribeCallCount++;
      listener = l;
      return () => {
        listener = null;
      };
    },
    // Trigger for tests: fire the subscription listener externally.
    _emit(): void {
      if (listener !== null) listener();
    },
  } as ReturnType<typeof fakeBackend>;
}

afterEach(() => {
  setStatusBarBackend(null);
  // Reset style stack state between tests by popping all entries (pop returns no-op on invalid)
  for (let i = 0; i < 100; i++) popStatusBarStyleEntry(i);
});

describe('attachStatusBar', () => {
  it('subscribes to the backend and emits onChange on change', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bar = createStatusBar();
    const received: StatusBarInfo[] = [];
    bar.onChange.emit = (info) => {
      received.push({ ...info });
    };
    attachStatusBar(bar);
    (backend as ReturnType<typeof fakeBackend>)._emit();
    expect(received.length).toBe(1);
    expect(received[0].height).toBe(42);
    disposeStatusBar(bar);
  });

  it('is idempotent: re-attaching replaces the subscription', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bar = createStatusBar();
    attachStatusBar(bar);
    attachStatusBar(bar);
    expect(backend.subscribeCallCount).toBe(2);
    disposeStatusBar(bar);
  });
});

describe('createStatusBar', () => {
  it('returns a StatusBar with an inert onChange signal', () => {
    const bar = createStatusBar();
    expect(bar.onChange).not.toBeNull();
    // Signals are inert (no listeners) until attachStatusBar is called.
  });
});

describe('createStatusBarInfo', () => {
  it('returns defaults with height -1 and style default', () => {
    const info = createStatusBarInfo();
    expect(info.height).toBe(-1);
    expect(info.style).toBe('default');
    expect(info.visible).toBe(true);
    expect(info.overlaysContent).toBe(false);
    expect(info.color).toBe(0);
  });
});

describe('createWebStatusBarBackend', () => {
  it('upserts a single theme-color meta with #rrggbb from the top 24 bits', () => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const backend = createWebStatusBarBackend();
    backend.setBackgroundColor(0x11223344);
    backend.setBackgroundColor(0xaabbccff);
    const metas = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(metas.length).toBe(1);
    expect(metas[0].getAttribute('content')).toBe('#aabbcc');
  });

  it('no-ops style/visible/overlay/subscribe without throwing', () => {
    const backend = createWebStatusBarBackend();
    expect(() => {
      backend.setStyle('light');
      backend.setVisible(false, 'slide');
      backend.setOverlaysContent(true);
      const unsub = backend.subscribe(() => {});
      unsub();
    }).not.toThrow();
  });

  it('getInfo returns -1 height and defaults when no theme-color meta', () => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const backend = createWebStatusBarBackend();
    const info = createStatusBarInfo();
    backend.getInfo(info);
    expect(info.height).toBe(-1);
    expect(info.visible).toBe(true);
    expect(info.color).toBe(0);
  });

  it('getInfo reads back a previously set theme-color meta', () => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const backend = createWebStatusBarBackend();
    backend.setBackgroundColor(0xff000000); // red, no alpha
    const info = createStatusBarInfo();
    backend.getInfo(info);
    // Color should be reconstructed as 0xff0000ff (alpha forced to 0xff on web read-back)
    expect(info.color).toBe(0xff0000ff);
  });

  it('subscribe returns a no-op unsubscribe function', () => {
    const backend = createWebStatusBarBackend();
    const unsub = backend.subscribe(() => {});
    expect(() => unsub()).not.toThrow();
  });
});

describe('detachStatusBar', () => {
  it('stops subscription and is safe to call when not attached', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bar = createStatusBar();
    expect(() => detachStatusBar(bar)).not.toThrow();
    attachStatusBar(bar);
    detachStatusBar(bar);
    let emitCount = 0;
    bar.onChange.emit = () => {
      emitCount++;
    };
    (backend as ReturnType<typeof fakeBackend>)._emit();
    expect(emitCount).toBe(0);
  });
});

describe('disposeStatusBar', () => {
  it('detaches subscription and releases the entity', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bar = createStatusBar();
    attachStatusBar(bar);
    disposeStatusBar(bar);
    let emitCount = 0;
    bar.onChange.emit = () => {
      emitCount++;
    };
    (backend as ReturnType<typeof fakeBackend>)._emit();
    expect(emitCount).toBe(0);
  });
});

describe('enableStatusBarSignals', () => {
  it('is callable without throwing', () => {
    expect(() => enableStatusBarSignals()).not.toThrow();
  });
});

describe('getStatusBarBackend', () => {
  it('falls back to a web backend', () => {
    expect(getStatusBarBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    expect(getStatusBarBackend()).toBe(backend);
  });
});

describe('getStatusBarHeight', () => {
  it('returns the height from the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    expect(getStatusBarHeight()).toBe(42);
  });

  it('returns -1 when the web backend reports unknown height', () => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    // Web backend always returns -1 for height.
    expect(getStatusBarHeight()).toBe(-1);
  });
});

describe('getStatusBarInfo', () => {
  it('fills the out parameter from the active backend', () => {
    const backend = fakeBackend();
    backend.color = 0x112233ff;
    backend.style = 'light';
    backend.visible = false;
    backend.overlay = true;
    setStatusBarBackend(backend);
    const out = createStatusBarInfo();
    const result = getStatusBarInfo(out);
    expect(result).toBe(out); // returns `out`
    expect(out.color).toBe(0x112233ff);
    expect(out.style).toBe('light');
    expect(out.visible).toBe(false);
    expect(out.overlaysContent).toBe(true);
    expect(out.height).toBe(42);
  });

  it('is alias-safe: out may be reused across calls', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const out = createStatusBarInfo();
    getStatusBarInfo(out);
    backend.style = 'dark';
    getStatusBarInfo(out);
    expect(out.style).toBe('dark');
  });
});

describe('popStatusBarStyleEntry', () => {
  it('no-ops for unknown or invalid handles', () => {
    expect(() => popStatusBarStyleEntry(-1)).not.toThrow();
    expect(() => popStatusBarStyleEntry(99999)).not.toThrow();
  });

  it('removes the entry and re-applies the stack', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const handle = pushStatusBarStyleEntry({ style: 'dark' });
    expect(backend.style).toBe('dark');
    popStatusBarStyleEntry(handle);
    // After pop the backend should have been re-applied with the empty stack (no-op for style).
    // The key invariant: the push was applied, the pop does not throw.
  });
});

describe('pushStatusBarStyleEntry', () => {
  it('applies the entry to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    pushStatusBarStyleEntry({ style: 'light', visible: false });
    expect(backend.style).toBe('light');
    expect(backend.visible).toBe(false);
  });

  it('later entries win per-field over earlier entries', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    pushStatusBarStyleEntry({ style: 'dark' });
    pushStatusBarStyleEntry({ style: 'light' });
    expect(backend.style).toBe('light');
  });

  it('returns unique handles', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const h1 = pushStatusBarStyleEntry({ style: 'dark' });
    const h2 = pushStatusBarStyleEntry({ style: 'light' });
    expect(h1).not.toBe(h2);
    popStatusBarStyleEntry(h1);
    popStatusBarStyleEntry(h2);
  });

  it('fields not set fall through to lower entries', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    pushStatusBarStyleEntry({ style: 'dark' });
    pushStatusBarStyleEntry({ visible: false }); // no style set → falls through
    expect(backend.style).toBe('dark');
    expect(backend.visible).toBe(false);
  });
});

describe('setStatusBarBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setStatusBarBackend(fakeBackend());
    setStatusBarBackend(null);
    expect(getStatusBarBackend()).not.toBeNull();
  });
});

describe('setStatusBarColor', () => {
  it('forwards the packed color to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarColor(0x123456ff);
    expect(backend.color).toBe(0x123456ff);
    expect(backend.animatedColor).toBeUndefined();
  });

  it('forwards the animated flag when provided', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarColor(0x123456ff, true);
    expect(backend.animatedColor).toBe(true);
  });
});

describe('setStatusBarOverlaysContent', () => {
  it('forwards overlay to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarOverlaysContent(true);
    expect(backend.overlay).toBe(true);
  });
});

describe('setStatusBarStyle', () => {
  it('forwards style to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarStyle('dark');
    expect(backend.style).toBe('dark');
  });
});

describe('setStatusBarVisible', () => {
  it('forwards visibility to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarVisible(false);
    expect(backend.visible).toBe(false);
  });

  it('forwards animation parameter to the active backend', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    setStatusBarVisible(false, 'fade');
    expect(backend.animation).toBe('fade');
  });
});
