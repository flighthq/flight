import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey, SoftKeyboardResizeBodyKind } from '@flighthq/types/contract';
import type {
  HostSoftKeyboardAccessoryBarProvider,
  HostSoftKeyboardChangeProvider,
  HostSoftKeyboardInfoProvider,
  HostSoftKeyboardResizeModeWriteProvider,
  HostSoftKeyboardScrollAssistProvider,
  HostSoftKeyboardStyleProvider,
  HostSoftKeyboardVisibilityProvider,
  SoftKeyboardChangeSubscription,
  SoftKeyboardInfo,
  SoftKeyboardSetterResult,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';

import {
  attachSoftKeyboard,
  createSoftKeyboard,
  detachSoftKeyboard,
  disposeSoftKeyboard,
  getSoftKeyboardHeight,
  getSoftKeyboardInfo,
  hideSoftKeyboard,
  initializeSoftKeyboard,
  isSoftKeyboardVisible,
  setSoftKeyboardAccessoryBarVisible,
  setSoftKeyboardResizeMode,
  setSoftKeyboardScrollAssistEnabled,
  setSoftKeyboardStyle,
  showSoftKeyboard,
} from './keyboard';

type OmitRuntime<T> = Omit<T, typeof EntityRuntimeKey>;

function fakeInfoBackend(
  info: Partial<SoftKeyboardInfo> = {},
): OmitRuntime<
  { readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider } }['input']['softKeyboardInfo']
> {
  const data: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0, ...info };
  return {
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = data.visible;
      out.height = data.height;
      out.x = data.x;
      out.y = data.y;
      out.width = data.width;
      return out;
    },
  };
}

function fakeChangeBackend(
  willSucceed = true,
): OmitRuntime<
  { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } }['input']['softKeyboardChange']
> {
  return {
    async subscribe(): Promise<SoftKeyboardChangeSubscription> {
      if (!willSucceed) return { result: 'acquisition-failed', unsubscribe: null };
      return { result: 'ok', unsubscribe: () => {} };
    },
  };
}

function fakeVisibilityBackend(result: SoftKeyboardVisibilityResult = 'ok'): OmitRuntime<
  {
    readonly input: {
      readonly softKeyboardVisibility: HostSoftKeyboardVisibilityProvider;
    };
  }['input']['softKeyboardVisibility']
> {
  return {
    async show(): Promise<SoftKeyboardVisibilityResult> {
      return result;
    },
    async hide(): Promise<SoftKeyboardVisibilityResult> {
      return result;
    },
  };
}

function fakeAccessoryBarBackend(result: SoftKeyboardSetterResult = 'ok'): OmitRuntime<
  {
    readonly input: {
      readonly softKeyboardAccessoryBar: HostSoftKeyboardAccessoryBarProvider;
    };
  }['input']['softKeyboardAccessoryBar']
> {
  return {
    async setAccessoryBarVisible(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  };
}

function fakeResizeModeWriteBackend(result: SoftKeyboardSetterResult = 'ok'): OmitRuntime<
  {
    readonly input: {
      readonly softKeyboardResizeModeWrite: HostSoftKeyboardResizeModeWriteProvider;
    };
  }['input']['softKeyboardResizeModeWrite']
> {
  return {
    async setResizeMode(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  };
}

function fakeScrollAssistBackend(result: SoftKeyboardSetterResult = 'ok'): OmitRuntime<
  {
    readonly input: {
      readonly softKeyboardScrollAssist: HostSoftKeyboardScrollAssistProvider;
    };
  }['input']['softKeyboardScrollAssist']
> {
  return {
    async setScrollAssistEnabled(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  };
}

function fakeStyleBackend(
  result: SoftKeyboardSetterResult = 'ok',
): OmitRuntime<
  { readonly input: { readonly softKeyboardStyle: HostSoftKeyboardStyleProvider } }['input']['softKeyboardStyle']
> {
  return {
    async setStyle(): Promise<SoftKeyboardSetterResult> {
      return result;
    },
  };
}

function infoHost(info: Partial<SoftKeyboardInfo> = {}): {
  readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
} {
  return { input: { softKeyboardInfo: fakeInfoBackend(info) } } as {
    readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
  };
}

function visibilityHost(result: SoftKeyboardVisibilityResult = 'ok'): {
  readonly input: {
    readonly softKeyboardVisibility: HostSoftKeyboardVisibilityProvider;
  };
} {
  return { input: { softKeyboardVisibility: fakeVisibilityBackend(result) } } as {
    readonly input: {
      readonly softKeyboardVisibility: HostSoftKeyboardVisibilityProvider;
    };
  };
}

function attachHost(
  willSucceed = true,
  info: Partial<SoftKeyboardInfo> = {},
): { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
  readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
} {
  return {
    input: {
      softKeyboardChange: fakeChangeBackend(willSucceed),
      softKeyboardInfo: fakeInfoBackend(info),
    },
  } as { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
    readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
  };
}

describe('attachSoftKeyboard', () => {
  it('returns ok when change and info backends are present and subscribe succeeds', async () => {
    const host = attachHost(true);
    const keyboard = createSoftKeyboard();
    expect(await attachSoftKeyboard(host.input.softKeyboardChange, host.input.softKeyboardInfo, keyboard)).toBe('ok');
  });

  it('returns acquisition-failed when subscribe returns null', async () => {
    const host = attachHost(false);
    const keyboard = createSoftKeyboard();
    expect(await attachSoftKeyboard(host.input.softKeyboardChange, host.input.softKeyboardInfo, keyboard)).toBe(
      'acquisition-failed',
    );
  });

  it('fires onShow when height goes from 0 to positive', async () => {
    const data: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
    let listener: (() => void) | null = null;
    const host = {
      input: {
        softKeyboardChange: {
          async subscribe(l: () => void): Promise<SoftKeyboardChangeSubscription> {
            listener = l;
            return { result: 'ok', unsubscribe: () => {} };
          },
        },
        softKeyboardInfo: {
          getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
            out.visible = data.visible;
            out.height = data.height;
            out.x = data.x;
            out.y = data.y;
            out.width = data.width;
            return out;
          },
        },
      },
    } as { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
      readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
    };
    const keyboard = createSoftKeyboard();
    let firedHeight = -1;
    connectSignal(keyboard.onShow, (h) => {
      firedHeight = h;
    });
    await attachSoftKeyboard(host.input.softKeyboardChange, host.input.softKeyboardInfo, keyboard);
    data.visible = true;
    data.height = 300;
    listener!();
    expect(firedHeight).toBe(300);
  });

  it('fires onHide when height goes from positive to 0', async () => {
    const data: SoftKeyboardInfo = { visible: true, height: 300, x: 0, y: 0, width: 0 };
    let listener: (() => void) | null = null;
    const host = {
      input: {
        softKeyboardChange: {
          async subscribe(l: () => void): Promise<SoftKeyboardChangeSubscription> {
            listener = l;
            return { result: 'ok', unsubscribe: () => {} };
          },
        },
        softKeyboardInfo: {
          getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
            out.visible = data.visible;
            out.height = data.height;
            out.x = data.x;
            out.y = data.y;
            out.width = data.width;
            return out;
          },
        },
      },
    } as { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
      readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
    };
    const keyboard = createSoftKeyboard();
    let hideFired = false;
    connectSignal(keyboard.onHide, () => {
      hideFired = true;
    });
    await attachSoftKeyboard(host.input.softKeyboardChange, host.input.softKeyboardInfo, keyboard);
    data.visible = false;
    data.height = 0;
    listener!();
    expect(hideFired).toBe(true);
  });

  it('fires onResize when height changes while visible', async () => {
    const data: SoftKeyboardInfo = { visible: true, height: 300, x: 0, y: 0, width: 0 };
    let listener: (() => void) | null = null;
    const host = {
      input: {
        softKeyboardChange: {
          async subscribe(l: () => void): Promise<SoftKeyboardChangeSubscription> {
            listener = l;
            return { result: 'ok', unsubscribe: () => {} };
          },
        },
        softKeyboardInfo: {
          getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
            out.visible = data.visible;
            out.height = data.height;
            out.x = data.x;
            out.y = data.y;
            out.width = data.width;
            return out;
          },
        },
      },
    } as { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
      readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
    };
    const keyboard = createSoftKeyboard();
    let resizedHeight = -1;
    connectSignal(keyboard.onResize, (h) => {
      resizedHeight = h;
    });
    await attachSoftKeyboard(host.input.softKeyboardChange, host.input.softKeyboardInfo, keyboard);
    data.height = 400;
    listener!();
    expect(resizedHeight).toBe(400);
  });
});
describe('createSoftKeyboard', () => {
  it('returns an Entity with signal fields', () => {
    const keyboard = createSoftKeyboard();
    expect(EntityRuntimeKey in keyboard).toBe(true);
    expect(keyboard.onShow).toBeDefined();
    expect(keyboard.onHide).toBeDefined();
    expect(keyboard.onResize).toBeDefined();
  });
});

describe('detachSoftKeyboard', () => {
  it('is safe to call on a keyboard that was never attached', () => {
    expect(() => detachSoftKeyboard(createSoftKeyboard())).not.toThrow();
  });
});

describe('disposeSoftKeyboard', () => {
  it('is safe to call on a keyboard that was never attached', () => {
    expect(() => disposeSoftKeyboard(createSoftKeyboard())).not.toThrow();
  });
});

describe('getSoftKeyboardHeight', () => {
  it('returns the height from the info backend', () => {
    expect(getSoftKeyboardHeight(infoHost({ height: 250 }).input.softKeyboardInfo)).toBe(250);
  });

  it('returns 0 when info reports 0', () => {
    expect(getSoftKeyboardHeight(infoHost({ height: 0 }).input.softKeyboardInfo)).toBe(0);
  });
});

describe('getSoftKeyboardInfo', () => {
  it('writes into the out parameter and returns it', () => {
    const host = infoHost({ visible: true, height: 300, x: 10, y: 20, width: 400 });
    const out: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
    const result = getSoftKeyboardInfo(host.input.softKeyboardInfo, out);
    expect(result).toBe(out);
    expect(out.visible).toBe(true);
    expect(out.height).toBe(300);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(400);
  });
});

describe('hideSoftKeyboard', () => {
  it('delegates to the visibility backend', async () => {
    expect(await hideSoftKeyboard(visibilityHost('ok').input.softKeyboardVisibility)).toBe('ok');
  });

  it('returns operation-failed when the backend reports failure', async () => {
    expect(await hideSoftKeyboard(visibilityHost('operation-failed').input.softKeyboardVisibility)).toBe(
      'operation-failed',
    );
  });
});

describe('initializeSoftKeyboard', () => {
  it('is the construction initializer of createSoftKeyboard', () => {
    expect(typeof initializeSoftKeyboard).toBe('function');
  });
});

describe('isSoftKeyboardVisible', () => {
  it('returns true when info reports visible', () => {
    expect(isSoftKeyboardVisible(infoHost({ visible: true, height: 300 }).input.softKeyboardInfo)).toBe(true);
  });

  it('returns false when info reports not visible', () => {
    expect(isSoftKeyboardVisible(infoHost({ visible: false }).input.softKeyboardInfo)).toBe(false);
  });
});

describe('setSoftKeyboardAccessoryBarVisible', () => {
  it('delegates to the accessory bar backend', async () => {
    const host = { input: { softKeyboardAccessoryBar: fakeAccessoryBarBackend('ok') } } as {
      readonly input: {
        readonly softKeyboardAccessoryBar: HostSoftKeyboardAccessoryBarProvider;
      };
    };
    expect(await setSoftKeyboardAccessoryBarVisible(host.input.softKeyboardAccessoryBar, true)).toBe('ok');
  });

  it('returns operation-failed from the backend', async () => {
    const host = {
      input: { softKeyboardAccessoryBar: fakeAccessoryBarBackend('operation-failed') },
    } as {
      readonly input: {
        readonly softKeyboardAccessoryBar: HostSoftKeyboardAccessoryBarProvider;
      };
    };
    expect(await setSoftKeyboardAccessoryBarVisible(host.input.softKeyboardAccessoryBar, false)).toBe(
      'operation-failed',
    );
  });
});

describe('setSoftKeyboardResizeMode', () => {
  it('delegates to the resize mode write backend', async () => {
    const host = {
      input: { softKeyboardResizeModeWrite: fakeResizeModeWriteBackend('ok') },
    } as {
      readonly input: {
        readonly softKeyboardResizeModeWrite: HostSoftKeyboardResizeModeWriteProvider;
      };
    };
    expect(await setSoftKeyboardResizeMode(host.input.softKeyboardResizeModeWrite, SoftKeyboardResizeBodyKind)).toBe(
      'ok',
    );
  });
});

describe('setSoftKeyboardScrollAssistEnabled', () => {
  it('delegates to the scroll assist backend', async () => {
    const host = {
      input: { softKeyboardScrollAssist: fakeScrollAssistBackend('ok') },
    } as {
      readonly input: {
        readonly softKeyboardScrollAssist: HostSoftKeyboardScrollAssistProvider;
      };
    };
    expect(await setSoftKeyboardScrollAssistEnabled(host.input.softKeyboardScrollAssist, true)).toBe('ok');
  });
});

describe('setSoftKeyboardStyle', () => {
  it('delegates to the style backend', async () => {
    const host = { input: { softKeyboardStyle: fakeStyleBackend('ok') } } as {
      readonly input: { readonly softKeyboardStyle: HostSoftKeyboardStyleProvider };
    };
    expect(await setSoftKeyboardStyle(host.input.softKeyboardStyle, 'Dark')).toBe('ok');
  });
});
describe('showSoftKeyboard', () => {
  it('delegates to the visibility backend', async () => {
    expect(await showSoftKeyboard(visibilityHost('ok').input.softKeyboardVisibility)).toBe('ok');
  });

  it('returns operation-failed when the backend reports failure', async () => {
    expect(await showSoftKeyboard(visibilityHost('operation-failed').input.softKeyboardVisibility)).toBe(
      'operation-failed',
    );
  });
});
