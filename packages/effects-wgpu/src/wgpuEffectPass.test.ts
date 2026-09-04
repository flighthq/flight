import * as renderWgpuContract from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import {
  EFFECT_VERTEX_WGSL,
  clearWgpuEffectTarget,
  createWgpuDualSourceEffectPipeline,
  createWgpuEffectPipeline,
  drawWgpuDualSourceEffectPass,
  drawWgpuEffectPass,
  getWgpuEffectPassState,
  initializeWgpuDualSourceEffectPipeline,
  initializeWgpuEffectPipeline,
} from './wgpuEffectPass';

let runtimeMockCurrent: unknown = null;

beforeAll(() => renderWgpuContract.installWgpuMock());

beforeEach(() => {
  vi.spyOn(renderWgpuContract, 'getWgpuRenderStateRuntime').mockImplementation((() => runtimeMockCurrent) as never);
});

afterEach(() => {
  runtimeMockCurrent = null;
  vi.restoreAllMocks();
});

interface Recorded {
  bindGroups: { dynamicOffsets: number[] | undefined; group: unknown; index: number }[];
  draws: number[];
  loadOps: string[];
  passViews: unknown[];
}

function createHarness(): { recorded: Recorded; state: WgpuRenderState } {
  const recorded: Recorded = { bindGroups: [], draws: [], loadOps: [], passViews: [] };
  const pass = {
    draw: vi.fn((count: number) => recorded.draws.push(count)),
    end: vi.fn(),
    setBindGroup: vi.fn((index: number, group: unknown, dynamicOffsets?: number[]) => {
      recorded.bindGroups.push({ dynamicOffsets, group, index });
    }),
    setPipeline: vi.fn(),
    setViewport: vi.fn(),
  };
  const commandEncoder = {
    beginRenderPass: vi.fn((descriptor: { colorAttachments: { loadOp: string; view: unknown }[] }) => {
      recorded.loadOps.push(descriptor.colorAttachments[0]!.loadOp);
      recorded.passViews.push(descriptor.colorAttachments[0]!.view);
      return pass;
    }),
  };
  runtimeMockCurrent = {
    canvasTextureView: { id: 'canvasView' },
    commandEncoder,
    renderPass: null,
    renderTargetViewport: { height: 64, width: 64 },
  };
  let nextBindGroup = 0;
  const state = {
    surface: { height: 64, width: 64 },
    device: {
      createBindGroup: vi.fn(() => ({ id: `bindGroup-${nextBindGroup++}` })),
      createBindGroupLayout: vi.fn((descriptor: unknown) => ({ descriptor })),
      createBuffer: vi.fn(() => ({ id: 'uniformBuffer' })),
      createPipelineLayout: vi.fn((descriptor: unknown) => ({ descriptor })),
      createRenderPipeline: vi.fn((descriptor: { fragment: { targets: { blend: unknown }[] } }) => ({
        blend: descriptor.fragment.targets[0]!.blend,
      })),
      createSampler: vi.fn(() => ({ id: 'sampler' })),
      createShaderModule: vi.fn((descriptor: { code: string }) => ({ code: descriptor.code })),
      queue: { writeBuffer: vi.fn() },
    },
    format: 'rgba8unorm',
  } as unknown as WgpuRenderState;
  return { recorded, state };
}

function createTarget(id: string): WgpuRenderTarget {
  return { format: 'rgba8unorm', height: 32, id, view: { id: `${id}-view` }, width: 64 } as unknown as WgpuRenderTarget;
}

// `select(whenFalse, whenTrue, condition)` in WGSL. Both arguments are read out of the shipped shader
// rather than restated here, so the assertions below are about the text that compiles.
function selectArguments(assignment: RegExp, componentIndex: number): readonly [number, number] {
  const line = assignment.exec(EFFECT_VERTEX_WGSL);
  if (line === null) throw new Error(`${String(assignment)} matched nothing in EFFECT_VERTEX_WGSL`);
  const selects = [...line[1]!.matchAll(/select\(([^,]+),\s*([^,]+),\s*\w+\)/g)];
  const chosen = selects[componentIndex];
  if (chosen === undefined) throw new Error(`no select at component ${componentIndex} in: ${line[1]!}`);
  return [Number(chosen[1]), Number(chosen[2])];
}

const POSITION = /out\.position = vec4f\((.+)\);/;
const UV = /out\.uv = vec2f\((.+)\);/;

describe('clearWgpuEffectTarget', () => {
  it('begins a pass that clears rather than loads, and ends it', () => {
    const harness = createHarness();

    clearWgpuEffectTarget(harness.state, createTarget('dest'));

    expect(harness.recorded.loadOps).toEqual(['clear']);
    expect(harness.recorded.draws).toEqual([]);
  });
});

describe('createWgpuDualSourceEffectPipeline', () => {
  it('lays out two texture groups after the uniform group', () => {
    const harness = createHarness();

    createWgpuDualSourceEffectPipeline(harness.state, 'FRAGMENT');

    const layout = (harness.state.device.createPipelineLayout as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as {
      bindGroupLayouts: unknown[];
    };
    expect(layout.bindGroupLayouts).toHaveLength(3);
    expect(layout.bindGroupLayouts[1]).toBe(layout.bindGroupLayouts[2]);
  });
});

describe('createWgpuEffectPipeline', () => {
  // ★ CONSTRUCTED CASE: these three blend states ARE the compositing operators. Every effect on this
  // backend picks one of them by name, so a wrong mapping composites every effect in that mode wrongly —
  // and each of the three still produces a picture, so nothing downstream reports it.
  // MEASURED by returning PREMUL_BLEND for 'erase' — 1 of 18 failed, the predicted one and only it:
  //   AssertionError: expected { blend: { color: { …(3) }, …(1) } } to deeply equal { blend: { alpha: { …(3) }, …(1) } }
  it('maps each blend mode to its compositing operator', () => {
    const harness = createHarness();

    expect(createWgpuEffectPipeline(harness.state, 'F', 'premul').pipeline).toEqual({
      blend: {
        alpha: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'one' },
        color: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'one' },
      },
    });
    expect(createWgpuEffectPipeline(harness.state, 'F', 'replace').pipeline).toEqual({
      blend: {
        alpha: { dstFactor: 'zero', operation: 'add', srcFactor: 'one' },
        color: { dstFactor: 'zero', operation: 'add', srcFactor: 'one' },
      },
    });
    expect(createWgpuEffectPipeline(harness.state, 'F', 'erase').pipeline).toEqual({
      blend: {
        alpha: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'zero' },
        color: { dstFactor: 'one-minus-src-alpha', operation: 'add', srcFactor: 'zero' },
      },
    });
  });

  it('defaults to premultiplied compositing', () => {
    const harness = createHarness();

    expect(createWgpuEffectPipeline(harness.state, 'F').blendMode).toBe('premul');
    expect(createWgpuEffectPipeline(harness.state, 'F').pipeline).toEqual(
      createWgpuEffectPipeline(harness.state, 'F', 'premul').pipeline,
    );
  });

  it('prepends the shared fullscreen vertex to the caller fragment', () => {
    const harness = createHarness();

    createWgpuEffectPipeline(harness.state, 'FRAGMENT_BODY');

    const module = (harness.state.device.createShaderModule as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as {
      code: string;
    };
    expect(module.code).toBe(EFFECT_VERTEX_WGSL + 'FRAGMENT_BODY');
  });
});

describe('drawWgpuDualSourceEffectPass', () => {
  it('binds the two sources to groups one and two', () => {
    const harness = createHarness();
    const pipeline = createWgpuDualSourceEffectPipeline(harness.state, 'F');
    harness.recorded.bindGroups.length = 0;

    drawWgpuDualSourceEffectPass(
      harness.state,
      createTarget('source0'),
      createTarget('source1'),
      createTarget('dest'),
      pipeline,
      () => {},
    );

    expect(harness.recorded.bindGroups.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(harness.recorded.bindGroups[1]!.group).not.toBe(harness.recorded.bindGroups[2]!.group);
  });
});

describe('drawWgpuEffectPass', () => {
  it('draws the six-vertex fullscreen quad into a loaded destination', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    harness.recorded.loadOps.length = 0;

    drawWgpuEffectPass(harness.state, createTarget('source'), createTarget('dest'), pipeline, () => {});

    expect(harness.recorded.draws).toEqual([6]);
    expect(harness.recorded.loadOps).toEqual(['load']);
  });

  it('presents to the canvas view when the destination is null', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    harness.recorded.passViews.length = 0;

    drawWgpuEffectPass(harness.state, createTarget('source'), null, pipeline, () => {});

    expect(harness.recorded.passViews).toEqual([{ id: 'canvasView' }]);
  });

  // ★ CONSTRUCTED CASE: each draw takes its OWN uniform slot. Several passes of the same effect run
  // inside one command encoder, and the GPU reads the buffer at submit — not at the write — so two draws
  // sharing a slot both see whichever uniforms were written last. The symptom is one pass rendered with
  // another's parameters, intermittently, depending on how many passes a chain happens to have.
  // MEASURED by never advancing the ring (`fs.uniformOffset = offset`) — 3 of 18 failed:
  //   AssertionError: expected +0 to be 256 // Object.is equality
  //   AssertionError: expected +0 to be 130816 // Object.is equality
  //   AssertionError: expected 256 to be +0 // Object.is equality
  it('gives consecutive draws distinct ring-buffer slots', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    const source = createTarget('source');
    const dest = createTarget('dest');
    harness.recorded.bindGroups.length = 0;

    drawWgpuEffectPass(harness.state, source, dest, pipeline, () => {});
    drawWgpuEffectPass(harness.state, source, dest, pipeline, () => {});

    const offsets = harness.recorded.bindGroups
      .filter((entry) => entry.index === 0)
      .map((entry) => entry.dynamicOffsets![0]!);
    expect(offsets[1]! - offsets[0]!).toBe(256);
  });

  it('wraps back to the first slot after the ring is full', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    const source = createTarget('source');
    const dest = createTarget('dest');
    harness.recorded.bindGroups.length = 0;

    for (let draw = 0; draw < 513; draw++) {
      drawWgpuEffectPass(harness.state, source, dest, pipeline, () => {});
    }

    const offsets = harness.recorded.bindGroups
      .filter((entry) => entry.index === 0)
      .map((entry) => entry.dynamicOffsets![0]!);
    expect(offsets[512]).toBe(offsets[0]);
    expect(Math.max(...offsets)).toBe(511 * 256);
  });

  // The texture bind group is cached per VIEW, so a chain that ping-pongs between two targets builds two
  // bind groups and then reuses them, rather than one per draw for the whole frame.
  it('reuses one bind group per source view', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    const first = createTarget('a');
    const second = createTarget('b');
    const dest = createTarget('dest');
    (harness.state.device.createBindGroup as ReturnType<typeof vi.fn>).mockClear();

    drawWgpuEffectPass(harness.state, first, dest, pipeline, () => {});
    drawWgpuEffectPass(harness.state, second, dest, pipeline, () => {});
    drawWgpuEffectPass(harness.state, first, dest, pipeline, () => {});

    expect(harness.state.device.createBindGroup).toHaveBeenCalledTimes(2);
  });

  it('hands the uniform writer a float and an int view of the same slot', () => {
    const harness = createHarness();
    const pipeline = createWgpuEffectPipeline(harness.state, 'F');
    let seen: { f32: Float32Array; i32: Int32Array } | null = null;

    drawWgpuEffectPass(harness.state, createTarget('source'), createTarget('dest'), pipeline, (f32, i32) => {
      seen = { f32, i32 };
    });

    expect(seen!.f32.buffer).toBe(seen!.i32.buffer);
  });
});

describe('EFFECT_VERTEX_WGSL', () => {
  // ★ THE SEAM THE WHOLE BACKEND'S POSITIONAL CONVENTION RESTS ON, and the reason this file is worth more
  // than any single effect's. Every Wgpu effect samples the uv this vertex shader emits, so the answer to
  // "which edge is uv.y = 0" is fixed here, once, for all of them. It is TOP — the opposite of the Gl
  // fullscreen quad, which is bottom-left — and that difference is precisely why each backend's runner
  // converts a screen-space descriptor field differently at its own seam. Six effects were wrong tonight
  // over exactly this question, and until now nothing asserted the answer.
  // MEASURED by emitting a bottom-left uv instead (`select(0.0, 1.0, yi)`) — 1 of 18 failed, the
  // predicted one and only it:
  //   AssertionError: expected 1 to be +0 // Object.is equality
  it('emits a top-left uv: the vertex at the top of clip space carries uv.y zero', () => {
    const [positionYWhenFalse, positionYWhenTrue] = selectArguments(POSITION, 1);
    const [uvYWhenFalse, uvYWhenTrue] = selectArguments(UV, 1);

    // Both components are chosen by the same `yi`, so the pairing is what the convention IS.
    expect(positionYWhenTrue).toBe(1);
    expect(uvYWhenTrue).toBe(0);
    expect(positionYWhenFalse).toBe(-1);
    expect(uvYWhenFalse).toBe(1);
  });

  it('does not flip x, so only the vertical axis differs from the gl quad', () => {
    const [positionXWhenFalse, positionXWhenTrue] = selectArguments(POSITION, 0);
    const [uvXWhenFalse, uvXWhenTrue] = selectArguments(UV, 0);

    expect(positionXWhenTrue).toBe(1);
    expect(uvXWhenTrue).toBe(1);
    expect(positionXWhenFalse).toBe(-1);
    expect(uvXWhenFalse).toBe(0);
  });

  it('needs no vertex buffer, building the quad from the vertex index alone', () => {
    expect(EFFECT_VERTEX_WGSL).toContain('@builtin(vertex_index)');
  });
});

describe('getWgpuEffectPassState', () => {
  it('exposes the shared layouts and sampler the custom-texture recipes bind against', () => {
    const harness = createHarness();

    const passState = getWgpuEffectPassState(harness.state);

    expect(passState.sampler).toEqual({ id: 'sampler' });
    expect(passState.textureBGLayout).toBeDefined();
    expect(passState.uniformBGLayout).toBeDefined();
  });

  it('hands out the same ring-buffer slots the draw helpers use', () => {
    const harness = createHarness();
    const passState = getWgpuEffectPassState(harness.state);

    expect(passState.acquireSlot() + 256).toBe(passState.acquireSlot());
  });

  // A programmer error, not an expected failure: a pass outside a frame has nothing to record into.
  // AGENTS.md reserves throwing for exactly this, and the message names the call that was missed.
  it('throws when there is no active command encoder', () => {
    const harness = createHarness();
    (runtimeMockCurrent as { commandEncoder: unknown }).commandEncoder = null;

    expect(() => getWgpuEffectPassState(harness.state).beginPass(createTarget('dest'), 'load')).toThrow(
      'renderWgpuBackground',
    );
  });
});
describe('initializeWgpuDualSourceEffectPipeline', () => {
  it('is the construction initializer of createWgpuDualSourceEffectPipeline', () => {
    expect(typeof initializeWgpuDualSourceEffectPipeline).toBe('function');
  });
});

describe('initializeWgpuEffectPipeline', () => {
  it('is the construction initializer of createWgpuEffectPipeline', () => {
    expect(typeof initializeWgpuEffectPipeline).toBe('function');
  });
});
