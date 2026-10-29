// Generated from crates/flight-path-boolean/src/martinez_kernel.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

/**
 * The boolean set operation to perform on two path operands.
 */
export type PathBooleanOperation = 'difference' | 'intersection' | 'union' | 'xor';

/**
 * Fill rule for resolving winding numbers into filled/unfilled regions. Extends
 * PathWinding with positive and negative rules used internally by the offset
 * cleanup pass.
 */
export type PathBooleanFillRule = 'evenOdd' | 'nonZero' | 'positive' | 'negative';

/**
 * A flat array of interleaved `[x, y, x, y, ...]` coordinates representing one
 * polygon contour for boolean operations.
 */
export type PathBooleanContour = number[];

/**
 * The strategy a `PathBooleanKernel` carries (TS `computePathBoolean`): the combined contour set of
 * two operands under an operation and fill rule. A stateless function value (D9d).
 */
export type ComputePathBooleanFunction = (
  arg0: Readonly<PathBooleanContour[]>,
  arg1: Readonly<PathBooleanContour[]>,
  arg2: PathBooleanOperation,
  arg3: PathBooleanFillRule,
) => PathBooleanContour[];

/**
 * The boolean kernel (TS `PathBooleanKernel extends Entity`): a strategy entity whose
 * `computePathBoolean` computes the combined contour set of two operands. Callers may supply any
 * kernel; the Martinez kernel is the stock one.
 */
export interface PathBooleanKernelRaw extends EntityRaw {
  computePathBoolean: ComputePathBooleanFunction;
}

/**
 * One endpoint of a segment during the sweep. The two endpoints of an edge
 * cross-link via `otherEvent` (an arena index). `windingDelta` is only
 * meaningful on the left endpoint and records the source ring's traversal
 * direction across this edge.
 */
interface SweepEvent {
  x: number;
  y: number;
  left: boolean;
  otherEvent?: number;
  isSubject: boolean;
  id: number;
  windingDelta: number;
}

/**
 * A final, fully-subdivided edge from the sweep.
 */
interface ArrangementSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  isSubject: boolean;
  windingDelta: number;
}

/**
 * A geometrically-unique segment after coincident sub-segments are merged.
 */
interface UniqueSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  subjectDelta: number;
  clipDelta: number;
}

/**
 * Binary min-heap over sweep event arena indices ordered by compare_events.
 */
interface EventHeap {
  data: number[];
  length: number;
}

/**
 * Directed graph of kept boundary edges for ring tracing.
 */
interface DirectedGraph {
  xs: number[];
  ys: number[];
  outgoing: number[][];
  edgeTo: number[];
  edgeFrom: number[];
  used: boolean[];
}

/**
 * Relative factor for the vertex-merge grid: two vertices collapse to one when
 * they fall in the same cell of a grid this fraction of the input's coordinate
 * extent.
 */
const VERTEX_SNAP_RELATIVE: number = 1e-9;

/**
 * Fallback absolute snap for degenerate all-coincident input where the extent is
 * zero.
 */
const VERTEX_SNAP_FALLBACK: number = 1e-9;

/**
 * Relative tolerance for the intersection orientation tests, scaled by squared
 * edge lengths in each comparison.
 */
const INTERSECTION_EPS: number = 1e-12;

/**
 * The kernel the boolean operations use unless the caller passes another one. A stateless value, so
 * it is one shared instance rather than a per-call construction (TS `martinezPathBooleanKernel`;
 * entity-valued singleton as `LazyLock`, D12).
 */
export const martinezPathBooleanKernel: PathBooleanKernelRaw = createMartinezPathBooleanKernel();

function createEvent(events: SweepEvent[], x: number, y: number, isSubject: boolean): number {
  const id = events.length;
  events.push({ x: x, y: y, left: false, otherEvent: undefined, isSubject: isSubject, id: id, windingDelta: 0 });
  return id;
}

export function createMartinezPathBooleanKernel(): PathBooleanKernelRaw {
  let out: PathBooleanKernelRaw = allocateEntity<PathBooleanKernelRaw>();
  initializeMartinezPathBooleanKernel(out);
  return out;
}

export function getPathBooleanFillRuleString(value: PathBooleanFillRule): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'evenOdd':
        return 'evenOdd';
      case 'nonZero':
        return 'nonZero';
      case 'negative':
        return 'negative';
      case 'positive':
        return 'positive';
    }
  })();
}

function addEdge(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  isSubject: boolean,
  events: SweepEvent[],
  heap: EventHeap,
): void {
  const a = createEvent(events, ax, ay, isSubject);
  const b = createEvent(events, bx, by, isSubject);
  events[a].otherEvent = b;
  events[b].otherEvent = a;
  if (pointOrder(ax, ay, bx, by) < 0) {
    events[a].left = true;
    events[a].windingDelta = 1;
  } else {
    events[b].left = true;
    events[b].windingDelta = -1;
  }
  eventHeapPush(heap, events, a);
  eventHeapPush(heap, events, b);
}

function approxEqual(a: number, b: number, vertexSnap: number): boolean {
  return Math.abs(a - b) <= vertexSnap;
}

function buildArrangement(
  subject: Readonly<number[][]>,
  clip: Readonly<number[][]>,
  vertexSnap: number,
): ArrangementSegment[] {
  let events: SweepEvent[] = [] as never[];
  let heap = { data: [], length: 0 };
  fillQueue(subject, true, events, heap, vertexSnap);
  fillQueue(clip, false, events, heap, vertexSnap);
  let status: number[] = [] as never[];
  let segments: ArrangementSegment[] = [] as never[];
  while (!eventHeapIsEmpty(heap)) {
    const event = eventHeapPop(heap, events);
    if (events[event].left) {
      const index = insertStatus(status, events, event);
      const prev = index > 0 ? status[index - 1] : undefined;
      const next = index < status.length - 1 ? status[index + 1] : undefined;
      if (next !== undefined) {
        const nextEv = next;
        possibleIntersection(events, heap, vertexSnap, event, nextEv);
      }
      if (prev !== undefined) {
        const prevEv = prev;
        possibleIntersection(events, heap, vertexSnap, prevEv, event);
      }
    } else {
      const leftEvent = getOtherEvent(events, event);
      const index = findStatus(status, leftEvent);
      if (index >= 0) {
        const idx = index >>> 0;
        const hasNeighbors = idx > 0 && idx + 1 < status.length;
        const prevEv = idx > 0 ? status[idx - 1] : 0;
        const nextEv = idx + 1 < status.length ? status[idx + 1] : 0;
        let kept: number[] = [...status.slice(0, idx)];
        {
          const source = status.slice(idx + 1, status.length);
          for (let index = 0, count = source.length; index < count; index++) {
            kept.push(source[index]);
          }
        }
        status = kept;
        if (hasNeighbors) {
          possibleIntersection(events, heap, vertexSnap, prevEv, nextEv);
        }
      }
      recordSegment(events, leftEvent, event, segments, vertexSnap);
    }
  }
  return segments;
}

function classifySegments(
  unique: Readonly<UniqueSegment[]>,
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule,
): Float64Array[] {
  let kept: Float64Array[] = [] as never[];
  for (const seg of unique) {
    const mx = (seg.ax + seg.bx) / 2.0;
    const my = (seg.ay + seg.by) / 2.0;
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0.0) {
      continue;
    }
    const eps = len * 1e-4;
    const nlx = (-dy / len) * eps;
    const nly = (dx / len) * eps;
    const leftInSubject = isInside(windingAt(unique, mx + nlx, my + nly, true), fillRule);
    const leftInClip = isInside(windingAt(unique, mx + nlx, my + nly, false), fillRule);
    const rightInSubject = isInside(windingAt(unique, mx - nlx, my - nly, true), fillRule);
    const rightInClip = isInside(windingAt(unique, mx - nlx, my - nly, false), fillRule);
    const filledLeft = combine(operation, leftInSubject, leftInClip);
    const filledRight = combine(operation, rightInSubject, rightInClip);
    if (filledLeft === filledRight) {
      continue;
    }
    if (filledLeft) {
      kept.push(new Float64Array([seg.ax, seg.ay, seg.bx, seg.by]));
    } else {
      kept.push(new Float64Array([seg.bx, seg.by, seg.ax, seg.ay]));
    }
  }
  return kept;
}

function combine(operation: PathBooleanOperation, inSubject: boolean, inClip: boolean): boolean {
  return (() => {
    const matchValue = operation;
    switch (matchValue) {
      case 'union':
        return inSubject || inClip;
      case 'intersection':
        return inSubject && inClip;
      case 'difference':
        return inSubject && !inClip;
      case 'xor':
        return inSubject !== inClip;
    }
  })();
}

/**
 * Priority order of two events.
 */
function compareEvents(events: Readonly<SweepEvent[]>, e1: number, e2: number): number {
  if (events[e1].x !== events[e2].x) {
    return events[e1].x < events[e2].x ? -1 : 1;
  }
  if (events[e1].y !== events[e2].y) {
    return events[e1].y < events[e2].y ? -1 : 1;
  }
  if (e1 === e2) {
    return 0;
  }
  if (events[e1].left !== events[e2].left) {
    return events[e1].left ? 1 : -1;
  }
  const e1Other = getOtherEvent(events, e1);
  const e2Other = getOtherEvent(events, e2);
  const area = signedArea(
    events[e1].x,
    events[e1].y,
    events[e1Other].x,
    events[e1Other].y,
    events[e2Other].x,
    events[e2Other].y,
  );
  if (area !== 0.0) {
    return isBelow(events, e1, events[e2Other].x, events[e2Other].y) ? -1 : 1;
  }
  if (events[e1].isSubject !== events[e2].isSubject) {
    return events[e1].isSubject ? -1 : 1;
  }
  return events[e1].id < events[e2].id ? -1 : 1;
}

/**
 * Orders two active segments by vertical position at the sweep (Martinez segment
 * comparator).
 */
function compareSegments(events: Readonly<SweepEvent[]>, le1: number, le2: number): number {
  if (le1 === le2) {
    return 0;
  }
  const a1x = events[le1].x;
  const a1y = events[le1].y;
  const le2Other = getOtherEvent(events, le2);
  const le1Other = getOtherEvent(events, le1);
  const a2x = events[le1Other].x;
  const a2y = events[le1Other].y;
  const s1 = signedArea(a1x, a1y, a2x, a2y, events[le2].x, events[le2].y);
  const s2 = signedArea(a1x, a1y, a2x, a2y, events[le2Other].x, events[le2Other].y);
  if (s1 !== 0.0 || s2 !== 0.0) {
    if (a1x === events[le2].x && a1y === events[le2].y) {
      return isBelow(events, le1, events[le2Other].x, events[le2Other].y) ? -1 : 1;
    }
    if (a1x === events[le2].x) {
      return a1y < events[le2].y ? -1 : 1;
    }
    if (compareEvents(events, le1, le2) === 1) {
      return isBelow(events, le2, a1x, a1y) ? 1 : -1;
    }
    return isBelow(events, le1, events[le2].x, events[le2].y) ? -1 : 1;
  }
  if (events[le1].isSubject !== events[le2].isSubject) {
    return events[le1].isSubject ? -1 : 1;
  }
  if (a1x === events[le2].x && a1y === events[le2].y) {
    return events[le1].id < events[le2].id ? -1 : 1;
  }
  return compareEvents(events, le1, le2) === 1 ? 1 : -1;
}

function compareSnappedKeys(keys: Readonly<number[]>, stride: number, a: number, b: number): number {
  for (let offset = 0; offset < stride; offset += 1) {
    const left = keys[a * stride + offset];
    const right = keys[b * stride + offset];
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeMartinezBoolean(
  subject: Readonly<number[][]>,
  clip: Readonly<number[][]>,
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule,
): number[][] {
  const vertexSnap = computeVertexSnap(subject, clip);
  const segments = buildArrangement(subject, clip, vertexSnap);
  if (segments.length === 0) {
    return [] as never[];
  }
  const unique = mergeCoincidentSegments(segments, vertexSnap);
  const kept = classifySegments(unique, operation, fillRule);
  if (kept.length === 0) {
    return [] as never[];
  }
  return traceRings(kept, vertexSnap);
}

function computeVertexSnap(subject: Readonly<number[][]>, clip: Readonly<number[][]>): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const contours of [subject, clip]) {
    for (const contour of contours) {
      let i = 0;
      while (i < contour.length) {
        const x = contour[i];
        const y = contour[i + 1];
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
        i += 2;
      }
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  return extent > 0.0 ? extent * VERTEX_SNAP_RELATIVE : VERTEX_SNAP_FALLBACK;
}

/**
 * `from` and `to` are snapped-vertex ids in first-occurrence order (see `firstOccurrenceIds`).
 */
function directedGraphAddEdge(graph: DirectedGraph, from: number, to: number, edge: Readonly<Float64Array>): void {
  from = directedGraphVertex(graph, from, edge[0], edge[1]);
  to = directedGraphVertex(graph, to, edge[2], edge[3]);
  if (from === to) {
    return;
  }
  const edgeIndex = graph.edgeFrom.length;
  graph.edgeFrom.push(from);
  graph.edgeTo.push(to);
  graph.used.push(false);
  graph.outgoing[from].push(edgeIndex);
}

function directedGraphNew(): DirectedGraph {
  return { xs: [], ys: [], outgoing: [], edgeTo: [], edgeFrom: [], used: [] };
}

/**
 * At vertex `at`, arriving from `cameFrom`, pick the unused outgoing edge that
 * turns most clockwise from the reversed incoming direction.
 */
function directedGraphNextEdge(graph: Readonly<DirectedGraph>, at: number, cameFrom: number): number {
  const incomingAngle = Math.atan2(graph.ys[cameFrom] - graph.ys[at], graph.xs[cameFrom] - graph.xs[at]);
  let best: number = -1;
  let bestGap: number = Number.POSITIVE_INFINITY;
  const twoPi = Math.PI * 2.0;
  for (const edge of graph.outgoing[at]) {
    if (graph.used[edge]) {
      continue;
    }
    const to = graph.edgeTo[edge];
    const angle = Math.atan2(graph.ys[to] - graph.ys[at], graph.xs[to] - graph.xs[at]);
    let gap = incomingAngle - angle;
    while (gap <= 0.0) {
      gap += twoPi;
    }
    while (gap > twoPi) {
      gap -= twoPi;
    }
    if (gap < bestGap) {
      bestGap = gap;
      best = edge | 0;
    }
  }
  return best;
}

function directedGraphTraceRings(graph: DirectedGraph): number[][] {
  let rings: number[][] = [] as never[];
  for (let start = 0; start < graph.edgeFrom.length; start += 1) {
    if (graph.used[start]) {
      continue;
    }
    const ring = directedGraphWalk(graph, start);
    if (ring !== undefined) {
      const r = ring;
      if (r.length >= 6) {
        rings.push(r);
      }
    }
  }
  return rings;
}

function directedGraphVertex(graph: DirectedGraph, id: number, x: number, y: number): number {
  if (id === graph.xs.length) {
    graph.xs.push(x);
    graph.ys.push(y);
    graph.outgoing.push([] as never[]);
  }
  return id;
}

function directedGraphWalk(graph: DirectedGraph, startEdge: number): number[] | undefined {
  let ring: number[] = [] as never[];
  let edge = startEdge;
  let guard: number = 0;
  const limit = graph.edgeFrom.length + 2;
  while (guard < limit) {
    guard += 1;
    graph.used[edge] = true;
    const from = graph.edgeFrom[edge];
    ring.push(graph.xs[from]);
    ring.push(graph.ys[from]);
    const to = graph.edgeTo[edge];
    const next = directedGraphNextEdge(graph, to, from);
    if (next < 0 || next >>> 0 === startEdge || graph.used[next >>> 0]) {
      break;
    }
    edge = next >>> 0;
  }
  return ring;
}

function divideIfInterior(
  events: SweepEvent[],
  heap: EventHeap,
  vertexSnap: number,
  le: number,
  x: number,
  y: number,
): void {
  const other = getOtherEvent(events, le);
  const leX = events[le].x;
  const leY = events[le].y;
  const otherX = events[other].x;
  const otherY = events[other].y;
  if (pointStrictlyInside(leX, leY, otherX, otherY, x, y, vertexSnap)) {
    divideSegment(events, heap, le, x, y);
  }
}

/**
 * Splits `le` at interior point (x, y).
 */
function divideSegment(events: SweepEvent[], heap: EventHeap, le: number, x: number, y: number): void {
  const isSubject = events[le].isSubject;
  const windingDelta = events[le].windingDelta;
  const right = getOtherEvent(events, le);
  const newRight = createEvent(events, x, y, isSubject);
  const newLeft = createEvent(events, x, y, isSubject);
  events[newRight].left = false;
  events[newRight].otherEvent = le;
  events[newLeft].left = true;
  events[newLeft].otherEvent = right;
  events[newLeft].windingDelta = windingDelta;
  events[le].otherEvent = newRight;
  events[right].otherEvent = newLeft;
  eventHeapPush(heap, events, newLeft);
  eventHeapPush(heap, events, newRight);
}

function eventHeapIsEmpty(heap: Readonly<EventHeap>): boolean {
  return heap.length === 0;
}

function eventHeapPop(heap: EventHeap, events: Readonly<SweepEvent[]>): number {
  const top = heap.data[0];
  heap.length -= 1;
  const last = heap.data[heap.length];
  if (heap.length > 0) {
    heap.data[0] = last;
    let i: number = 0;
    const n = heap.length;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && compareEvents(events, heap.data[left], heap.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && compareEvents(events, heap.data[right], heap.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === i) {
        break;
      }
      [heap.data[i], heap.data[smallest]] = [heap.data[smallest], heap.data[i]];
      i = smallest;
    }
  }
  return top;
}

function eventHeapPush(heap: EventHeap, events: Readonly<SweepEvent[]>, event: number): void {
  if (heap.length < heap.data.length) {
    heap.data[heap.length] = event;
  } else {
    heap.data.push(event);
  }
  heap.length += 1;
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (compareEvents(events, heap.data[i], heap.data[parent]) < 0) {
      [heap.data[i], heap.data[parent]] = [heap.data[parent], heap.data[i]];
      i = parent;
    } else {
      break;
    }
  }
}

/**
 * Appends every edge of every contour as a left/right event pair.
 */
function fillQueue(
  contours: Readonly<number[][]>,
  isSubject: boolean,
  events: SweepEvent[],
  heap: EventHeap,
  vertexSnap: number,
): void {
  for (const contour of contours) {
    let count = contour.length >> 1;
    if (count < 2) {
      continue;
    }
    if (
      approxEqual(contour[0], contour[(count - 1) * 2], vertexSnap) &&
      approxEqual(contour[1], contour[(count - 1) * 2 + 1], vertexSnap)
    ) {
      count -= 1;
    }
    if (count < 3) {
      continue;
    }
    for (let i = 0; i < count; i += 1) {
      const ax = contour[i * 2];
      const ay = contour[i * 2 + 1];
      const j = (i + 1) % count;
      const bx = contour[j * 2];
      const by = contour[j * 2 + 1];
      if (approxEqual(ax, bx, vertexSnap) && approxEqual(ay, by, vertexSnap)) {
        continue;
      }
      addEdge(ax, ay, bx, by, isSubject, events, heap);
    }
  }
}

function findStatus(status: Readonly<number[]>, event: number): number {
  for (let i = 0; i < status.length; i += 1) {
    if (status[i] === event) {
      return i | 0;
    }
  }
  return -1;
}

function firstOccurrenceIds(keys: Readonly<number[]>, stride: number): number[] {
  const count = Math.trunc(keys.length / stride);
  let order: number[] = [] as never[];
  for (let position = 0; position < count; position += 1) {
    order.push(position);
  }
  order.sort((a, b) => compareSnappedKeys(keys, stride, a, b));
  let first: number[] = new Array(count).fill(0);
  let groupStart = 0;
  for (let rank = 0; rank < count; rank += 1) {
    if (!snappedKeysEqual(keys, stride, order[groupStart], order[rank])) {
      groupStart = rank;
    }
    first[order[rank]] = order[groupStart];
  }
  let ids: number[] = new Array(count).fill(0);
  let next = 0;
  for (let position = 0; position < count; position += 1) {
    if (first[position] === position) {
      ids[position] = next;
      next += 1;
    } else {
      ids[position] = ids[first[position]];
    }
  }
  return ids;
}

function getOtherEvent(events: Readonly<SweepEvent[]>, event: number): number {
  return (() => {
    const matchValue = events[event].otherEvent;
    if (matchValue !== undefined) {
      const other = matchValue;
      return other;
    } else {
      return (() => {
        throw new Error('Sweep event entered the Martinez queue before its endpoint pair was linked');
      })();
    }
  })();
}

export function getPathBooleanOperationString(value: PathBooleanOperation): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'difference':
        return 'difference';
      case 'intersection':
        return 'intersection';
      case 'union':
        return 'union';
      case 'xor':
        return 'xor';
    }
  })();
}

/**
 * The construction initializer of `createMartinezPathBooleanKernel`.
 */
export function initializeMartinezPathBooleanKernel(out: PathBooleanKernelRaw): void {
  out.computePathBoolean = computeMartinezBoolean;
}

function insertStatus(status: number[], events: Readonly<SweepEvent[]>, event: number): number {
  let lo: number = 0;
  let hi: number = status.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareSegments(events, status[mid], event) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  status.push(event);
  let shift = status.length - 1;
  while (shift > lo) {
    status[shift] = status[shift - 1];
    shift -= 1;
  }
  status[lo] = event;
  return lo;
}

/**
 * True when segment `le` passes strictly below point (x, y).
 */
function isBelow(events: Readonly<SweepEvent[]>, le: number, x: number, y: number): boolean {
  const other = getOtherEvent(events, le);
  return events[le].left
    ? signedArea(events[le].x, events[le].y, events[other].x, events[other].y, x, y) > 0.0
    : signedArea(events[other].x, events[other].y, events[le].x, events[le].y, x, y) > 0.0;
}

function isInside(winding: number, fillRule: PathBooleanFillRule): boolean {
  return (() => {
    const matchValue = fillRule;
    switch (matchValue) {
      case 'evenOdd':
        return (Math.abs(winding) & 1) === 1;
      case 'positive':
        return winding > 0;
      case 'negative':
        return winding < 0;
      case 'nonZero':
        return winding !== 0;
    }
  })();
}

function mergeCoincidentSegments(segments: Readonly<ArrangementSegment[]>, vertexSnap: number): UniqueSegment[] {
  let oriented: number[] = [] as never[];
  let keys: number[] = [] as never[];
  for (const seg of segments) {
    let ax = seg.ax;
    let ay = seg.ay;
    let bx = seg.bx;
    let by = seg.by;
    if (pointOrder(ax, ay, bx, by) > 0) {
      ax = seg.bx;
      ay = seg.by;
      bx = seg.ax;
      by = seg.ay;
    }
    oriented.push(ax);
    oriented.push(ay);
    oriented.push(bx);
    oriented.push(by);
    keys.push(snap(ax, vertexSnap));
    keys.push(snap(ay, vertexSnap));
    keys.push(snap(bx, vertexSnap));
    keys.push(snap(by, vertexSnap));
  }
  const ids = firstOccurrenceIds(keys, 4);
  let unique: UniqueSegment[] = [] as never[];
  for (let index = 0; index < segments.length; index += 1) {
    const seg = segments[index];
    const idx = ids[index];
    if (idx < unique.length) {
      if (seg.isSubject) {
        unique[idx].subjectDelta += seg.windingDelta;
      } else {
        unique[idx].clipDelta += seg.windingDelta;
      }
    } else {
      const ax = oriented[index * 4];
      const ay = oriented[index * 4 + 1];
      const bx = oriented[index * 4 + 2];
      const by = oriented[index * 4 + 3];
      unique.push({
        ax: ax,
        ay: ay,
        bx: bx,
        by: by,
        subjectDelta: seg.isSubject ? seg.windingDelta : 0,
        clipDelta: seg.isSubject ? 0 : seg.windingDelta,
      });
    }
  }
  return unique;
}

export function parsePathBooleanFillRule(value: string): PathBooleanFillRule | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'evenOdd':
        return 'evenOdd';
      case 'nonZero':
        return 'nonZero';
      case 'negative':
        return 'negative';
      case 'positive':
        return 'positive';
      default:
        return undefined;
    }
  })();
}

export function parsePathBooleanOperation(value: string): PathBooleanOperation | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'difference':
        return 'difference';
      case 'intersection':
        return 'intersection';
      case 'union':
        return 'union';
      case 'xor':
        return 'xor';
      default:
        return undefined;
    }
  })();
}

function pointOnEndpointCoords(
  leX: number,
  leY: number,
  otherX: number,
  otherY: number,
  x: number,
  y: number,
  vertexSnap: number,
): boolean {
  return (
    (approxEqual(leX, x, vertexSnap) && approxEqual(leY, y, vertexSnap)) ||
    (approxEqual(otherX, x, vertexSnap) && approxEqual(otherY, y, vertexSnap))
  );
}

function pointOrder(ax: number, ay: number, bx: number, by: number): number {
  if (ax < bx) {
    return -1;
  }
  if (ax > bx) {
    return 1;
  }
  if (ay < by) {
    return -1;
  }
  if (ay > by) {
    return 1;
  }
  return 0;
}

function pointStrictlyInside(
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  x: number,
  y: number,
  vertexSnap: number,
): boolean {
  if (
    (approxEqual(lx, x, vertexSnap) && approxEqual(ly, y, vertexSnap)) ||
    (approxEqual(rx, x, vertexSnap) && approxEqual(ry, y, vertexSnap))
  ) {
    return false;
  }
  const cross = (rx - lx) * (y - ly) - (ry - ly) * (x - lx);
  const lenSq = (rx - lx) * (rx - lx) + (ry - ly) * (ry - ly);
  if (cross * cross > INTERSECTION_EPS * lenSq * lenSq) {
    return false;
  }
  const dot = (x - lx) * (rx - lx) + (y - ly) * (ry - ly);
  return dot > 0.0 && dot < lenSq;
}

/**
 * Reshapes the arrangement so two status-neighbor segments only ever meet at
 * shared endpoints.
 */
function possibleIntersection(
  events: SweepEvent[],
  heap: EventHeap,
  vertexSnap: number,
  le1: number,
  le2: number,
): void {
  const le1Other = getOtherEvent(events, le1);
  const le2Other = getOtherEvent(events, le2);
  const le1X = events[le1].x;
  const le1Y = events[le1].y;
  const le1OtherX = events[le1Other].x;
  const le1OtherY = events[le1Other].y;
  const le2X = events[le2].x;
  const le2Y = events[le2].y;
  const le2OtherX = events[le2Other].x;
  const le2OtherY = events[le2Other].y;
  let inter = segmentIntersection(le1X, le1Y, le1OtherX, le1OtherY, le2X, le2Y, le2OtherX, le2OtherY);
  if (inter === undefined) {
    return;
  }
  inter = inter!;
  if (inter.length === 1) {
    const ix = inter[0][0];
    const iy = inter[0][1];
    const on1 = pointOnEndpointCoords(le1X, le1Y, le1OtherX, le1OtherY, ix, iy, vertexSnap);
    if (!on1) {
      divideSegment(events, heap, le1, ix, iy);
    }
    const on2 = pointOnEndpointCoords(le2X, le2Y, le2OtherX, le2OtherY, ix, iy, vertexSnap);
    if (!on2) {
      divideSegment(events, heap, le2, ix, iy);
    }
    return;
  }
  divideIfInterior(events, heap, vertexSnap, le1, le2X, le2Y);
  divideIfInterior(events, heap, vertexSnap, le1, le2OtherX, le2OtherY);
  divideIfInterior(events, heap, vertexSnap, le2, le1X, le1Y);
  divideIfInterior(events, heap, vertexSnap, le2, le1OtherX, le1OtherY);
}

function recordSegment(
  events: Readonly<SweepEvent[]>,
  leftEvent: number,
  rightEvent: number,
  segments: ArrangementSegment[],
  vertexSnap: number,
): void {
  if (!events[leftEvent].left) {
    return;
  }
  if (
    approxEqual(events[leftEvent].x, events[rightEvent].x, vertexSnap) &&
    approxEqual(events[leftEvent].y, events[rightEvent].y, vertexSnap)
  ) {
    return;
  }
  segments.push({
    ax: events[leftEvent].x,
    ay: events[leftEvent].y,
    bx: events[rightEvent].x,
    by: events[rightEvent].y,
    isSubject: events[leftEvent].isSubject,
    windingDelta: events[leftEvent].windingDelta,
  });
}

/**
 * Returns None, a single intersection point, or the two endpoints of a collinear
 * overlap.
 */
function segmentIntersection(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): Array<readonly [number, number]> | undefined {
  const vax = a2x - a1x;
  const vay = a2y - a1y;
  const vbx = b2x - b1x;
  const vby = b2y - b1y;
  const ex = b1x - a1x;
  const ey = b1y - a1y;
  const kross = vax * vby - vay * vbx;
  const sqrKross = kross * kross;
  const sqrLenA = vax * vax + vay * vay;
  const sqrLenB = vbx * vbx + vby * vby;
  if (sqrKross > INTERSECTION_EPS * sqrLenA * sqrLenB) {
    const s = (ex * vby - ey * vbx) / kross;
    if (s < 0.0 || s > 1.0) {
      return undefined;
    }
    const t = (ex * vay - ey * vax) / kross;
    if (t < 0.0 || t > 1.0) {
      return undefined;
    }
    return [[a1x + s * vax, a1y + s * vay]];
  }
  const krossE = ex * vay - ey * vax;
  if (krossE * krossE > INTERSECTION_EPS * sqrLenA * (ex * ex + ey * ey)) {
    return undefined;
  }
  const sa = (ex * vax + ey * vay) / sqrLenA;
  const sb = sa + (vbx * vax + vby * vay) / sqrLenA;
  const lo = Math.max(0.0, Math.min(sa, sb));
  const hi = Math.min(1.0, Math.max(sa, sb));
  if (lo > hi + 1e-12) {
    return undefined;
  }
  if (Math.abs(lo - hi) <= 1e-12) {
    return [[a1x + lo * vax, a1y + lo * vay]];
  }
  return [
    [a1x + lo * vax, a1y + lo * vay],
    [a1x + hi * vax, a1y + hi * vay],
  ];
}

/**
 * > 0 when (p0, p1, p2) turn counterclockwise.
 */
function signedArea(p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  return (p0x - p2x) * (p1y - p2y) - (p1x - p2x) * (p0y - p2y);
}

function snap(v: number, vertexSnap: number): number {
  return Math.round(v / vertexSnap);
}

function snappedKeysEqual(keys: Readonly<number[]>, stride: number, a: number, b: number): boolean {
  for (let offset = 0; offset < stride; offset += 1) {
    if (keys[a * stride + offset] !== keys[b * stride + offset]) {
      return false;
    }
  }
  return true;
}

function traceRings(edges: Readonly<Float64Array[]>, vertexSnap: number): number[][] {
  let keys: number[] = [] as never[];
  for (const e of edges) {
    keys.push(snap(e[0], vertexSnap));
    keys.push(snap(e[1], vertexSnap));
    keys.push(snap(e[2], vertexSnap));
    keys.push(snap(e[3], vertexSnap));
  }
  const ids = firstOccurrenceIds(keys, 2);
  let graph = directedGraphNew();
  for (let index = 0; index < edges.length; index += 1) {
    directedGraphAddEdge(graph, ids[index * 2], ids[index * 2 + 1], edges[index]);
  }
  return directedGraphTraceRings(graph);
}

/**
 * Winding number of one operand at (px, py).
 */
function windingAt(unique: Readonly<UniqueSegment[]>, px: number, py: number, subject: boolean): number {
  let winding: number = 0;
  for (const v of unique) {
    const lox = Math.min(v.ax, v.bx);
    const hix = Math.max(v.ax, v.bx);
    if (px < lox || px >= hix) {
      continue;
    }
    const t = (px - v.ax) / (v.bx - v.ax);
    const yAt = v.ay + t * (v.by - v.ay);
    if (yAt < py) {
      winding += subject ? v.subjectDelta : v.clipDelta;
    }
  }
  return winding;
}
