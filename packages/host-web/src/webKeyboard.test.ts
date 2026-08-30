import type { SoftKeyboardInfo } from '@flighthq/types/contract';

import {
  createWebSoftKeyboardChangeBackend,
  createWebSoftKeyboardInfoBackend,
  createWebSoftKeyboardVisibilityBackend,
} from './webKeyboard';

type VirtualKeyboardStub = {
  boundingRect: DOMRect;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  show(): void;
  hide(): void;
};

function stubWindowMetrics(innerHeight: number, innerWidth: number): void {
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
}

function stubVisualViewport(viewport: Readonly<VisualViewport> | { height: number } | null): () => void {
  const had = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return () => {
    if (had !== undefined) Object.defineProperty(window, 'visualViewport', had);
    else Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  };
}

function stubVirtualKeyboard(vk: VirtualKeyboardStub): () => void {
  const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboardStub };
  const had = nav.virtualKeyboard;
  Object.defineProperty(nav, 'virtualKeyboard', { value: vk, configurable: true });
  return () => {
    if (had !== undefined) Object.defineProperty(nav, 'virtualKeyboard', { value: had, configurable: true });
    else delete nav.virtualKeyboard;
  };
}

function blankInfo(): SoftKeyboardInfo {
  return { visible: false, height: 0, x: 0, y: 0, width: 0 };
}

describe('createWebSoftKeyboardChangeBackend', () => {
  it('subscribe returns a cleanup function', async () => {
    const cleanup = await createWebSoftKeyboardChangeBackend().subscribe(() => {});
    if (cleanup !== null) {
      expect(() => cleanup()).not.toThrow();
    }
  });

  it('subscribes to visualViewport resize/scroll and fires the listener', async () => {
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
      let fires = 0;
      const cleanup = await createWebSoftKeyboardChangeBackend().subscribe(() => fires++);
      expect(events.has('resize')).toBe(true);
      expect(events.has('scroll')).toBe(true);
      events.get('resize')!();
      expect(fires).toBe(1);
      cleanup!();
      expect(events.size).toBe(0);
    } finally {
      restore();
    }
  });

  it('subscribe returns null when visualViewport is absent', async () => {
    const restore = stubVisualViewport(null);
    try {
      const cleanup = await createWebSoftKeyboardChangeBackend().subscribe(() => {});
      expect(cleanup).toBeNull();
    } finally {
      restore();
    }
  });

  it('subscribes via VirtualKeyboard geometrychange when present', async () => {
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
      let fires = 0;
      const cleanup = await createWebSoftKeyboardChangeBackend().subscribe(() => fires++);
      expect(events.has('geometrychange')).toBe(true);
      events.get('geometrychange')!();
      expect(fires).toBe(1);
      cleanup!();
      expect(events.has('geometrychange')).toBe(false);
    } finally {
      restore();
    }
  });
});
describe('createWebSoftKeyboardInfoBackend', () => {
  it('reads info without throwing', () => {
    const out = blankInfo();
    expect(typeof createWebSoftKeyboardInfoBackend().getInfo(out).visible).toBe('boolean');
  });

  it('returns rect fields with height 0 when no keyboard is present', () => {
    const out = blankInfo();
    createWebSoftKeyboardInfoBackend().getInfo(out);
    expect(out.height).toBe(0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
  });

  it('infers height from a visualViewport shrink relative to window.innerHeight', () => {
    const restore = stubVisualViewport({ height: 600 });
    try {
      stubWindowMetrics(900, 375);
      const out = blankInfo();
      createWebSoftKeyboardInfoBackend().getInfo(out);
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
      const out = blankInfo();
      createWebSoftKeyboardInfoBackend().getInfo(out);
      expect(out.visible).toBe(false);
      expect(out.height).toBe(0);
      expect(out.width).toBe(0);
      expect(out.y).toBe(0);
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
      const out = blankInfo();
      createWebSoftKeyboardInfoBackend().getInfo(out);
      expect(out.height).toBe(280);
      expect(out.width).toBe(320);
      expect(out.x).toBe(5);
      expect(out.y).toBe(620);
      expect(out.visible).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('createWebSoftKeyboardVisibilityBackend', () => {
  it('returns ok when VirtualKeyboard API is present', async () => {
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
      const backend = createWebSoftKeyboardVisibilityBackend();
      expect(await backend.show()).toBe('ok');
      expect(await backend.hide()).toBe('ok');
      expect(shown).toBe(true);
      expect(hidden).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns operation-failed without VirtualKeyboard API', async () => {
    const backend = createWebSoftKeyboardVisibilityBackend();
    expect(await backend.show()).toBe('operation-failed');
    expect(await backend.hide()).toBe('operation-failed');
  });
});
