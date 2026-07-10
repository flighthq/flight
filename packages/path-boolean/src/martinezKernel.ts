import type {
  PathBooleanBackend,
  PathBooleanContour,
  PathBooleanFillRule,
  PathBooleanOperation,
} from '@flighthq/types';

// Builds the default boolean kernel: a from-scratch, floating-point Martinez–Rueda–Feito sweep-line.
//
// The pipeline runs in two stages, deliberately separated so the correctness-critical classification
// never races the arrangement construction:
//
//   1. Arrangement (the sweep). An event priority queue holds the left/right endpoint events of every
//      input edge. Sweeping left-to-right maintains a status of the active segments ordered by their y
//      at the sweep; each segment is only ever tested for intersection against its immediate status
//      neighbors. A proper crossing splits both segments at the crossing point; a collinear overlap
//      splits each at the other's interior endpoints so the shared span becomes geometrically identical
//      sub-segments. When a segment's right endpoint is reached it is final and recorded.
//   2. Classification + assembly (a static pass over the final segments). Coincident sub-segments are
//      merged by geometry, summing each operand's winding contribution. Every unique segment is then
//      classified by the winding number just below vs just above it (a downward ray from its midpoint),
//      under the fill rule, for the operation — the boundary test. In-result segments are oriented so
//      the kept region lies on their left and traced into closed rings.
//
// Handling coincidence in the static pass rather than mid-sweep is the key robustness decision: winding
// deltas are all final before any membership is computed, so both fill rules and both same/opposite
// edge orientations fall out of the same arithmetic with no field-staleness. It trades the classic
// algorithm's O(n log n) inline classification for an O(n²) post-pass, which is the right call for a
// correctness-first kernel on the modest polygon sizes booleans see.
export function createMartinezPathBooleanBackend(): PathBooleanBackend {
  return {
    computePathBoolean(
      subject: readonly PathBooleanContour[],
      clip: readonly PathBooleanContour[],
      operation: PathBooleanOperation,
      fillRule: PathBooleanFillRule,
    ): readonly PathBooleanContour[] {
      return computeMartinezBoolean(subject, clip, operation, fillRule);
    },
  };
}

// One endpoint of a segment during the sweep. The two endpoints of an edge cross-link via `otherEvent`.
// `windingDelta` is only meaningful on the left endpoint and records the source ring's traversal
// direction across this edge: +1 when the ring runs from the left (lexicographically smaller) endpoint
// to the right, -1 otherwise.
interface SweepEvent {
  x: number;
  y: number;
  left: boolean;
  otherEvent: SweepEvent;
  isSubject: boolean;
  id: number;
  windingDelta: number;
}

// A final, fully-subdivided edge from the sweep — endpoints ordered left (lexicographically smaller) to
// right, tagged by operand and its winding contribution.
interface ArrangementSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  isSubject: boolean;
  windingDelta: number;
}

// A geometrically-unique segment after coincident sub-segments are merged, carrying each operand's
// net winding jump across it.
interface UniqueSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  subjectDelta: number;
  clipDelta: number;
}

// Relative factor for the vertex-merge grid: two vertices collapse to one when they fall in the same
// cell of a grid this fraction of the input's coordinate extent. Large enough to catch the last-bit
// numerical twins a crossing computation produces (a few ulps of the extent), far below any real
// feature separation, so it only ever fuses points that were meant to be identical. Made relative to
// the coordinate magnitude (rather than a fixed absolute) so the same topology resolves whether the
// polygon is expressed in pixels, metres, or micrometres.
const VERTEX_SNAP_RELATIVE = 1e-9;

// Fallback absolute snap for degenerate all-coincident input where the extent is zero; no segments
// survive such input, so the exact value only guards the division in `snap`.
const VERTEX_SNAP_FALLBACK = 1e-9;

// Relative tolerance for the intersection orientation tests, scaled by squared edge lengths in each
// comparison so it already behaves consistently across coordinate magnitudes.
const INTERSECTION_EPS = 1e-12;

let nextEventId = 0;

// The active vertex-merge grid cell size for the boolean currently being computed, derived from the
// input's coordinate extent at the top of `computeMartinezBoolean`. Module-scoped rather than threaded
// through every `approxEqual`/`snap` call (the computation is synchronous and single-entrant, like
// `nextEventId`); it is never read at import time, so importing the package stays side-effect-free.
let vertexSnap = VERTEX_SNAP_FALLBACK;

function computeMartinezBoolean(
  subject: readonly PathBooleanContour[],
  clip: readonly PathBooleanContour[],
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule,
): PathBooleanContour[] {
  nextEventId = 0;
  vertexSnap = computeVertexSnap(subject, clip);
  const segments = buildArrangement(subject, clip);
  if (segments.length === 0) return [];
  const unique = mergeCoincidentSegments(segments);
  const kept = classifySegments(unique, operation, fillRule);
  if (kept.length === 0) return [];
  return traceRings(kept);
}

// Stage 1: the sweep. Returns every final (non-crossing, non-overlapping) segment of the combined
// subject+clip arrangement.
function buildArrangement(
  subject: readonly PathBooleanContour[],
  clip: readonly PathBooleanContour[],
): ArrangementSegment[] {
  const heap = new EventHeap();
  fillQueue(subject, true, heap);
  fillQueue(clip, false, heap);

  const status: SweepEvent[] = [];
  const segments: ArrangementSegment[] = [];

  while (!heap.isEmpty()) {
    const event = heap.pop();
    if (event.left) {
      const index = insertStatus(status, event);
      const prev = index > 0 ? status[index - 1] : null;
      const next = index < status.length - 1 ? status[index + 1] : null;
      if (next !== null) possibleIntersection(event, next, heap);
      if (prev !== null) possibleIntersection(prev, event, heap);
    } else {
      const leftEvent = event.otherEvent;
      const index = findStatus(status, leftEvent);
      if (index !== -1) {
        const prev = index > 0 ? status[index - 1] : null;
        const next = index < status.length - 1 ? status[index + 1] : null;
        status.splice(index, 1);
        if (prev !== null && next !== null) possibleIntersection(prev, next, heap);
      }
      recordSegment(leftEvent, event, segments);
    }
  }

  return segments;
}

function recordSegment(leftEvent: SweepEvent, rightEvent: SweepEvent, segments: ArrangementSegment[]): void {
  if (!leftEvent.left) return;
  if (approxEqual(leftEvent.x, rightEvent.x) && approxEqual(leftEvent.y, rightEvent.y)) return;
  segments.push({
    ax: leftEvent.x,
    ay: leftEvent.y,
    bx: rightEvent.x,
    by: rightEvent.y,
    isSubject: leftEvent.isSubject,
    windingDelta: leftEvent.windingDelta,
  });
}

// Appends every edge of every contour as a left/right event pair. A trailing vertex repeating the first
// (flattenPath appends one on CLOSE) is dropped; zero-length edges are skipped.
function fillQueue(contours: readonly PathBooleanContour[], isSubject: boolean, heap: EventHeap): void {
  for (const contour of contours) {
    let count = contour.length >> 1;
    if (count < 2) continue;
    if (approxEqual(contour[0], contour[(count - 1) * 2]) && approxEqual(contour[1], contour[(count - 1) * 2 + 1])) {
      count -= 1;
    }
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const ax = contour[i * 2];
      const ay = contour[i * 2 + 1];
      const j = (i + 1) % count;
      const bx = contour[j * 2];
      const by = contour[j * 2 + 1];
      if (approxEqual(ax, bx) && approxEqual(ay, by)) continue;
      addEdge(ax, ay, bx, by, isSubject, heap);
    }
  }
}

function addEdge(ax: number, ay: number, bx: number, by: number, isSubject: boolean, heap: EventHeap): void {
  const a = createEvent(ax, ay, isSubject);
  const b = createEvent(bx, by, isSubject);
  a.otherEvent = b;
  b.otherEvent = a;
  if (pointOrder(ax, ay, bx, by) < 0) {
    a.left = true;
    a.windingDelta = 1;
  } else {
    b.left = true;
    b.windingDelta = -1;
  }
  heap.push(a);
  heap.push(b);
}

function createEvent(x: number, y: number, isSubject: boolean): SweepEvent {
  return {
    x,
    y,
    left: false,
    otherEvent: null as unknown as SweepEvent,
    isSubject,
    id: nextEventId++,
    windingDelta: 0,
  };
}

// Reshapes the arrangement so two status-neighbor segments only ever meet at shared endpoints.
function possibleIntersection(le1: SweepEvent, le2: SweepEvent, heap: EventHeap): void {
  const inter = segmentIntersection(
    le1.x,
    le1.y,
    le1.otherEvent.x,
    le1.otherEvent.y,
    le2.x,
    le2.y,
    le2.otherEvent.x,
    le2.otherEvent.y,
  );
  if (inter === null) return;

  if (inter.length === 1) {
    const ix = inter[0][0];
    const iy = inter[0][1];
    if (!pointOnEndpoint(le1, ix, iy)) divideSegment(le1, ix, iy, heap);
    if (!pointOnEndpoint(le2, ix, iy)) divideSegment(le2, ix, iy, heap);
    return;
  }

  // Collinear overlap: split each segment at the other's strictly-interior endpoints. Remaining overlap
  // on the freshly-created halves is resolved when those halves become status neighbors and are tested.
  divideIfInterior(le1, le2.x, le2.y, heap);
  divideIfInterior(le1, le2.otherEvent.x, le2.otherEvent.y, heap);
  divideIfInterior(le2, le1.x, le1.y, heap);
  divideIfInterior(le2, le1.otherEvent.x, le1.otherEvent.y, heap);
}

function divideIfInterior(le: SweepEvent, x: number, y: number, heap: EventHeap): void {
  if (pointStrictlyInside(le.x, le.y, le.otherEvent.x, le.otherEvent.y, x, y)) divideSegment(le, x, y, heap);
}

// Splits `le` at interior point (x, y): the left half keeps `le` as its left endpoint; a fresh left
// event opens the right half. Both halves inherit the ring orientation, so their winding deltas match.
function divideSegment(le: SweepEvent, x: number, y: number, heap: EventHeap): void {
  const right = le.otherEvent;
  const newRight = createEvent(x, y, le.isSubject);
  const newLeft = createEvent(x, y, le.isSubject);
  newRight.left = false;
  newRight.otherEvent = le;
  newLeft.left = true;
  newLeft.otherEvent = right;
  newLeft.windingDelta = le.windingDelta;
  le.otherEvent = newRight;
  right.otherEvent = newLeft;
  heap.push(newLeft);
  heap.push(newRight);
}

function pointOnEndpoint(le: SweepEvent, x: number, y: number): boolean {
  return (
    (approxEqual(le.x, x) && approxEqual(le.y, y)) ||
    (approxEqual(le.otherEvent.x, x) && approxEqual(le.otherEvent.y, y))
  );
}

function pointStrictlyInside(lx: number, ly: number, rx: number, ry: number, x: number, y: number): boolean {
  if ((approxEqual(lx, x) && approxEqual(ly, y)) || (approxEqual(rx, x) && approxEqual(ry, y))) return false;
  const cross = (rx - lx) * (y - ly) - (ry - ly) * (x - lx);
  const lenSq = (rx - lx) * (rx - lx) + (ry - ly) * (ry - ly);
  if (cross * cross > INTERSECTION_EPS * lenSq * lenSq) return false;
  const dot = (x - lx) * (rx - lx) + (y - ly) * (ry - ly);
  return dot > 0 && dot < lenSq;
}

// Sweep-line status: a sorted array. Because segments are subdivided at every crossing they never swap
// order once inserted, so a plain insertion order stays valid.
function insertStatus(status: SweepEvent[], event: SweepEvent): number {
  let lo = 0;
  let hi = status.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareSegments(status[mid], event) < 0) lo = mid + 1;
    else hi = mid;
  }
  status.splice(lo, 0, event);
  return lo;
}

function findStatus(status: SweepEvent[], event: SweepEvent): number {
  for (let i = 0; i < status.length; i++) if (status[i] === event) return i;
  return -1;
}

// Orders two active segments by vertical position at the sweep (Martinez segment comparator). Uses
// exact comparisons throughout so the order is a consistent total order — a non-transitive tolerant
// comparator would corrupt the sorted status.
function compareSegments(le1: SweepEvent, le2: SweepEvent): number {
  if (le1 === le2) return 0;
  const a1x = le1.x;
  const a1y = le1.y;
  const a2x = le1.otherEvent.x;
  const a2y = le1.otherEvent.y;
  const s1 = signedArea(a1x, a1y, a2x, a2y, le2.x, le2.y);
  const s2 = signedArea(a1x, a1y, a2x, a2y, le2.otherEvent.x, le2.otherEvent.y);

  if (s1 !== 0 || s2 !== 0) {
    if (a1x === le2.x && a1y === le2.y) return isBelow(le1, le2.otherEvent.x, le2.otherEvent.y) ? -1 : 1;
    if (a1x === le2.x) return a1y < le2.y ? -1 : 1;
    if (compareEvents(le1, le2) === 1) return isBelow(le2, a1x, a1y) ? 1 : -1;
    return isBelow(le1, le2.x, le2.y) ? -1 : 1;
  }

  if (le1.isSubject !== le2.isSubject) return le1.isSubject ? -1 : 1;
  if (a1x === le2.x && a1y === le2.y) return le1.id < le2.id ? -1 : 1;
  return compareEvents(le1, le2) === 1 ? 1 : -1;
}

// True when segment `le` passes strictly below point (x, y).
function isBelow(le: SweepEvent, x: number, y: number): boolean {
  return le.left
    ? signedArea(le.x, le.y, le.otherEvent.x, le.otherEvent.y, x, y) > 0
    : signedArea(le.otherEvent.x, le.otherEvent.y, le.x, le.y, x, y) > 0;
}

// Priority order of two events: by x, then y, then right-endpoint-before-left, then by slope, then a
// stable operand/id tiebreak. Returns -1 when e1 is processed first. Exact comparisons only.
function compareEvents(e1: SweepEvent, e2: SweepEvent): number {
  if (e1.x !== e2.x) return e1.x < e2.x ? -1 : 1;
  if (e1.y !== e2.y) return e1.y < e2.y ? -1 : 1;
  if (e1 === e2) return 0;
  if (e1.left !== e2.left) return e1.left ? 1 : -1;
  const area = signedArea(e1.x, e1.y, e1.otherEvent.x, e1.otherEvent.y, e2.otherEvent.x, e2.otherEvent.y);
  if (area !== 0) return isBelow(e1, e2.otherEvent.x, e2.otherEvent.y) ? -1 : 1;
  if (e1.isSubject !== e2.isSubject) return e1.isSubject ? -1 : 1;
  return e1.id < e2.id ? -1 : 1;
}

function pointOrder(ax: number, ay: number, bx: number, by: number): number {
  if (ax < bx) return -1;
  if (ax > bx) return 1;
  if (ay < by) return -1;
  if (ay > by) return 1;
  return 0;
}

// > 0 when (p0, p1, p2) turn counterclockwise in math (y-up) orientation.
function signedArea(p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  return (p0x - p2x) * (p1y - p2y) - (p1x - p2x) * (p0y - p2y);
}

// Returns null, a single intersection point, or the two endpoints of a collinear overlap.
function segmentIntersection(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): [number, number][] | null {
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
    if (s < 0 || s > 1) return null;
    const t = (ex * vay - ey * vax) / kross;
    if (t < 0 || t > 1) return null;
    return [[a1x + s * vax, a1y + s * vay]];
  }

  const krossE = ex * vay - ey * vax;
  if (krossE * krossE > INTERSECTION_EPS * sqrLenA * (ex * ex + ey * ey)) return null;

  const sa = (ex * vax + ey * vay) / sqrLenA;
  const sb = sa + (vbx * vax + vby * vay) / sqrLenA;
  const lo = Math.max(0, Math.min(sa, sb));
  const hi = Math.min(1, Math.max(sa, sb));
  if (lo > hi + 1e-12) return null;
  if (Math.abs(lo - hi) <= 1e-12) return [[a1x + lo * vax, a1y + lo * vay]];
  return [
    [a1x + lo * vax, a1y + lo * vay],
    [a1x + hi * vax, a1y + hi * vay],
  ];
}

// Stage 2a: fold coincident final segments into one, summing each operand's winding contribution. The
// key normalizes endpoints to lexicographic order, matching the way `addEdge` measures windingDelta, so
// deltas from opposite-direction coincident edges cancel.
function mergeCoincidentSegments(segments: readonly ArrangementSegment[]): UniqueSegment[] {
  const map = new Map<string, UniqueSegment>();
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
    const key = `${snap(ax)},${snap(ay)},${snap(bx)},${snap(by)}`;
    let unique = map.get(key);
    if (unique === undefined) {
      unique = { ax, ay, bx, by, subjectDelta: 0, clipDelta: 0 };
      map.set(key, unique);
    }
    if (seg.isSubject) unique.subjectDelta += seg.windingDelta;
    else unique.clipDelta += seg.windingDelta;
  }
  return [...map.values()];
}

// Stage 2b: classify each unique segment by the boundary test, orienting kept segments so the retained
// region sits on the segment's left. Returns directed edges [fromX, fromY, toX, toY].
//
// Membership is sampled at two points a hair off each side of the segment's midpoint, perpendicular to
// it, and the winding of each operand at those points is found by a downward ray. Sampling
// perpendicular to the edge (rather than straight up/down) is what makes vertical and horizontal edges
// classify correctly — a purely y-based below/above test is degenerate for vertical edges.
function classifySegments(
  unique: readonly UniqueSegment[],
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule,
): number[][] {
  const kept: number[][] = [];
  for (const seg of unique) {
    const mx = (seg.ax + seg.bx) / 2;
    const my = (seg.ay + seg.by) / 2;
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    // Left normal of the lex-ordered direction A→B (math y-up: rotate +90°). Offset well inside the
    // segment's own clear zone — other segments only meet it at its endpoints.
    const eps = len * 1e-4;
    const nlx = (-dy / len) * eps;
    const nly = (dx / len) * eps;
    const leftInSubject = isInside(windingAt(unique, mx + nlx, my + nly, true), fillRule);
    const leftInClip = isInside(windingAt(unique, mx + nlx, my + nly, false), fillRule);
    const rightInSubject = isInside(windingAt(unique, mx - nlx, my - nly, true), fillRule);
    const rightInClip = isInside(windingAt(unique, mx - nlx, my - nly, false), fillRule);
    const filledLeft = combine(operation, leftInSubject, leftInClip);
    const filledRight = combine(operation, rightInSubject, rightInClip);
    if (filledLeft === filledRight) continue;
    // Direct the edge so the kept region is on its left.
    if (filledLeft) kept.push([seg.ax, seg.ay, seg.bx, seg.by]);
    else kept.push([seg.bx, seg.by, seg.ax, seg.ay]);
  }
  return kept;
}

// Winding number of one operand at (px, py): the signed sum of the winding deltas of every segment that
// the downward vertical ray from the point crosses (a segment strictly spanning px whose y at px lies
// below py).
function windingAt(unique: readonly UniqueSegment[], px: number, py: number, subject: boolean): number {
  let winding = 0;
  for (const v of unique) {
    const lox = Math.min(v.ax, v.bx);
    const hix = Math.max(v.ax, v.bx);
    // Half-open x-interval so a ray passing exactly through a shared vertex counts exactly one of the
    // two edges meeting there (the one that starts at px, not the one that ends at it).
    if (px < lox || px >= hix) continue;
    const t = (px - v.ax) / (v.bx - v.ax);
    const yAt = v.ay + t * (v.by - v.ay);
    if (yAt < py) winding += subject ? v.subjectDelta : v.clipDelta;
  }
  return winding;
}

function combine(operation: PathBooleanOperation, inSubject: boolean, inClip: boolean): boolean {
  switch (operation) {
    case 'union':
      return inSubject || inClip;
    case 'intersection':
      return inSubject && inClip;
    case 'difference':
      return inSubject && !inClip;
    case 'xor':
      return inSubject !== inClip;
  }
}

function isInside(winding: number, fillRule: PathBooleanFillRule): boolean {
  switch (fillRule) {
    case 'evenOdd':
      return (Math.abs(winding) & 1) === 1;
    case 'positive':
      return winding > 0;
    case 'negative':
      return winding < 0;
    default:
      return winding !== 0;
  }
}

// Stage 2c: chain the directed, fill-on-left edges into closed rings. At a vertex shared by several
// rings, the next edge is the one turning most clockwise from the reversed incoming direction, which
// keeps the retained region continuously on the left.
function traceRings(edges: readonly number[][]): PathBooleanContour[] {
  const graph = new DirectedGraph();
  for (const e of edges) graph.addEdge(e[0], e[1], e[2], e[3]);
  return graph.traceRings();
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= vertexSnap;
}

// Derives the vertex-merge grid size from the largest coordinate span across both operands, so the
// snap tolerance tracks the input's magnitude. Zero/degenerate extent falls back to a fixed absolute.
function computeVertexSnap(subject: readonly PathBooleanContour[], clip: readonly PathBooleanContour[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contours of [subject, clip]) {
    for (const contour of contours) {
      for (let i = 0; i < contour.length; i += 2) {
        const x = contour[i];
        const y = contour[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  return extent > 0 ? extent * VERTEX_SNAP_RELATIVE : VERTEX_SNAP_FALLBACK;
}

function snap(v: number): number {
  return Math.round(v / vertexSnap);
}

// Directed graph of the kept boundary edges. Each directed edge is consumed once; ring closure and
// vertex sharing are handled by angular next-edge selection.
class DirectedGraph {
  private readonly keys = new Map<string, number>();
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly outgoing: number[][] = [];
  private readonly edgeTo: number[] = [];
  private readonly edgeFrom: number[] = [];
  private readonly used: boolean[] = [];

  addEdge(fromX: number, fromY: number, toX: number, toY: number): void {
    const from = this.vertex(fromX, fromY);
    const to = this.vertex(toX, toY);
    if (from === to) return;
    const edge = this.edgeFrom.length;
    this.edgeFrom.push(from);
    this.edgeTo.push(to);
    this.used.push(false);
    this.outgoing[from].push(edge);
  }

  traceRings(): number[][] {
    const rings: number[][] = [];
    for (let start = 0; start < this.edgeFrom.length; start++) {
      if (this.used[start]) continue;
      const ring = this.walk(start);
      if (ring !== null && ring.length >= 6) rings.push(ring);
    }
    return rings;
  }

  private walk(startEdge: number): number[] | null {
    const ring: number[] = [];
    let edge = startEdge;
    let guard = 0;
    const limit = this.edgeFrom.length + 2;
    while (guard++ < limit) {
      this.used[edge] = true;
      const from = this.edgeFrom[edge];
      ring.push(this.xs[from], this.ys[from]);
      const to = this.edgeTo[edge];
      const next = this.nextEdge(to, from);
      if (next === -1 || next === startEdge || this.used[next]) break;
      edge = next;
    }
    return ring;
  }

  // At vertex `at`, arriving from `cameFrom`, pick the unused outgoing edge that turns most clockwise
  // from the reversed incoming direction — the walk that keeps the retained region on the left.
  private nextEdge(at: number, cameFrom: number): number {
    const incomingAngle = Math.atan2(this.ys[cameFrom] - this.ys[at], this.xs[cameFrom] - this.xs[at]);
    let best = -1;
    let bestGap = Infinity;
    for (const edge of this.outgoing[at]) {
      if (this.used[edge]) continue;
      const to = this.edgeTo[edge];
      const angle = Math.atan2(this.ys[to] - this.ys[at], this.xs[to] - this.xs[at]);
      let gap = incomingAngle - angle;
      while (gap <= 0) gap += Math.PI * 2;
      while (gap > Math.PI * 2) gap -= Math.PI * 2;
      if (gap < bestGap) {
        bestGap = gap;
        best = edge;
      }
    }
    return best;
  }

  private vertex(x: number, y: number): number {
    const key = `${snap(x)},${snap(y)}`;
    const existing = this.keys.get(key);
    if (existing !== undefined) return existing;
    const index = this.xs.length;
    this.keys.set(key, index);
    this.xs.push(x);
    this.ys.push(y);
    this.outgoing.push([]);
    return index;
  }
}

// Binary min-heap over sweep events ordered by compareEvents.
class EventHeap {
  private readonly data: SweepEvent[] = [];

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  push(event: SweepEvent): void {
    const data = this.data;
    data.push(event);
    let i = data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compareEvents(data[i], data[parent]) < 0) {
        swap(data, i, parent);
        i = parent;
      } else break;
    }
  }

  pop(): SweepEvent {
    const data = this.data;
    const top = data[0];
    const last = data.pop() as SweepEvent;
    if (data.length > 0) {
      data[0] = last;
      let i = 0;
      const n = data.length;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < n && compareEvents(data[left], data[smallest]) < 0) smallest = left;
        if (right < n && compareEvents(data[right], data[smallest]) < 0) smallest = right;
        if (smallest === i) break;
        swap(data, i, smallest);
        i = smallest;
      }
    }
    return top;
  }
}

function swap(data: SweepEvent[], i: number, j: number): void {
  const tmp = data[i];
  data[i] = data[j];
  data[j] = tmp;
}
