import type { StatusBarBackend, StatusBarStyle } from '@flighthq/types';

import {
  createWebStatusBarBackend,
  getStatusBarBackend,
  setStatusBarBackend,
  setStatusBarColor,
  setStatusBarOverlaysContent,
  setStatusBarStyle,
  setStatusBarVisible,
} from './statusbar';

function fakeBackend(): StatusBarBackend & {
  style: StatusBarStyle;
  visible: boolean;
  color: number;
  overlay: boolean;
} {
  return {
    style: 'default',
    visible: true,
    color: 0,
    overlay: false,
    setStyle(style) {
      this.style = style;
    },
    setVisible(visible) {
      this.visible = visible;
    },
    setBackgroundColor(color) {
      this.color = color;
    },
    setOverlaysContent(overlay) {
      this.overlay = overlay;
    },
  };
}

afterEach(() => setStatusBarBackend(null));

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

  it('no-ops style/visible/overlay without throwing', () => {
    const backend = createWebStatusBarBackend();
    expect(() => {
      backend.setStyle('light');
      backend.setVisible(false);
      backend.setOverlaysContent(true);
    }).not.toThrow();
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
});
