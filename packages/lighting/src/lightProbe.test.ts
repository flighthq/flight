import { createVector3 } from '@flighthq/geometry/contract';
import type { EntityConstruction, LightProbe, LightProbeGrid } from '@flighthq/types/contract';
import { LIGHT_PROBE_SH_FLOATS } from '@flighthq/types/contract';

import {
  createLightProbe,
  createLightProbeGrid,
  evaluateLightProbeSh,
  initializeLightProbe,
  initializeLightProbeGrid,
  sampleLightProbeGrid,
  setLightProbeShFromColors,
} from './lightProbe';

// The six axis directions. Every SH band above l=0 sums to exactly zero over this set (the odd bands
// cancel between opposite poles; 3z^2-1 sums to -1*4 + 2*2 = 0 and x^2-y^2 to 1+1-1-1 = 0), which is
// what makes the projection round trips below exact rather than approximate.
const AXIS_DIRECTIONS = new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);

// A probe whose first coefficient's red channel is `value` — a scalar tag that survives interpolation,
// so an interpolated result can be read back as a single number.
function taggedProbe(value: number, x = 0, y = 0, z = 0): LightProbe {
  const probe = createLightProbe(createVector3(x, y, z));
  probe.shCoefficients[0] = value;
  return probe;
}

// A 2x2x2 grid over the unit cube whose probes are tagged with their own index, so a sample at a known
// position has a trilinear expectation that can be computed by hand from the eight tags.
function unitCubeGrid() {
  const probes: LightProbe[] = [];
  for (let i = 0; i < 8; i++) probes.push(taggedProbe(i));
  const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
  return createLightProbeGrid(probes, bounds, createVector3(2, 2, 2));
}

function sampleTag(grid: ReturnType<typeof unitCubeGrid>, x: number, y: number, z: number): number {
  const out = new Float32Array(LIGHT_PROBE_SH_FLOATS);
  expect(sampleLightProbeGrid(out, createVector3(x, y, z), grid)).toBe(true);
  return out[0];
}

describe('createLightProbe', () => {
  it('defaults to enabled at the given position with all-zero coefficients', () => {
    const probe = createLightProbe(createVector3(1, 2, 3));
    expect(probe.enabled).toBe(true);
    expect(probe.position.x).toBe(1);
    expect(probe.position.y).toBe(2);
    expect(probe.position.z).toBe(3);
    expect(probe.shCoefficients.length).toBe(LIGHT_PROBE_SH_FLOATS);
    expect(Array.from(probe.shCoefficients).every((v) => v === 0)).toBe(true);
  });

  it('copies the supplied coefficients rather than aliasing the caller buffer', () => {
    const source = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    source[4] = 9;
    const probe = createLightProbe(createVector3(0, 0, 0), source);
    expect(probe.shCoefficients[4]).toBe(9);
    source[4] = 0;
    expect(probe.shCoefficients[4]).toBe(9);
    expect(probe.shCoefficients).not.toBe(source);
  });

  it('copies the position rather than aliasing the caller vector', () => {
    const position = createVector3(1, 2, 3);
    const probe = createLightProbe(position);
    position.x = 99;
    expect(probe.position.x).toBe(1);
  });

  it('throws on a wrong-length coefficient buffer', () => {
    expect(() => createLightProbe(createVector3(0, 0, 0), new Float32Array(9))).toThrow();
  });
});

describe('createLightProbeGrid', () => {
  it('stores bounds, resolution, and probes, enabled by default', () => {
    const grid = unitCubeGrid();
    expect(grid.enabled).toBe(true);
    expect(grid.probes.length).toBe(8);
    expect(grid.resolution.x).toBe(2);
    expect(grid.bounds.max.z).toBe(1);
  });

  it('throws when the probe count does not match the resolution product', () => {
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    expect(() => createLightProbeGrid([taggedProbe(0)], bounds, createVector3(2, 2, 2))).toThrow();
  });

  it('accepts an empty grid at zero resolution', () => {
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    expect(createLightProbeGrid([], bounds, createVector3(0, 0, 0)).probes.length).toBe(0);
  });
});

describe('evaluateLightProbeSh', () => {
  it('scales the l=0 coefficient by its constant basis, independent of the normal', () => {
    const sh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    sh[0] = 1;
    sh[1] = 2;
    sh[2] = 4;
    const out = new Float32Array(3);
    evaluateLightProbeSh(out, createVector3(1, 0, 0), sh);
    expect(out[0]).toBeCloseTo(0.2820948, 6);
    expect(out[1]).toBeCloseTo(0.5641896, 6);
    expect(out[2]).toBeCloseTo(1.1283792, 6);

    const other = new Float32Array(3);
    evaluateLightProbeSh(other, createVector3(0, 0, 1), sh);
    expect(other[0]).toBeCloseTo(out[0], 6);
  });

  it('flips sign with the normal on the l=1 bands, which is what makes them directional', () => {
    const sh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    sh[9] = 1; // the l=1, m=1 coefficient is index 3 of 9, so float offset 9 — the x lobe.
    const positive = new Float32Array(3);
    const negative = new Float32Array(3);
    evaluateLightProbeSh(positive, createVector3(1, 0, 0), sh);
    evaluateLightProbeSh(negative, createVector3(-1, 0, 0), sh);
    expect(positive[0]).toBeCloseTo(0.4886025, 6);
    expect(negative[0]).toBeCloseTo(-0.4886025, 6);
    // The y and z lobes are orthogonal to an x normal.
    expect(positive[1]).toBe(0);
  });

  it('normalizes the normal, so magnitude does not change the result', () => {
    const sh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    sh[9] = 1;
    const unit = new Float32Array(3);
    const long = new Float32Array(3);
    evaluateLightProbeSh(unit, createVector3(1, 0, 0), sh);
    evaluateLightProbeSh(long, createVector3(50, 0, 0), sh);
    expect(long[0]).toBeCloseTo(unit[0], 6);
  });

  it('writes zeros for a zero-length normal instead of dividing by zero', () => {
    const sh = new Float32Array(LIGHT_PROBE_SH_FLOATS).fill(1);
    const out = new Float32Array(3).fill(7);
    evaluateLightProbeSh(out, createVector3(0, 0, 0), sh);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });

  it('is alias-safe when out is the coefficient buffer itself', () => {
    const sh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    sh[0] = 1;
    sh[1] = 2;
    sh[2] = 4;
    evaluateLightProbeSh(sh, createVector3(1, 0, 0), sh);
    expect(sh[0]).toBeCloseTo(0.2820948, 6);
    expect(sh[1]).toBeCloseTo(0.5641896, 6);
    expect(sh[2]).toBeCloseTo(1.1283792, 6);
  });
});

describe('initializeLightProbe', () => {
  it('fills a construction object with the same defaults createLightProbe produces', () => {
    const out = {} as EntityConstruction<LightProbe>;
    initializeLightProbe(out, createVector3(4, 5, 6));
    expect(out.enabled).toBe(true);
    expect(out.position.y).toBe(5);
    expect(out.shCoefficients.length).toBe(LIGHT_PROBE_SH_FLOATS);
  });

  it('rejects a wrong-length coefficient buffer at the construction seam', () => {
    const out = {} as EntityConstruction<LightProbe>;
    expect(() => initializeLightProbe(out, createVector3(0, 0, 0), new Float32Array(26))).toThrow(
      /must be 27 floats, got 26/,
    );
  });
});

describe('initializeLightProbeGrid', () => {
  it('fills a construction object with copied bounds and resolution', () => {
    const out = {} as EntityConstruction<LightProbeGrid>;
    const bounds = { max: createVector3(2, 2, 2), min: createVector3(0, 0, 0) };
    initializeLightProbeGrid(out, [taggedProbe(1), taggedProbe(2)], bounds, createVector3(2, 1, 1));
    expect(out.enabled).toBe(true);
    expect(out.probes.length).toBe(2);
    bounds.max.x = 99;
    expect(out.bounds.max.x).toBe(2);
  });

  it('names both the expected and actual probe count when they disagree', () => {
    const out = {} as EntityConstruction<LightProbeGrid>;
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    expect(() => initializeLightProbeGrid(out, [taggedProbe(1)], bounds, createVector3(2, 2, 2))).toThrow(
      /must hold 8 probes for resolution 2x2x2, got 1/,
    );
  });
});

describe('sampleLightProbeGrid', () => {
  it('returns each corner probe exactly at that corner', () => {
    const grid = unitCubeGrid();
    expect(sampleTag(grid, 0, 0, 0)).toBeCloseTo(0, 5);
    expect(sampleTag(grid, 1, 0, 0)).toBeCloseTo(1, 5);
    expect(sampleTag(grid, 0, 1, 0)).toBeCloseTo(2, 5);
    expect(sampleTag(grid, 0, 0, 1)).toBeCloseTo(4, 5);
    expect(sampleTag(grid, 1, 1, 1)).toBeCloseTo(7, 5);
  });

  it('averages all eight probes at the centre', () => {
    // (0 + 1 + ... + 7) / 8 = 3.5
    expect(sampleTag(unitCubeGrid(), 0.5, 0.5, 0.5)).toBeCloseTo(3.5, 5);
  });

  it('blends only the two probes along an edge', () => {
    const grid = unitCubeGrid();
    // Midway along the x edge at y=z=0 sits between tags 0 and 1.
    expect(sampleTag(grid, 0.5, 0, 0)).toBeCloseTo(0.5, 5);
    // Three quarters along the same edge weights tag 1 by 0.75.
    expect(sampleTag(grid, 0.75, 0, 0)).toBeCloseTo(0.75, 5);
    // Midway along the z edge sits between tags 0 and 4.
    expect(sampleTag(grid, 0, 0, 0.5)).toBeCloseTo(2, 5);
  });

  it('clamps a position outside the bounds to the boundary rather than missing', () => {
    const grid = unitCubeGrid();
    expect(sampleTag(grid, -50, -50, -50)).toBeCloseTo(0, 5);
    expect(sampleTag(grid, 50, 50, 50)).toBeCloseTo(7, 5);
    // Clamping is per axis: only x is outside here, so y and z still interpolate.
    expect(sampleTag(grid, 50, 0.5, 0)).toBeCloseTo(2, 5);
  });

  it('treats an axis of resolution 1 as uniform instead of double-weighting its probe', () => {
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    const grid = createLightProbeGrid([taggedProbe(10), taggedProbe(20)], bounds, createVector3(2, 1, 1));
    const out = new Float32Array(LIGHT_PROBE_SH_FLOATS);
    expect(sampleLightProbeGrid(out, createVector3(0.5, 0.5, 0.5), grid)).toBe(true);
    expect(out[0]).toBeCloseTo(15, 5);
  });

  it('drops a disabled probe and renormalizes, so switching one off does not dim its neighbours', () => {
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    const probes = [taggedProbe(10), taggedProbe(20)];
    const grid = createLightProbeGrid(probes, bounds, createVector3(2, 1, 1));
    const out = new Float32Array(LIGHT_PROBE_SH_FLOATS);

    expect(sampleLightProbeGrid(out, createVector3(0.5, 0, 0), grid)).toBe(true);
    expect(out[0]).toBeCloseTo(15, 5);

    probes[1].enabled = false;
    expect(sampleLightProbeGrid(out, createVector3(0.5, 0, 0), grid)).toBe(true);
    // Renormalized, not weighted-to-black: the surviving probe's value comes back undimmed.
    expect(out[0]).toBeCloseTo(10, 5);
  });

  it('returns false and leaves out untouched when disabled, empty, or fully disabled', () => {
    const bounds = { max: createVector3(1, 1, 1), min: createVector3(0, 0, 0) };
    const out = new Float32Array(LIGHT_PROBE_SH_FLOATS).fill(-1);

    const disabled = unitCubeGrid();
    disabled.enabled = false;
    expect(sampleLightProbeGrid(out, createVector3(0, 0, 0), disabled)).toBe(false);

    const empty = createLightProbeGrid([], bounds, createVector3(0, 0, 0));
    expect(sampleLightProbeGrid(out, createVector3(0, 0, 0), empty)).toBe(false);

    const allOff = unitCubeGrid();
    for (const probe of allOff.probes) probe.enabled = false;
    expect(sampleLightProbeGrid(out, createVector3(0.5, 0.5, 0.5), allOff)).toBe(false);

    expect(out[0]).toBe(-1);
  });

  it('is alias-safe when out is a probe coefficient buffer inside the grid', () => {
    // Aliasing the LAST corner is what actually exercises this. An implementation that wrote into
    // `out` while accumulating would clobber that probe before its own turn to be read, and fold the
    // running partial sum back in as if it were the probe's value. Aliasing the first corner cannot
    // catch that: its contribution is already banked before any write lands on it.
    const last = unitCubeGrid();
    expect(sampleLightProbeGrid(last.probes[7].shCoefficients, createVector3(0.5, 0.5, 0.5), last)).toBe(true);
    expect(last.probes[7].shCoefficients[0]).toBeCloseTo(3.5, 5);

    const first = unitCubeGrid();
    expect(sampleLightProbeGrid(first.probes[0].shCoefficients, createVector3(0.5, 0.5, 0.5), first)).toBe(true);
    expect(first.probes[0].shCoefficients[0]).toBeCloseTo(3.5, 5);
  });
});

describe('setLightProbeShFromColors', () => {
  it('round-trips a constant color through projection and evaluation', () => {
    // Over the six axis directions every band above l=0 cancels exactly, so reconstruction returns
    // the input color at ANY normal.
    const colors = new Float32Array(18);
    for (let i = 0; i < 6; i++) {
      colors[i * 3] = 2;
      colors[i * 3 + 1] = 3;
      colors[i * 3 + 2] = 4;
    }
    const probe = createLightProbe(createVector3(0, 0, 0));
    setLightProbeShFromColors(probe, colors, AXIS_DIRECTIONS);

    for (const normal of [createVector3(1, 0, 0), createVector3(0, 1, 0), createVector3(0, 0, -1)]) {
      const out = new Float32Array(3);
      evaluateLightProbeSh(out, normal, probe.shCoefficients);
      expect(out[0]).toBeCloseTo(2, 5);
      expect(out[1]).toBeCloseTo(3, 5);
      expect(out[2]).toBeCloseTo(4, 5);
    }
  });

  it('round-trips a linear gradient to its exact value on each axis', () => {
    // color(d) = 1 + 0.5 * (d . x). Projected over the six axes this leaves only the l=0 term (1) and
    // the l=1 x term, whose reconstruction at +x contributes exactly 0.5 — every l=2 term cancels.
    const colors = new Float32Array([1.5, 1.5, 1.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const probe = createLightProbe(createVector3(0, 0, 0));
    setLightProbeShFromColors(probe, colors, AXIS_DIRECTIONS);

    const out = new Float32Array(3);
    evaluateLightProbeSh(out, createVector3(1, 0, 0), probe.shCoefficients);
    expect(out[0]).toBeCloseTo(1.5, 5);
    evaluateLightProbeSh(out, createVector3(-1, 0, 0), probe.shCoefficients);
    expect(out[0]).toBeCloseTo(0.5, 5);
    // The gradient runs along x only, so a y normal sees the mean.
    evaluateLightProbeSh(out, createVector3(0, 1, 0), probe.shCoefficients);
    expect(out[0]).toBeCloseTo(1, 5);
  });

  it('replaces prior coefficients rather than accumulating into them', () => {
    const colors = new Float32Array(18).fill(1);
    const probe = createLightProbe(createVector3(0, 0, 0));
    setLightProbeShFromColors(probe, colors, AXIS_DIRECTIONS);
    const first = probe.shCoefficients[0];
    setLightProbeShFromColors(probe, colors, AXIS_DIRECTIONS);
    expect(probe.shCoefficients[0]).toBeCloseTo(first, 5);
  });

  it('zeroes the coefficients when given no samples', () => {
    const probe = createLightProbe(createVector3(0, 0, 0));
    probe.shCoefficients.fill(5);
    setLightProbeShFromColors(probe, new Float32Array(0), new Float32Array(0));
    expect(Array.from(probe.shCoefficients).every((v) => v === 0)).toBe(true);
  });

  it('skips a zero-length direction instead of producing NaN', () => {
    const colors = new Float32Array([1, 1, 1, 1, 1, 1]);
    const directions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const probe = createLightProbe(createVector3(0, 0, 0));
    setLightProbeShFromColors(probe, colors, directions);
    expect(Array.from(probe.shCoefficients).every((v) => Number.isFinite(v))).toBe(true);
    expect(probe.shCoefficients[0]).not.toBe(0);
  });
});
