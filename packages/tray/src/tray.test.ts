import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type {
  HasTrayBalloon,
  HasTrayBalloonEvents,
  HasTrayBounds,
  HasTrayDoubleClickPolicy,
  HasTrayDropEvents,
  HasTrayImage,
  HasTrayInteractionEvents,
  HasTrayLifecycle,
  HasTrayMenu,
  HasTrayMenuSelectionEvents,
  HasTrayPopupMenu,
  HasTrayPressedImage,
  HasTrayTemplateImage,
  HasTrayTitle,
  HasTrayTooltip,
  RectangleLike,
  Signal,
  TrayBalloonEvent,
  TrayDropEvent,
  TrayIcon,
  TrayIconForHost,
  TrayInteractionEvent,
  TrayMenuSelectionEvent,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createTrayIcon,
  destroyTrayIcon,
  displayTrayBalloon,
  getTrayIconBounds,
  getTrayIconTitle,
  getTrayIconTooltip,
  getTrayIcons,
  initializeTrayCreateFailedResult,
  initializeTrayCreateProviderFailureResult,
  initializeTrayCreateSuccessResult,
  isTrayDestroyed,
  isTrayIconAnimating,
  onTrayBalloonEvent,
  onTrayDrop,
  onTrayInteraction,
  onTrayMenuSelection,
  popupTrayContextMenu,
  removeTrayBalloon,
  setTrayAnimationGuard,
  setTrayIcon,
  setTrayIconContextMenu,
  setTrayIconTemplate,
  setTrayIconTitle,
  setTrayIconTooltip,
  setTrayIgnoreDoubleClickEvents,
  setTrayPressedIcon,
  startTrayIconAnimation,
  stopTrayIconAnimation,
} from './tray';

type TestHost = HasTrayLifecycle &
  HasTrayImage &
  HasTrayTitle &
  HasTrayTooltip &
  HasTrayMenu &
  HasTrayTemplateImage &
  HasTrayBounds &
  HasTrayPopupMenu &
  HasTrayDoubleClickPolicy &
  HasTrayPressedImage &
  HasTrayBalloon &
  HasTrayInteractionEvents &
  HasTrayMenuSelectionEvents &
  HasTrayBalloonEvents &
  HasTrayDropEvents;

interface TestState {
  balloonEvents: WeakMap<TrayIcon, Signal<(event: Readonly<TrayBalloonEvent>) => void>>;
  destroyFailures: number;
  destroyed: WeakSet<TrayIcon>;
  dropEvents: WeakMap<TrayIcon, Signal<(event: Readonly<TrayDropEvent>) => void>>;
  images: string[];
  interactionEvents: WeakMap<TrayIcon, Signal<(event: Readonly<TrayInteractionEvent>) => void>>;
  live: TrayIcon[];
  menuSelectionEvents: WeakMap<TrayIcon, Signal<(event: Readonly<TrayMenuSelectionEvent>) => void>>;
  title: string;
  tooltip: string;
}

function testHost(): { host: TestHost; state: TestState } {
  const state: TestState = {
    balloonEvents: new WeakMap(),
    destroyFailures: 0,
    destroyed: new WeakSet(),
    dropEvents: new WeakMap(),
    images: [],
    interactionEvents: new WeakMap(),
    live: [],
    menuSelectionEvents: new WeakMap(),
    title: '',
    tooltip: '',
  };
  const signalFor = <Event extends object>(
    map: WeakMap<TrayIcon, Signal<(event: Readonly<Event>) => void>>,
    tray: TrayIcon,
  ): Signal<(event: Readonly<Event>) => void> | null => map.get(tray) ?? null;
  const host = {
    tray: {
      lifecycle: (() => {
        const out = allocateEntity<any>();
        out.create = async (tray: TrayIcon) => {
          state.live.push(tray);
          state.balloonEvents.set(tray, createSignal());
          state.dropEvents.set(tray, createSignal());
          state.interactionEvents.set(tray, createSignal());
          state.menuSelectionEvents.set(tray, createSignal());
          return { outcome: 'created' as const };
        };
        out.destroy = async (tray: TrayIcon) => {
          if (state.destroyFailures-- > 0) {
            return { failures: [{ step: 'native-resource' as const }], outcome: 'tray-destroy-failed' as const };
          }
          state.destroyed.add(tray);
          state.live = state.live.filter((item) => item !== tray);
          return { outcome: 'destroyed' as const };
        };
        out.isDestroyed = (tray: TrayIcon) => state.destroyed.has(tray);
        out.list = () => state.live.slice();
        return finishEntity(out);
      })(),
      image: (() => {
        const out = allocateEntity<any>();
        out.set = async (_tray: TrayIcon, icon: string) => {
          state.images.push(icon);
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      title: (() => {
        const out = allocateEntity<any>();
        out.get = async () => {
          return { outcome: 'available' as const, title: state.title };
        };
        out.set = async (_tray: TrayIcon, title: string) => {
          state.title = title;
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      tooltip: (() => {
        const out = allocateEntity<any>();
        out.get = async () => {
          return { outcome: 'available' as const, tooltip: state.tooltip };
        };
        out.set = async (_tray: TrayIcon, tooltip: string) => {
          state.tooltip = tooltip;
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      menu: (() => {
        const out = allocateEntity<any>();
        out.set = async () => {
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      templateImage: (() => {
        const out = allocateEntity<any>();
        out.set = async () => {
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      bounds: (() => {
        const out = allocateEntity<any>();
        out.get = async () => {
          return { bounds: { height: 2, width: 1, x: 3, y: 4 } satisfies RectangleLike, outcome: 'available' as const };
        };
        return finishEntity(out);
      })(),
      popupMenu: (() => {
        const out = allocateEntity<any>();
        out.popup = async () => {
          return { outcome: 'shown' as const };
        };
        return finishEntity(out);
      })(),
      doubleClickPolicy: (() => {
        const out = allocateEntity<any>();
        out.setIgnore = async () => {
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      pressedImage: (() => {
        const out = allocateEntity<any>();
        out.set = async () => {
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
      balloon: (() => {
        const out = allocateEntity<any>();
        out.display = async () => {
          return { outcome: 'displayed' as const };
        };
        out.remove = async () => {
          return { outcome: 'removed' as const };
        };
        return finishEntity(out);
      })(),
      interactionEvents: (() => {
        const out = allocateEntity<any>();
        out.getSignal = (tray: TrayIcon) => signalFor(state.interactionEvents, tray);
        return finishEntity(out);
      })(),
      menuSelectionEvents: (() => {
        const out = allocateEntity<any>();
        out.getSignal = (tray: TrayIcon) => signalFor(state.menuSelectionEvents, tray);
        return finishEntity(out);
      })(),
      balloonEvents: (() => {
        const out = allocateEntity<any>();
        out.getSignal = (tray: TrayIcon) => signalFor(state.balloonEvents, tray);
        return finishEntity(out);
      })(),
      dropEvents: (() => {
        const out = allocateEntity<any>();
        out.getSignal = (tray: TrayIcon) => signalFor(state.dropEvents, tray);
        return finishEntity(out);
      })(),
    },
  };
  return { host: host as TestHost, state };
}

async function acquire(host: TestHost): Promise<TrayIconForHost<TestHost>> {
  const result = await createTrayIcon(host);
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return result.tray;
}

describe('createTrayIcon', () => {
  it('publishes only after provider acquisition and exposes no public id', async () => {
    const { host, state } = testHost();
    const pending = createTrayIcon(host);
    expect(state.live).toHaveLength(1);
    const result = await pending;
    expect(result.outcome).toBe('created');
    if (result.outcome === 'created') expect('id' in result.tray).toBe(false);
  });
});

describe('destroyTrayIcon', () => {
  it('retries only a failed native release and is idempotent after success', async () => {
    const { host, state } = testHost();
    state.destroyFailures = 1;
    const tray = await acquire(host);
    expect((await destroyTrayIcon(tray)).outcome).toBe('tray-destroy-failed');
    expect((await destroyTrayIcon(tray)).outcome).toBe('destroyed');
    expect((await destroyTrayIcon(tray)).outcome).toBe('already-destroyed');
  });
});

describe('displayTrayBalloon', () => {
  it('owns balloon display on the Tray entity', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    expect((await displayTrayBalloon(tray, { text: 'Done', title: 'Flight' })).outcome).toBe('displayed');
  });
});

describe('getTrayIconBounds', () => {
  it('returns provider bounds', async () => {
    const { host } = testHost();
    expect(await getTrayIconBounds(await acquire(host))).toMatchObject({ outcome: 'available', bounds: { width: 1 } });
  });
});

describe('getTrayIcons', () => {
  it('preserves acquisition order', async () => {
    const { host } = testHost();
    const first = await acquire(host);
    const second = await acquire(host);
    expect(getTrayIcons(host)).toEqual([first, second]);
  });
});

describe('getTrayIconTitle', () => {
  it('reads the title', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    await setTrayIconTitle(tray, 'Flight');
    expect(await getTrayIconTitle(tray)).toEqual({ outcome: 'available', title: 'Flight' });
  });
});

describe('getTrayIconTooltip', () => {
  it('reads the tooltip', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    await setTrayIconTooltip(tray, 'Ready');
    expect(await getTrayIconTooltip(tray)).toEqual({ outcome: 'available', tooltip: 'Ready' });
  });
});

describe('initializeTrayCreateFailedResult', () => {
  it('is the construction initializer of createTrayCreateFailedResult', () => {
    expect(typeof initializeTrayCreateFailedResult).toBe('function');
  });
});

describe('initializeTrayCreateProviderFailureResult', () => {
  it('is the construction initializer of createTrayCreateProviderFailureResult', () => {
    expect(typeof initializeTrayCreateProviderFailureResult).toBe('function');
  });
});

describe('initializeTrayCreateSuccessResult', () => {
  it('is the construction initializer of createTrayCreateSuccessResult', () => {
    expect(typeof initializeTrayCreateSuccessResult).toBe('function');
  });
});

describe('isTrayDestroyed', () => {
  it('tracks the pinned lifecycle', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    expect(isTrayDestroyed(tray)).toBe(false);
    await destroyTrayIcon(tray);
    expect(isTrayDestroyed(tray)).toBe(true);
  });
});

describe('isTrayIconAnimating', () => {
  it('tracks the current animation generation', async () => {
    vi.useFakeTimers();
    const { host } = testHost();
    const tray = await acquire(host);
    await startTrayIconAnimation(tray, ['a'], 10);
    expect(isTrayIconAnimating(tray)).toBe(true);
    stopTrayIconAnimation(tray);
    expect(isTrayIconAnimating(tray)).toBe(false);
    vi.useRealTimers();
  });
});

describe('onTrayBalloonEvent', () => {
  it('delivers balloon lifecycle independently', async () => {
    const { host, state } = testHost();
    const tray = await acquire(host);
    const listener = vi.fn();
    expect(onTrayBalloonEvent(tray, listener).outcome).toBe('attached');
    state.balloonEvents.get(tray)!.emit({ type: 'show' });
    expect(listener).toHaveBeenCalledWith({ type: 'show' });
  });
});

describe('onTrayDrop', () => {
  it('delivers drop data independently', async () => {
    const { host, state } = testHost();
    const tray = await acquire(host);
    const listener = vi.fn();
    expect(onTrayDrop(tray, listener).outcome).toBe('attached');
    state.dropEvents.get(tray)!.emit({ files: ['a'], type: 'files' });
    expect(listener).toHaveBeenCalledWith({ files: ['a'], type: 'files' });
  });
});

describe('onTrayInteraction', () => {
  it('releases once and destroy releases a remaining subscription', async () => {
    const { host, state } = testHost();
    const tray = await acquire(host);
    const listener = vi.fn();
    const attached = onTrayInteraction(tray, listener);
    expect(attached.outcome).toBe('attached');
    state.interactionEvents.get(tray)!.emit({
      altKey: false,
      bounds: null,
      ctrlKey: false,
      metaKey: false,
      position: null,
      shiftKey: false,
      type: 'click',
    });
    expect(listener).toHaveBeenCalledOnce();
    if (attached.outcome === 'attached') {
      expect((await attached.release.release()).outcome).toBe('released');
      expect((await attached.release.release()).outcome).toBe('already-released');
    }
    const destroyReleased = vi.fn();
    onTrayInteraction(tray, destroyReleased);
    await destroyTrayIcon(tray);
    state.interactionEvents.get(tray)!.emit({
      altKey: false,
      bounds: null,
      ctrlKey: false,
      metaKey: false,
      position: null,
      shiftKey: false,
      type: 'click',
    });
    expect(destroyReleased).not.toHaveBeenCalled();
  });
});

describe('onTrayMenuSelection', () => {
  it('delivers a per-Tray menu id', async () => {
    const { host, state } = testHost();
    const tray = await acquire(host);
    const listener = vi.fn();
    expect(onTrayMenuSelection(tray, listener).outcome).toBe('attached');
    state.menuSelectionEvents.get(tray)!.emit({ id: 'open' });
    expect(listener).toHaveBeenCalledWith({ id: 'open' });
  });
});

describe('popupTrayContextMenu', () => {
  it('shows the installed menu', async () => {
    const { host } = testHost();
    expect((await popupTrayContextMenu(await acquire(host), { x: 1, y: 2 })).outcome).toBe('shown');
  });
});

describe('removeTrayBalloon', () => {
  it('owns balloon removal on the Tray entity', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    await displayTrayBalloon(tray, { text: 'Done', title: 'Flight' });
    expect((await removeTrayBalloon(tray)).outcome).toBe('removed');
  });
});

describe('setTrayAnimationGuard', () => {
  it('installs and clears the opt-in animation inspection hook', async () => {
    vi.useFakeTimers();
    const guard = vi.fn();
    setTrayAnimationGuard(guard);
    const { host } = testHost();
    const tray = await acquire(host);
    const started = await startTrayIconAnimation(tray, ['a'], 12);
    expect(guard).toHaveBeenCalledWith(tray, 1, 12);
    if (started.outcome === 'started') await started.release.release();
    setTrayAnimationGuard(null);
    vi.useRealTimers();
  });
});

describe('setTrayIcon', () => {
  it('uses the acquired provider facet', async () => {
    const { host, state } = testHost();
    expect((await setTrayIcon(await acquire(host), 'icon')).outcome).toBe('updated');
    expect(state.images).toEqual(['icon']);
  });
});

describe('setTrayIconContextMenu', () => {
  it('installs a plain descriptor', async () => {
    const { host } = testHost();
    expect((await setTrayIconContextMenu(await acquire(host), [{ id: 'quit', label: 'Quit' }])).outcome).toBe(
      'updated',
    );
  });
});

describe('setTrayIconTemplate', () => {
  it('updates template treatment', async () => {
    const { host } = testHost();
    expect((await setTrayIconTemplate(await acquire(host), true)).outcome).toBe('updated');
  });
});

describe('setTrayIconTitle', () => {
  it('updates the title', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    expect((await setTrayIconTitle(tray, 'Flight')).outcome).toBe('updated');
  });
});

describe('setTrayIconTooltip', () => {
  it('updates the tooltip', async () => {
    const { host } = testHost();
    const tray = await acquire(host);
    expect((await setTrayIconTooltip(tray, 'Ready')).outcome).toBe('updated');
  });
});

describe('setTrayIgnoreDoubleClickEvents', () => {
  it('updates the policy', async () => {
    const { host } = testHost();
    expect((await setTrayIgnoreDoubleClickEvents(await acquire(host), true)).outcome).toBe('updated');
  });
});
describe('setTrayPressedIcon', () => {
  it('updates the pressed icon', async () => {
    const { host } = testHost();
    expect((await setTrayPressedIcon(await acquire(host), 'pressed')).outcome).toBe('updated');
  });
});

describe('startTrayIconAnimation', () => {
  it('writes through the origin-pinned image facet', async () => {
    vi.useFakeTimers();
    const { host, state } = testHost();
    const tray = await acquire(host);
    const result = await startTrayIconAnimation(tray, ['a', 'b'], 10);
    expect(result.outcome).toBe('started');
    await vi.advanceTimersByTimeAsync(10);
    expect(state.images).toEqual(['a', 'b']);
    if (result.outcome === 'started') await result.release.release();
    vi.useRealTimers();
  });
});

describe('stopTrayIconAnimation', () => {
  it('stops only the current generation', async () => {
    vi.useFakeTimers();
    const { host } = testHost();
    const tray = await acquire(host);
    await startTrayIconAnimation(tray, ['a'], 10);
    expect(stopTrayIconAnimation(tray).outcome).toBe('stopped');
    expect(stopTrayIconAnimation(tray).outcome).toBe('already-stopped');
    vi.useRealTimers();
  });
});
