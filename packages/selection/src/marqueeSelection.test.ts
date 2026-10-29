// Generated from crates/flight-selection/tests/marquee_selection_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  beginMarqueeSelection,
  createMarqueeSelection,
  endMarqueeSelection,
  getMarqueeRectangle,
  updateMarqueeSelection,
} from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

describe('beginMarqueeSelection', () => {
  it('starts a new zero area rectangle at the pointer location', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10.0, 20.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(10.0, 20.0, 0.0, 0.0));
  });
});

describe('createMarqueeSelection', () => {
  it('creates an inactive marquee with an empty rectangle', () => {
    let marquee = createMarqueeSelection();
    updateMarqueeSelection(marquee, 100.0, 100.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(0.0, 0.0, 0.0, 0.0));
  });
});

describe('endMarqueeSelection', () => {
  it('returns the live rectangle and makes later updates inert', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 1.0, 2.0);
    updateMarqueeSelection(marquee, 3.0, 4.0);
    const returned = endMarqueeSelection(marquee);
    updateMarqueeSelection(marquee, 50.0, 50.0);
    expect(crate.sameRectangle(returned, getMarqueeRectangle(marquee))).toBe(true);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(1.0, 2.0, 2.0, 2.0));
  });
});

describe('findNodesInMarqueeSelection', () => {
  // Rust-only: clears a reused out and keeps its capacity
  it('finds intersecting or fully contained bounds in caller order', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 0.0, 0.0);
    updateMarqueeSelection(marquee, 10.0, 10.0);
    const contained = crate.createBoundedNode('contained', createRectangle(2.0, 2.0, 2.0, 2.0), true, true);
    const overlapping = crate.createBoundedNode('overlapping', createRectangle(8.0, 8.0, 5.0, 5.0), true, true);
    const outside = crate.createBoundedNode('outside', createRectangle(20.0, 20.0, 1.0, 1.0), true, true);
    const candidates = [overlapping, outside, contained];
    expect(crate.sameNodes(crate.marqueeMatches(marquee, candidates, undefined), [overlapping, contained])).toBe(true);
    expect(crate.sameNodes(crate.marqueeMatches(marquee, candidates, crate.containMarqueeMode()), [contained])).toBe(
      true,
    );
  });
  it('uses local bounds without filtering disabled or hidden candidates', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 0.0, 0.0);
    updateMarqueeSelection(marquee, 10.0, 10.0);
    const disabled = crate.createBoundedNode('disabled', createRectangle(1.0, 1.0, 1.0, 1.0), false, true);
    const hidden = crate.createBoundedNode('hidden', createRectangle(2.0, 2.0, 1.0, 1.0), true, false);
    expect(crate.sameNodes(crate.marqueeMatches(marquee, [disabled, hidden], undefined), [disabled, hidden])).toBe(
      true,
    );
  });
});

describe('getMarqueeRectangle', () => {
  it('exposes the same rectangle throughout a gesture', () => {
    let marquee = createMarqueeSelection();
    const original = getMarqueeRectangle(marquee);
    beginMarqueeSelection(marquee, 4.0, 5.0);
    expect(crate.sameRectangle(original, getMarqueeRectangle(marquee))).toBe(true);
  });
});

describe('updateMarqueeSelection', () => {
  it('normalizes a reverse drag into positive rectangle dimensions', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10.0, 20.0);
    updateMarqueeSelection(marquee, 2.0, 5.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(2.0, 5.0, 8.0, 15.0));
  });
});
