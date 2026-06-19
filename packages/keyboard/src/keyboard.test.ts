import { connectSignal } from '@flighthq/signals';
import type { SoftKeyboardBackend, SoftKeyboardInfo } from '@flighthq/types';

import {
  attachSoftKeyboard,
  createSoftKeyboard,
  createSoftKeyboardInfo,
  createWebSoftKeyboardBackend,
  detachSoftKeyboard,
  disposeSoftKeyboard,
  getSoftKeyboardBackend,
  getSoftKeyboardInfo,
  hideSoftKeyboard,
  setSoftKeyboardBackend,
  showSoftKeyboard,
} from './keyboard';

function fakeBackend(): SoftKeyboardBackend & {
  visible: boolean;
  height: number;
  shown: boolean;
  hidden: boolean;
  fire: () => void;
} {
  let listener: (() => void) | null = null;
  return {
    visible: false,
    height: 0,
    shown: false,
    hidden: false,
    getInfo(out) {
      out.visible = this.visible;
      out.height = this.height;
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
    fire() {
      listener?.();
    },
  };
}

afterEach(() => setSoftKeyboardBackend(null));

describe('attachSoftKeyboard', () => {
  it('emits onResize and onShow when the keyboard becomes visible', () => {
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
    backend.fire();
    expect(resizes).toBe(1);
    expect(shows).toBe(1);
  });
});

describe('createSoftKeyboard', () => {
  it('creates an entity with three signals', () => {
    const keyboard = createSoftKeyboard();
    expect(keyboard.onShow).toBeDefined();
    expect(keyboard.onHide).toBeDefined();
    expect(keyboard.onResize).toBeDefined();
  });
});

describe('createSoftKeyboardInfo', () => {
  it('allocates a zeroed info', () => {
    expect(createSoftKeyboardInfo()).toEqual({ visible: false, height: 0 });
  });
});

describe('createWebSoftKeyboardBackend', () => {
  it('reads info without throwing', () => {
    const out = createSoftKeyboardInfo();
    expect(typeof createWebSoftKeyboardBackend().getInfo(out).visible).toBe('boolean');
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
});

describe('disposeSoftKeyboard', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setSoftKeyboardBackend(backend);
    const keyboard = createSoftKeyboard();
    attachSoftKeyboard(keyboard);
    expect(() => disposeSoftKeyboard(keyboard)).not.toThrow();
  });
});

describe('getSoftKeyboardBackend', () => {
  it('falls back to a web backend', () => {
    expect(getSoftKeyboardBackend()).not.toBeNull();
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

describe('setSoftKeyboardBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setSoftKeyboardBackend(fakeBackend());
    setSoftKeyboardBackend(null);
    expect(getSoftKeyboardBackend()).not.toBeNull();
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
