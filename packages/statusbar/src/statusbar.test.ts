import { connectSignal } from '@flighthq/signals/contract';
import type { StatusBar, StatusBarBackend, StatusBarInfo, StatusBarStyle } from '@flighthq/types/contract';

import {
  attachStatusBar,
  clearStatusBarStyleStack,
  createStatusBar,
  createStatusBarInfo,
  detachStatusBar,
  disposeStatusBar,
  explainStatusBarBackend,
  getStatusBarBackend,
  getStatusBarHeight,
  getStatusBarInfo,
  hasStatusBarStyleEntry,
  installStatusBarHostBackend,
  observeStatusBarHostResult,
  packedRgbaToHexColor,
  popStatusBarStyleEntry,
  pushStatusBarStyleEntry,
  resetStatusBarBackendForTest,
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
  clearStatusBarStyleStack();
  resetStatusBarBackendForTest();
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

  it('hands each event a payload the listener owns, not a shared scratch', () => {
    // The regression this pins: the emitted info used to be a single module-level scratch, so a
    // listener that retained a snapshot watched it change under them on the next event — or on an
    // unrelated getStatusBarHeight() call — and two attached bars received the same object.
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bar = createStatusBar();
    const seen: StatusBarInfo[] = [];
    connectSignal(bar.onChange, (info) => seen.push(info));
    attachStatusBar(bar);

    backend.infoHeight = 44;
    backend._emit();
    backend.infoHeight = 99;
    backend._emit();
    expect(seen.length).toBe(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0].height).toBe(44);
    expect(seen[1].height).toBe(99);

    // An unrelated read must not reach back into a payload already delivered.
    backend.infoHeight = 12;
    getStatusBarHeight();
    expect(seen[0].height).toBe(44);
  });

  it('gives two attached bars separate payload objects', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const first = createStatusBar();
    const second = createStatusBar();
    const seen: StatusBarInfo[] = [];
    connectSignal(first.onChange, (info) => seen.push(info));
    connectSignal(second.onChange, (info) => seen.push(info));
    attachStatusBar(first);
    attachStatusBar(second);
    // The fake keeps one listener slot, so drive each bar's subscription in turn.
    backend._emit();
    attachStatusBar(first);
    backend._emit();
    expect(seen.length).toBe(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe('clearStatusBarStyleStack', () => {
  it('empties the stack and restores the baseline in one call', () => {
    const backend = fakeBackend();
    backend.style = 'default';
    backend.visible = true;
    setStatusBarBackend(backend);
    pushStatusBarStyleEntry({ style: 'dark' });
    pushStatusBarStyleEntry({ visible: false });
    clearStatusBarStyleStack();
    expect(backend.style).toBe('default');
    expect(backend.visible).toBe(true);
  });

  it('drops every handle', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const first = pushStatusBarStyleEntry({ style: 'dark' });
    const second = pushStatusBarStyleEntry({ style: 'light' });
    clearStatusBarStyleStack();
    expect(hasStatusBarStyleEntry(first)).toBe(false);
    expect(hasStatusBarStyleEntry(second)).toBe(false);
  });

  it('is a no-op on an empty stack', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    clearStatusBarStyleStack();
    expect(() => clearStatusBarStyleStack()).not.toThrow();
    expect(backend.style).toBe('default');
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

describe('explainStatusBarBackend', () => {
  afterEach(() => resetStatusBarBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetStatusBarBackendForTest();
    const explanation = explainStatusBarBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setStatusBarBackend(fakeBackend());
    expect(explainStatusBarBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installStatusBarHostBackend(fakeBackend());
    expect(explainStatusBarBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installStatusBarHostBackend(fakeBackend());
    installStatusBarHostBackend(fakeBackend());
    expect(explainStatusBarBackend().conflict).toBe(true);
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

describe('getStatusBarBackend (sentinel)', () => {
  it('no-ops style/visible/overlay/subscribe without throwing', () => {
    const backend = getStatusBarBackend();
    expect(() => {
      backend.setStyle('light');
      backend.setVisible(false, 'slide');
      backend.setOverlaysContent(true);
      const unsub = backend.subscribe(() => {});
      unsub();
    }).not.toThrow();
  });

  it('getInfo returns -1 height and defaults', () => {
    const backend = getStatusBarBackend();
    const info = createStatusBarInfo();
    backend.getInfo(info);
    expect(info.height).toBe(-1);
    expect(info.visible).toBe(true);
    expect(info.color).toBe(0);
  });

  it('setBackgroundColor is a no-op', () => {
    const backend = getStatusBarBackend();
    expect(() => backend.setBackgroundColor(0xff0000ff)).not.toThrow();
  });

  it('subscribe returns a no-op unsubscribe function', () => {
    const backend = getStatusBarBackend();
    const unsub = backend.subscribe(() => {});
    expect(() => unsub()).not.toThrow();
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

describe('hasStatusBarStyleEntry', () => {
  it('is true while the entry is on the stack and false once popped', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const handle = pushStatusBarStyleEntry({ style: 'dark' });
    expect(hasStatusBarStyleEntry(handle)).toBe(true);
    popStatusBarStyleEntry(handle);
    expect(hasStatusBarStyleEntry(handle)).toBe(false);
  });

  it('is false for an unknown or invalid handle', () => {
    expect(hasStatusBarStyleEntry(-1)).toBe(false);
    expect(hasStatusBarStyleEntry(99999)).toBe(false);
  });

  it('stays true for an entry below one that was popped', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    const bottom = pushStatusBarStyleEntry({ style: 'dark' });
    const top = pushStatusBarStyleEntry({ style: 'light' });
    popStatusBarStyleEntry(top);
    expect(hasStatusBarStyleEntry(bottom)).toBe(true);
  });
});

describe('installStatusBarHostBackend', () => {
  afterEach(() => resetStatusBarBackendForTest());

  it('installs a host backend that getStatusBarBackend returns', () => {
    const backend = fakeBackend();
    installStatusBarHostBackend(backend);
    expect(getStatusBarBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installStatusBarHostBackend(first);
    installStatusBarHostBackend(second);
    expect(getStatusBarBackend()).toBe(first);
    expect(explainStatusBarBackend().conflict).toBe(true);
  });
});

describe('observeStatusBarHostResult', () => {
  afterEach(() => resetStatusBarBackendForTest());

  it('records a successful observation', () => {
    installStatusBarHostBackend(fakeBackend());
    observeStatusBarHostResult('setBackgroundColor', true);
    const explanation = explainStatusBarBackend();
    expect(explanation.operation).toBe('setBackgroundColor');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installStatusBarHostBackend(fakeBackend());
    observeStatusBarHostResult('setBackgroundColor', false);
    expect(explainStatusBarBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('packedRgbaToHexColor', () => {
  it('converts a packed RGBA to a hex color string', () => {
    expect(packedRgbaToHexColor(0xff0000ff)).toBe('#ff0000');
  });

  it('converts black', () => {
    expect(packedRgbaToHexColor(0x000000ff)).toBe('#000000');
  });

  it('converts white', () => {
    expect(packedRgbaToHexColor(0xffffffff)).toBe('#ffffff');
  });
});

describe('popStatusBarStyleEntry', () => {
  it('no-ops for unknown or invalid handles', () => {
    expect(() => popStatusBarStyleEntry(-1)).not.toThrow();
    expect(() => popStatusBarStyleEntry(99999)).not.toThrow();
  });

  it('restores the pre-push value rather than leaving the popped entry applied', () => {
    // The regression this replaces: the old assertion stopped at "the pop does not throw", and the
    // implementation matched it — popping re-merged the stack, found no entry setting `style`, and
    // called no setter, so the OS kept the popped entry's value forever. A style stack whose whole
    // purpose is "restore the previous state on unmount" did not restore.
    const backend = fakeBackend();
    backend.style = 'default';
    setStatusBarBackend(backend);
    const handle = pushStatusBarStyleEntry({ style: 'dark' });
    expect(backend.style).toBe('dark');
    popStatusBarStyleEntry(handle);
    expect(backend.style).toBe('default');
  });

  it('restores every field the popped entry had set', () => {
    const backend = fakeBackend();
    backend.style = 'light';
    backend.visible = true;
    backend.color = 0x112233ff;
    backend.overlay = false;
    setStatusBarBackend(backend);
    const handle = pushStatusBarStyleEntry({
      color: 0xaabbccff,
      overlaysContent: true,
      style: 'dark',
      visible: false,
    });
    popStatusBarStyleEntry(handle);
    expect(backend.style).toBe('light');
    expect(backend.visible).toBe(true);
    expect(backend.color).toBe(0x112233ff);
    expect(backend.overlay).toBe(false);
  });

  it('falls back to the entry below before the baseline', () => {
    const backend = fakeBackend();
    backend.style = 'default';
    setStatusBarBackend(backend);
    pushStatusBarStyleEntry({ style: 'dark' });
    const top = pushStatusBarStyleEntry({ style: 'light' });
    expect(backend.style).toBe('light');
    popStatusBarStyleEntry(top);
    expect(backend.style).toBe('dark');
  });

  it('restores after popping out of order', () => {
    const backend = fakeBackend();
    backend.style = 'default';
    setStatusBarBackend(backend);
    const bottom = pushStatusBarStyleEntry({ style: 'dark' });
    const top = pushStatusBarStyleEntry({ visible: false });
    popStatusBarStyleEntry(bottom);
    expect(backend.style).toBe('default');
    expect(backend.visible).toBe(false);
    popStatusBarStyleEntry(top);
    expect(backend.visible).toBe(true);
  });

  it('captures a fresh baseline after the stack empties and is pushed again', () => {
    const backend = fakeBackend();
    backend.style = 'default';
    setStatusBarBackend(backend);
    popStatusBarStyleEntry(pushStatusBarStyleEntry({ style: 'dark' }));
    // A change made outside the stack becomes the new baseline for the next push.
    setStatusBarStyle('light');
    popStatusBarStyleEntry(pushStatusBarStyleEntry({ style: 'dark' }));
    expect(backend.style).toBe('light');
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

describe('resetStatusBarBackendForTest', () => {
  it('clears all backend slots', () => {
    const backend = fakeBackend();
    setStatusBarBackend(backend);
    installStatusBarHostBackend(fakeBackend());
    observeStatusBarHostResult('setBackgroundColor', true);
    resetStatusBarBackendForTest();
    expect(getStatusBarBackend()).not.toBe(backend);
    expect(explainStatusBarBackend().layer).toBe('host-not-enabled');
    expect(explainStatusBarBackend().conflict).toBe(false);
    expect(explainStatusBarBackend().viability).toBe('unobserved');
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
