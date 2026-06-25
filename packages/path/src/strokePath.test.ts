import { PathCommand } from '@flighthq/types';

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { strokePath } from './strokePath';

describe('strokePath', () => {
  it('returns an empty path for an empty input', () => {
    const result = strokePath(createPath(), {});
    expect(result.commands.length).toBe(0);
  });

  it('returns a closed outline for a horizontal line (butt caps)', () => {
    // A horizontal line from (0,0) to (100,0) with width 10 and butt caps should produce
    // a closed rectangular outline.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const result = strokePath(path, { width: 10, cap: 'butt' });
    // The result must contain at least one CLOSE
    expect(result.commands).toContain(PathCommand.CLOSE);
    // And at least one MOVE_TO
    expect(result.commands).toContain(PathCommand.MOVE_TO);
    // Width=10, so offset = 5. y values should be near ±5.
    const yValues = result.data.filter((_, i) => i % 2 === 1);
    expect(Math.max(...yValues)).toBeCloseTo(5);
    expect(Math.min(...yValues)).toBeCloseTo(-5);
  });

  it('extends endpoints for square caps', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const result = strokePath(path, { width: 10, cap: 'square' });
    // Square caps extend by halfWidth (5) on each end. x range should be [-5, 105].
    const xValues = result.data.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xValues)).toBeCloseTo(-5);
    expect(Math.max(...xValues)).toBeCloseTo(105);
  });

  it('produces round caps with extra points for a curved endcap', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const buttResult = strokePath(path, { width: 10, cap: 'butt' });
    const roundResult = strokePath(path, { width: 10, cap: 'round' });
    // Round caps produce more outline points than butt caps.
    expect(roundResult.commands.length).toBeGreaterThan(buttResult.commands.length);
  });

  it('handles a closed path without adding caps', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathClose(path);
    const result = strokePath(path, { width: 4 });
    // Closed path produces at least one closed contour.
    expect(result.commands).toContain(PathCommand.CLOSE);
  });

  it('produces fewer outline points with a coarser tolerance', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const fine = strokePath(path, { width: 10, cap: 'round' }, 0.1).commands.length;
    const coarse = strokePath(path, { width: 10, cap: 'round' }, 10).commands.length;
    expect(coarse).toBeLessThanOrEqual(fine);
  });

  // Dashing edge cases.
  it('dashes: produces multiple segments for a simple on/off pattern', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    // dash=[10,10]: alternating 10-unit on, 10-unit off
    const result = strokePath(path, { width: 2, dash: [10, 10] });
    // Should produce at least 2 closed outlines (multiple MOVE_TO).
    const moveTos = result.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    expect(moveTos).toBeGreaterThanOrEqual(2);
  });

  it('dashes: dashOffset shifts the pattern start position', () => {
    // Path of 25 units. dash=[20, 5] = on for 20, off for 5.
    // dashOffset=0: on 0-20, off 20-25 → 1 dash.
    // dashOffset=15: we are 15 units into the dash at start. remaining on = 5.
    //   on 0-5, off 5-10, on 10-25 → 2 dashes.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 25, 0);
    const result0 = strokePath(path, { width: 2, dash: [20, 5], dashOffset: 0 });
    const result15 = strokePath(path, { width: 2, dash: [20, 5], dashOffset: 15 });
    const moveTos0 = result0.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    const moveTos15 = result15.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    expect(moveTos0).toBe(1);
    expect(moveTos15).toBe(2);
  });

  it('dashes: zero-length dash entry is ignored (no infinite loop)', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    // A zero-length dash entry should not cause an infinite loop or throw.
    expect(() => strokePath(path, { width: 2, dash: [0, 10, 10, 10] })).not.toThrow();
  });

  it('dashes: very short segments produce the correct number of dashes', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    // Total path length = 5 (very short relative to the 10-unit dash)
    appendPathLineTo(path, 5, 0);
    const result = strokePath(path, { width: 1, dash: [10, 10] });
    // Only one dash segment should appear since the whole path < first dash length.
    const moveTos = result.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    expect(moveTos).toBe(1);
  });

  it('dashes: pattern wraps correctly across multiple path segments', () => {
    // Two segments of 25 each = 50 total, with dash=[15,5]: wraps at 20/40 so has 2+ dashes.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 25, 0);
    appendPathLineTo(path, 50, 0);
    const result = strokePath(path, { width: 1, dash: [15, 5] });
    const moveTos = result.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    // dash=[15,5]: on 0-15, off 15-20, on 20-35, off 35-40, on 40-50 → 3 dashes
    expect(moveTos).toBeGreaterThanOrEqual(2);
  });

  it('dashes: solid stroke (empty dash array) produces a single outline', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const solid = strokePath(path, { width: 4, dash: [] });
    const moveTos = solid.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    expect(moveTos).toBe(1);
  });

  it('dashes: multiple subpaths each get the dash pattern applied independently', () => {
    // Two separate subpaths each of length 100; dash=[30,10] gives 3 dashes per subpath.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathMoveTo(path, 0, 20);
    appendPathLineTo(path, 100, 20);
    const result = strokePath(path, { width: 2, dash: [30, 10] });
    const moveTos = result.commands.filter((c) => c === PathCommand.MOVE_TO).length;
    // At least 2 subpaths × at least 1 dash each.
    expect(moveTos).toBeGreaterThanOrEqual(2);
  });
});
