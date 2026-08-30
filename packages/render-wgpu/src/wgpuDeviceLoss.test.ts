import { connectSignal, createSignal } from '@flighthq/signals/contract';
import type { WgpuDeviceRuntime, WgpuRenderState } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  disposeWgpuDeviceSignals,
  enableWgpuDeviceSignals,
  getWgpuDeviceLoss,
  isWgpuDeviceLost,
  observeWgpuDeviceLoss,
} from './wgpuDeviceLoss';
import {
  createWgpuDeviceState,
  createWgpuOffscreenRenderState,
  createWgpuRenderStateRuntime,
  getWgpuRenderStateRuntime,
} from './wgpuRenderState';

// A device whose loss the test drives by hand. `lost` is the only member the observer reads, so the
// rest of GPUDevice stays absent on purpose: a probe that needed a full device would be testing the
// mock. `resolveLost` stands in for the driver resolving the real terminal promise.
function makeLosableDevice(): { device: GPUDevice; resolveLost: (reason: GPUDeviceLostReason) => void } {
  let resolveLost!: (reason: GPUDeviceLostReason) => void;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = (reason) => resolve({ message: `lost: ${reason}`, reason } as GPUDeviceLostInfo);
  });
  return { device: { destroy: () => {}, lost } as unknown as GPUDevice, resolveLost };
}

function makeStateOn(device: GPUDevice): WgpuRenderState {
  const state = { applyBlendMode: null } as unknown as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState(device));
  return state;
}

// A second state over the SAME device tier — the alias relationship a derived pipeline has. Passing
// the same GPUDevice to makeStateOn twice does NOT produce this: createWgpuDeviceState mints a fresh
// tier per call, so two such states would share a device and nothing else, and every aliasing probe
// would pass or fail for the wrong reason.
function makeAliasOf(state: WgpuRenderState): WgpuRenderState {
  const alias = { applyBlendMode: null } as unknown as WgpuRenderState;
  alias[EntityRuntimeKey] = createWgpuRenderStateRuntime(getWgpuRenderStateRuntime(state));
  return alias;
}

// A resolved `lost` promise still has to reach a listener through a microtask, so every probe that
// asserts on emission awaits one turn after resolving.
const settle = (): Promise<void> => Promise.resolve().then(() => undefined);

describe('createWgpuOffscreenRenderState', () => {
  it('reports a method-tight device-lost outcome instead of deriving on a dead device', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const screen = makeStateOn(device);
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    const result = createWgpuOffscreenRenderState(screen);
    expect(result.reason).toBe('device-lost');
    if (result.reason !== 'device-lost') throw new Error('expected a device-lost outcome');
    expect(result.info.reason).toBe('unknown');
  });
});

describe('disposeWgpuDeviceSignals', () => {
  it('clears the group so a later enable allocates a fresh one', () => {
    const { device } = makeLosableDevice();
    const state = makeStateOn(device);
    const first = enableWgpuDeviceSignals(state);
    disposeWgpuDeviceSignals(state);
    expect(enableWgpuDeviceSignals(state)).not.toBe(first);
  });
});

describe('enableWgpuDeviceSignals', () => {
  it('is idempotent, returning the same group on every call', () => {
    const { device } = makeLosableDevice();
    const state = makeStateOn(device);
    expect(enableWgpuDeviceSignals(state)).toBe(enableWgpuDeviceSignals(state));
  });

  it('shares one group between two states over one device', () => {
    const { device } = makeLosableDevice();
    const screen = makeStateOn(device);
    const alias = makeAliasOf(screen);
    expect(enableWgpuDeviceSignals(screen)).toBe(enableWgpuDeviceSignals(alias));
  });
});

describe('getWgpuDeviceLoss', () => {
  // PROBE 1 — unexpected loss emits exactly once. Asserted with a COUNTER: a probe that only checked
  // "did not throw" would survive an implementation that emitted twice, or not at all.
  it('emits onDeviceLost exactly once for an unexpected loss', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const state = makeStateOn(device);
    let emissions = 0;
    connectSignal(enableWgpuDeviceSignals(state).onDeviceLost, () => {
      emissions += 1;
    });
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    expect(emissions).toBe(1);
    expect(getWgpuDeviceLoss(state)?.reason).toBe('unknown');
  });

  // PROBE 2 — an intentional destroy is NOT a device loss to the caller. `device.lost` resolves for
  // our own `device.destroy()` too (wgpuHost release does exactly that), so without this the suite
  // would pass while reporting every clean teardown as a loss.
  it('records an intentional destroy without emitting onDeviceLost', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const state = makeStateOn(device);
    let emissions = 0;
    connectSignal(enableWgpuDeviceSignals(state).onDeviceLost, () => {
      emissions += 1;
    });
    resolveLost('destroyed' as GPUDeviceLostReason);
    await settle();
    expect(emissions).toBe(0);
    expect(getWgpuDeviceLoss(state)?.reason).toBe('destroyed');
  });

  // PROBE 3 — two aliases, one device, one loss. Both report it, and the signal fires once in total
  // rather than once per state.
  it('reports one loss to every state sharing the device', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const screen = makeStateOn(device);
    const alias = makeAliasOf(screen);
    let emissions = 0;
    connectSignal(enableWgpuDeviceSignals(screen).onDeviceLost, () => {
      emissions += 1;
    });
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    expect(emissions).toBe(1);
    expect(isWgpuDeviceLost(screen)).toBe(true);
    expect(isWgpuDeviceLost(alias)).toBe(true);
  });

  // PROBE 4 — a state built AFTER the loss sees the terminal fact immediately. This is the case an
  // event-only model gets wrong: the event already fired, so a late alias would never hear it.
  it('reports the terminal fact to a state created after the loss', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const screen = makeStateOn(device);
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    const late = makeAliasOf(screen);
    expect(isWgpuDeviceLost(late)).toBe(true);
    expect(getWgpuDeviceLoss(late)).toBe(getWgpuDeviceLoss(screen));
  });

  // PROBE 6 — the observer attaches during device-tier construction, but `lost` may ALREADY be
  // resolved by then. A resolved promise still runs a later handler, and the whole design rests on
  // that, so it is asserted rather than assumed.
  it('records a loss that resolved before the device tier was ever constructed', async () => {
    const { device, resolveLost } = makeLosableDevice();
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    const state = makeStateOn(device);
    let emissions = 0;
    connectSignal(enableWgpuDeviceSignals(state).onDeviceLost, () => {
      emissions += 1;
    });
    await settle();
    expect(getWgpuDeviceLoss(state)?.reason).toBe('unknown');
    expect(emissions).toBe(1);
  });

  it('returns null while the device is live', () => {
    const { device } = makeLosableDevice();
    expect(getWgpuDeviceLoss(makeStateOn(device))).toBeNull();
  });

  // A device with no `lost` member is reachable today — `createWgpuDeviceState({} as GPUDevice)` is
  // used by existing tests, and the host seam accepts caller-supplied handles from native hosts.
  it('treats a device with no lost promise as live rather than throwing', () => {
    const state = makeStateOn({ destroy: () => {} } as unknown as GPUDevice);
    expect(isWgpuDeviceLost(state)).toBe(false);
  });
});

describe('isWgpuDeviceLost', () => {
  // PROBE 5 — no state retention. The observer must close over the device tier only; capturing a
  // state would pin every destroyed state for the device's whole life.
  it('does not retain a render state on the device runtime', () => {
    const { device, resolveLost } = makeLosableDevice();
    const state = makeStateOn(device);
    enableWgpuDeviceSignals(state);
    resolveLost('unknown' as GPUDeviceLostReason);
    const deviceRuntime = getWgpuRenderStateRuntime(state).context;
    const holdsState = Object.values(deviceRuntime as unknown as Record<string, unknown>).some(
      (value) => value === state || (Array.isArray(value) && value.includes(state)),
    );
    expect(holdsState).toBe(false);
  });

  it('is false for a live device and true once lost', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const state = makeStateOn(device);
    expect(isWgpuDeviceLost(state)).toBe(false);
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    expect(isWgpuDeviceLost(state)).toBe(true);
  });
});

describe('observeWgpuDeviceLoss', () => {
  it('records the loss on the runtime it was given', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const deviceRuntime = { device, lost: null, signals: null } as unknown as WgpuDeviceRuntime;
    observeWgpuDeviceLoss(deviceRuntime);
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    expect(deviceRuntime.lost?.reason).toBe('unknown');
  });

  // Attaching twice must not announce twice. Nothing calls it twice today, but the terminal guard is
  // what makes "exactly once" a property of the code rather than of the current call graph.
  it('announces once even when attached more than once to the same runtime', async () => {
    const { device, resolveLost } = makeLosableDevice();
    const deviceRuntime = {
      device,
      lost: null,
      signals: { onDeviceLost: createSignal<(info: GPUDeviceLostInfo) => void>() },
    } as unknown as WgpuDeviceRuntime;
    let emissions = 0;
    connectSignal(deviceRuntime.signals!.onDeviceLost, () => {
      emissions += 1;
    });
    observeWgpuDeviceLoss(deviceRuntime);
    observeWgpuDeviceLoss(deviceRuntime);
    resolveLost('unknown' as GPUDeviceLostReason);
    await settle();
    await settle();
    expect(emissions).toBe(1);
  });

  it('is a no-op for a device that exposes no lost promise', () => {
    const deviceRuntime = { device: { destroy: () => {} }, lost: null, signals: null } as unknown as WgpuDeviceRuntime;
    observeWgpuDeviceLoss(deviceRuntime);
    expect(deviceRuntime.lost).toBeNull();
  });
});
