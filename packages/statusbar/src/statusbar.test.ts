import { connectSignal } from '@flighthq/signals/contract';
import type {
  HasUiStatusBarChange,
  HasUiStatusBarStyleStack,
  StatusBarInfo,
  StatusBarStyle,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as statusbar from './statusbar';

describe('attachStatusBar', () => {
  it('pins both event and snapshot providers at attachment time', () => {
    const first = fakeHost('light');
    const second = fakeHost('dark');
    const bar = statusbar.createStatusBar();
    const seen: StatusBarInfo[] = [];
    connectSignal(bar.onChange, (info) => seen.push(info));

    statusbar.attachStatusBar(first.host, bar);
    first.emit();
    statusbar.attachStatusBar(second.host, bar);
    first.emit();
    second.emit();

    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(seen.map((info) => info.style)).toEqual(['light', 'dark']);
  });
});

describe('clearStatusBarStyleStack', () => {
  it('restores only the passed host baseline', () => {
    const first = fakeHost('light');
    const second = fakeHost('dark');
    statusbar.pushStatusBarStyleEntry(first.host, { style: 'dark' });
    statusbar.pushStatusBarStyleEntry(second.host, { style: 'light' });
    statusbar.clearStatusBarStyleStack(first.host);
    expect(first.setStyle).toHaveBeenLastCalledWith('light');
    expect(second.setStyle).toHaveBeenCalledTimes(1);
  });
});

describe('createStatusBar', () => {
  it('creates an inert signal entity', () => expect(statusbar.createStatusBar().onChange).toBeDefined());
});

describe('createStatusBarInfo', () => {
  it('creates the documented unknown/default snapshot', () => {
    expect(statusbar.createStatusBarInfo()).toMatchObject({
      color: 0,
      height: -1,
      overlaysContent: false,
      style: 'default',
      visible: true,
    });
  });
});

describe('detachStatusBar', () => {
  it('releases the exact attached provider once', () => {
    const provider = fakeHost('light');
    const bar = statusbar.createStatusBar();
    statusbar.attachStatusBar(provider.host, bar);
    statusbar.detachStatusBar(bar);
    statusbar.detachStatusBar(bar);
    expect(provider.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('disposeStatusBar', () => {
  it('detaches its subscription', () => {
    const provider = fakeHost('light');
    const bar = statusbar.createStatusBar();
    statusbar.attachStatusBar(provider.host, bar);
    statusbar.disposeStatusBar(bar);
    expect(provider.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('getStatusBarHeight', () => {
  it('reads from the passed host', () => expect(statusbar.getStatusBarHeight(fakeHost('light').host)).toBe(20));
});

describe('getStatusBarInfo', () => {
  it('fills and returns the caller out object', () => {
    const out = statusbar.createStatusBarInfo();
    expect(statusbar.getStatusBarInfo(fakeHost('dark').host, out)).toBe(out);
    expect(out.style).toBe('dark');
  });
});

describe('hasStatusBarStyleEntry', () => {
  it('tracks handles within one explicit host', () => {
    const provider = fakeHost('light');
    const handle = statusbar.pushStatusBarStyleEntry(provider.host, { style: 'dark' });
    expect(statusbar.hasStatusBarStyleEntry(provider.host, handle)).toBe(true);
    statusbar.popStatusBarStyleEntry(provider.host, handle);
    expect(statusbar.hasStatusBarStyleEntry(provider.host, handle)).toBe(false);
  });
});

describe('packedRgbaToHexColor', () => {
  it('drops alpha and pads hex digits', () => expect(statusbar.packedRgbaToHexColor(0x01020304)).toBe('#010203'));
});

describe('popStatusBarStyleEntry', () => {
  it('restores the captured baseline', () => {
    const provider = fakeHost('light');
    const handle = statusbar.pushStatusBarStyleEntry(provider.host, { style: 'dark' });
    statusbar.popStatusBarStyleEntry(provider.host, handle);
    expect(provider.setStyle).toHaveBeenLastCalledWith('light');
  });
});

describe('pushStatusBarStyleEntry', () => {
  it('merges unset fields through the stack', () => {
    const provider = fakeHost('light');
    statusbar.pushStatusBarStyleEntry(provider.host, { style: 'dark' });
    statusbar.pushStatusBarStyleEntry(provider.host, { visible: false });
    expect(provider.setStyle).toHaveBeenCalledTimes(1);
    expect(provider.setVisible).toHaveBeenLastCalledWith(false, 'none');
  });
});

describe('setStatusBarColor', () => {
  it('uses only the color slot', () => {
    const provider = fakeHost('light');
    statusbar.setStatusBarColor(provider.host, 0x112233ff, true);
    expect(provider.setBackgroundColor).toHaveBeenCalledWith(0x112233ff, true);
  });
});

describe('setStatusBarOverlaysContent', () => {
  it('uses only the overlays slot', () => {
    const provider = fakeHost('light');
    statusbar.setStatusBarOverlaysContent(provider.host, true);
    expect(provider.setOverlaysContent).toHaveBeenCalledWith(true);
  });
});

describe('setStatusBarStyle', () => {
  it('uses only the style slot', () => {
    const provider = fakeHost('light');
    statusbar.setStatusBarStyle(provider.host, 'dark');
    expect(provider.setStyle).toHaveBeenCalledWith('dark');
  });
});

describe('setStatusBarVisible', () => {
  it('uses only the visibility slot', () => {
    const provider = fakeHost('light');
    statusbar.setStatusBarVisible(provider.host, false, 'fade');
    expect(provider.setVisible).toHaveBeenCalledWith(false, 'fade');
  });
});

function fakeHost(initialStyle: StatusBarStyle) {
  let listener: (() => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const setBackgroundColor = vi.fn();
  const setOverlaysContent = vi.fn();
  const setStyle = vi.fn();
  const setVisible = vi.fn();
  const host: HasUiStatusBarChange & HasUiStatusBarStyleStack = {
    ui: {
      statusBarChange: {
        subscribe(next) {
          listener = next;
          return unsubscribe;
        },
      },
      statusBarColor: { setBackgroundColor },
      statusBarInfo: {
        getInfo(out) {
          Object.assign(out, {
            color: 0,
            height: 20,
            overlaysContent: false,
            style: initialStyle,
            visible: true,
          });
          return out;
        },
      },
      statusBarOverlays: { setOverlaysContent },
      statusBarStyle: { setStyle },
      statusBarVisibility: { setVisible },
    },
  };
  return {
    emit: () => listener?.(),
    host,
    setBackgroundColor,
    setOverlaysContent,
    setStyle,
    setVisible,
    unsubscribe,
  };
}
