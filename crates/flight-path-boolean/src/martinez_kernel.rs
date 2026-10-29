//! flight-compiler: string-union PathBooleanFillRule PathBooleanOperation

use std::sync::LazyLock;

use flight_entity::{EntityRuntimeSlot, allocate_entity, throw_error};

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// A flat array of interleaved `[x, y, x, y, ...]` coordinates representing one
/// polygon contour for boolean operations.
pub type PathBooleanContour = Vec<f64>;

/// The boolean set operation to perform on two path operands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanOperation {
    Difference,
    Intersection,
    Union,
    Xor,
}

/// Fill rule for resolving winding numbers into filled/unfilled regions. Extends
/// PathWinding with positive and negative rules used internally by the offset
/// cleanup pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanFillRule {
    EvenOdd,
    NonZero,
    Positive,
    Negative,
}

/// The strategy a `PathBooleanKernel` carries (TS `computePathBoolean`): the combined contour set of
/// two operands under an operation and fill rule. A stateless function value (D9d).
pub type ComputePathBooleanFunction = fn(
    &[PathBooleanContour],
    &[PathBooleanContour],
    PathBooleanOperation,
    PathBooleanFillRule,
) -> Vec<PathBooleanContour>;

/// The boolean kernel (TS `PathBooleanKernel extends Entity`): a strategy entity whose
/// `compute_path_boolean` computes the combined contour set of two operands. Callers may supply any
/// kernel; the Martinez kernel is the stock one.
// D12 requires value equality on Entity structs; the strategy is a stateless function value, so
// comparing it compares the strategy identity, as TS reference equality on the method would.
#[allow(unpredictable_function_pointer_comparisons)]
#[derive(Debug, Clone, PartialEq)]
pub struct PathBooleanKernel {
    runtime: EntityRuntimeSlot,
    pub compute_path_boolean: ComputePathBooleanFunction,
}

/// The kernel the boolean operations use unless the caller passes another one. A stateless value, so
/// it is one shared instance rather than a per-call construction (TS `martinezPathBooleanKernel`;
/// entity-valued singleton as `LazyLock`, D12).
pub static MARTINEZ_PATH_BOOLEAN_KERNEL: LazyLock<PathBooleanKernel> =
    LazyLock::new(create_martinez_path_boolean_kernel);

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Relative factor for the vertex-merge grid: two vertices collapse to one when
/// they fall in the same cell of a grid this fraction of the input's coordinate
/// extent.
const VERTEX_SNAP_RELATIVE: f64 = 1e-9;

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Fallback absolute snap for degenerate all-coincident input where the extent is
/// zero.
const VERTEX_SNAP_FALLBACK: f64 = 1e-9;

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Relative tolerance for the intersection orientation tests, scaled by squared
/// edge lengths in each comparison.
const INTERSECTION_EPS: f64 = 1e-12;

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// One endpoint of a segment during the sweep. The two endpoints of an edge
/// cross-link via `other_event` (an arena index). `winding_delta` is only
/// meaningful on the left endpoint and records the source ring's traversal
/// direction across this edge.
struct SweepEvent {
    x: f64,
    y: f64,
    left: bool,
    other_event: Option<usize>,
    is_subject: bool,
    id: usize,
    winding_delta: i32,
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// A final, fully-subdivided edge from the sweep.
struct ArrangementSegment {
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    is_subject: bool,
    winding_delta: i32,
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// A geometrically-unique segment after coincident sub-segments are merged.
struct UniqueSegment {
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    subject_delta: i32,
    clip_delta: i32,
}

/// Binary min-heap over sweep event arena indices ordered by compare_events.
// `data[..length]` is the heap; slots past `length` are spare capacity a later push reuses.
struct EventHeap {
    data: Vec<usize>,
    length: usize,
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Directed graph of kept boundary edges for ring tracing.
struct DirectedGraph {
    xs: Vec<f64>,
    ys: Vec<f64>,
    outgoing: Vec<Vec<usize>>,
    edge_to: Vec<usize>,
    edge_from: Vec<usize>,
    used: Vec<bool>,
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn create_event(events: &mut Vec<SweepEvent>, x: f64, y: f64, is_subject: bool) -> usize {
    let id = events.len();
    events.push(SweepEvent {
        x,
        y,
        left: false,
        other_event: None,
        is_subject,
        id,
        winding_delta: 0,
    });
    return id;
}

pub fn create_martinez_path_boolean_kernel() -> PathBooleanKernel {
    let mut out: PathBooleanKernel = allocate_entity();
    initialize_martinez_path_boolean_kernel(&mut out);
    return out;
}

/// The construction initializer of `create_martinez_path_boolean_kernel`.
pub fn initialize_martinez_path_boolean_kernel(out: &mut PathBooleanKernel) {
    out.compute_path_boolean = compute_martinez_boolean;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn add_edge(
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    is_subject: bool,
    events: &mut Vec<SweepEvent>,
    heap: &mut EventHeap,
) {
    let a = create_event(events, ax, ay, is_subject);
    let b = create_event(events, bx, by, is_subject);
    events[a].other_event = Some(b);
    events[b].other_event = Some(a);
    if point_order(ax, ay, bx, by) < 0 {
        events[a].left = true;
        events[a].winding_delta = 1;
    } else {
        events[b].left = true;
        events[b].winding_delta = -1;
    }
    event_heap_push(heap, &events, a);
    event_heap_push(heap, &events, b);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn approx_equal(a: f64, b: f64, vertex_snap: f64) -> bool {
    return (a - b).abs() <= vertex_snap;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
// Pipeline stage 1 (the sweep): builds the arrangement.
fn build_arrangement(
    subject: &[Vec<f64>],
    clip: &[Vec<f64>],
    vertex_snap: f64,
) -> Vec<ArrangementSegment> {
    let mut events: Vec<SweepEvent> = Vec::new();
    let mut heap = EventHeap {
        data: Vec::new(),
        length: 0,
    };

    fill_queue(subject, true, &mut events, &mut heap, vertex_snap);
    fill_queue(clip, false, &mut events, &mut heap, vertex_snap);

    let mut status: Vec<usize> = Vec::new();
    let mut segments: Vec<ArrangementSegment> = Vec::new();

    while !event_heap_is_empty(&heap) {
        let event = event_heap_pop(&mut heap, &events);
        if events[event].left {
            let index = insert_status(&mut status, &events, event);
            let prev = if index > 0 {
                Some(status[index - 1])
            } else {
                None
            };
            let next = if index < status.len() - 1 {
                Some(status[index + 1])
            } else {
                None
            };
            if let Some(next_ev) = next {
                possible_intersection(&mut events, &mut heap, vertex_snap, event, next_ev);
            }
            if let Some(prev_ev) = prev {
                possible_intersection(&mut events, &mut heap, vertex_snap, prev_ev, event);
            }
        } else {
            let left_event = get_other_event(&events, event);
            let index = find_status(&status, left_event);
            if index >= 0 {
                let idx = index as usize;
                // Both neighbors exist only when `idx` is interior; they become adjacent after removal.
                let has_neighbors = idx > 0 && idx + 1 < status.len();
                let prev_ev = if idx > 0 { status[idx - 1] } else { 0 };
                let next_ev = if idx + 1 < status.len() {
                    status[idx + 1]
                } else {
                    0
                };
                let mut kept: Vec<usize> = status[0..idx].to_vec();
                kept.extend_from_slice(&status[idx + 1..status.len()]);
                status = kept;
                if has_neighbors {
                    possible_intersection(&mut events, &mut heap, vertex_snap, prev_ev, next_ev);
                }
            }
            record_segment(&events, left_event, event, &mut segments, vertex_snap);
        }
    }

    return segments;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
// Pipeline stage 2b: classifies unique segments for the operation.
fn classify_segments(
    unique: &[UniqueSegment],
    operation: PathBooleanOperation,
    fill_rule: PathBooleanFillRule,
) -> Vec<[f64; 4]> {
    let mut kept: Vec<[f64; 4]> = Vec::new();
    for seg in unique {
        let mx = (seg.ax + seg.bx) / 2.0;
        let my = (seg.ay + seg.by) / 2.0;
        let dx = seg.bx - seg.ax;
        let dy = seg.by - seg.ay;
        let len = (dx * dx + dy * dy).sqrt();
        if len == 0.0 {
            continue;
        }
        let eps = len * 1e-4;
        let nlx = (-dy / len) * eps;
        let nly = (dx / len) * eps;
        let left_in_subject = is_inside(winding_at(unique, mx + nlx, my + nly, true), fill_rule);
        let left_in_clip = is_inside(winding_at(unique, mx + nlx, my + nly, false), fill_rule);
        let right_in_subject = is_inside(winding_at(unique, mx - nlx, my - nly, true), fill_rule);
        let right_in_clip = is_inside(winding_at(unique, mx - nlx, my - nly, false), fill_rule);
        let filled_left = combine(operation, left_in_subject, left_in_clip);
        let filled_right = combine(operation, right_in_subject, right_in_clip);
        if filled_left == filled_right {
            continue;
        }
        if filled_left {
            kept.push([seg.ax, seg.ay, seg.bx, seg.by]);
        } else {
            kept.push([seg.bx, seg.by, seg.ax, seg.ay]);
        }
    }
    return kept;
}

fn combine(operation: PathBooleanOperation, in_subject: bool, in_clip: bool) -> bool {
    return match operation {
        PathBooleanOperation::Union => in_subject || in_clip,
        PathBooleanOperation::Intersection => in_subject && in_clip,
        PathBooleanOperation::Difference => in_subject && !in_clip,
        PathBooleanOperation::Xor => in_subject != in_clip,
    };
}

/// Priority order of two events.
fn compare_events(events: &[SweepEvent], e1: usize, e2: usize) -> i32 {
    if events[e1].x != events[e2].x {
        return if events[e1].x < events[e2].x { -1 } else { 1 };
    }
    if events[e1].y != events[e2].y {
        return if events[e1].y < events[e2].y { -1 } else { 1 };
    }
    if e1 == e2 {
        return 0;
    }
    if events[e1].left != events[e2].left {
        return if events[e1].left { 1 } else { -1 };
    }
    let e1_other = get_other_event(events, e1);
    let e2_other = get_other_event(events, e2);
    let area = signed_area(
        events[e1].x,
        events[e1].y,
        events[e1_other].x,
        events[e1_other].y,
        events[e2_other].x,
        events[e2_other].y,
    );
    if area != 0.0 {
        return if is_below(events, e1, events[e2_other].x, events[e2_other].y) {
            -1
        } else {
            1
        };
    }
    if events[e1].is_subject != events[e2].is_subject {
        return if events[e1].is_subject { -1 } else { 1 };
    }
    return if events[e1].id < events[e2].id { -1 } else { 1 };
}

/// Orders two active segments by vertical position at the sweep (Martinez segment
/// comparator).
fn compare_segments(events: &[SweepEvent], le1: usize, le2: usize) -> i32 {
    if le1 == le2 {
        return 0;
    }
    let a1x = events[le1].x;
    let a1y = events[le1].y;
    let le2_other = get_other_event(events, le2);
    let le1_other = get_other_event(events, le1);
    let a2x = events[le1_other].x;
    let a2y = events[le1_other].y;
    let s1 = signed_area(a1x, a1y, a2x, a2y, events[le2].x, events[le2].y);
    let s2 = signed_area(a1x, a1y, a2x, a2y, events[le2_other].x, events[le2_other].y);

    if s1 != 0.0 || s2 != 0.0 {
        if a1x == events[le2].x && a1y == events[le2].y {
            return if is_below(events, le1, events[le2_other].x, events[le2_other].y) {
                -1
            } else {
                1
            };
        }
        if a1x == events[le2].x {
            return if a1y < events[le2].y { -1 } else { 1 };
        }
        if compare_events(events, le1, le2) == 1 {
            return if is_below(events, le2, a1x, a1y) {
                1
            } else {
                -1
            };
        }
        return if is_below(events, le1, events[le2].x, events[le2].y) {
            -1
        } else {
            1
        };
    }

    if events[le1].is_subject != events[le2].is_subject {
        return if events[le1].is_subject { -1 } else { 1 };
    }
    if a1x == events[le2].x && a1y == events[le2].y {
        return if events[le1].id < events[le2].id {
            -1
        } else {
            1
        };
    }
    return if compare_events(events, le1, le2) == 1 {
        1
    } else {
        -1
    };
}

// Orders keys `a` and `b`, each `stride` consecutive values of `keys`, lexicographically and then by
// position, so equal keys sort in first-occurrence order.
fn compare_snapped_keys(keys: &[i64], stride: usize, a: usize, b: usize) -> std::cmp::Ordering {
    for offset in 0..stride {
        let left = keys[a * stride + offset];
        let right = keys[b * stride + offset];
        if left < right {
            return std::cmp::Ordering::Less;
        }
        if left > right {
            return std::cmp::Ordering::Greater;
        }
    }
    return a.cmp(&b);
}

/// Placeholder strategy of a default-constructed (not yet initialized) kernel: computes nothing.
fn compute_empty_path_boolean(
    _subject: &[PathBooleanContour],
    _clip: &[PathBooleanContour],
    _operation: PathBooleanOperation,
    _fill_rule: PathBooleanFillRule,
) -> Vec<PathBooleanContour> {
    return Vec::new();
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn compute_martinez_boolean(
    subject: &[Vec<f64>],
    clip: &[Vec<f64>],
    operation: PathBooleanOperation,
    fill_rule: PathBooleanFillRule,
) -> Vec<Vec<f64>> {
    let vertex_snap = compute_vertex_snap(subject, clip);
    let segments = build_arrangement(subject, clip, vertex_snap);
    if segments.is_empty() {
        return Vec::new();
    }
    let unique = merge_coincident_segments(&segments, vertex_snap);
    let kept = classify_segments(&unique, operation, fill_rule);
    if kept.is_empty() {
        return Vec::new();
    }
    return trace_rings(&kept, vertex_snap);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn compute_vertex_snap(subject: &[Vec<f64>], clip: &[Vec<f64>]) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for contours in [subject, clip] {
        for contour in contours {
            let mut i = 0;
            while i < contour.len() {
                let x = contour[i];
                let y = contour[i + 1];
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if y > max_y {
                    max_y = y;
                }
                i += 2;
            }
        }
    }
    let extent = f64::max(max_x - min_x, max_y - min_y);
    return if extent > 0.0 {
        extent * VERTEX_SNAP_RELATIVE
    } else {
        VERTEX_SNAP_FALLBACK
    };
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// `from` and `to` are snapped-vertex ids in first-occurrence order (see `first_occurrence_ids`).
fn directed_graph_add_edge(graph: &mut DirectedGraph, from: usize, to: usize, edge: &[f64; 4]) {
    let from = directed_graph_vertex(graph, from, edge[0], edge[1]);
    let to = directed_graph_vertex(graph, to, edge[2], edge[3]);
    if from == to {
        return;
    }
    let edge = graph.edge_from.len();
    graph.edge_from.push(from);
    graph.edge_to.push(to);
    graph.used.push(false);
    graph.outgoing[from].push(edge);
}

fn directed_graph_new() -> DirectedGraph {
    return DirectedGraph {
        xs: Vec::new(),
        ys: Vec::new(),
        outgoing: Vec::new(),
        edge_to: Vec::new(),
        edge_from: Vec::new(),
        used: Vec::new(),
    };
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// At vertex `at`, arriving from `came_from`, pick the unused outgoing edge that
/// turns most clockwise from the reversed incoming direction.
fn directed_graph_next_edge(graph: &DirectedGraph, at: usize, came_from: usize) -> i32 {
    let incoming_angle =
        (graph.ys[came_from] - graph.ys[at]).atan2(graph.xs[came_from] - graph.xs[at]);
    let mut best: i32 = -1;
    let mut best_gap: f64 = f64::INFINITY;
    let two_pi = std::f64::consts::PI * 2.0;
    for &edge in &graph.outgoing[at] {
        if graph.used[edge] {
            continue;
        }
        let to = graph.edge_to[edge];
        let angle = (graph.ys[to] - graph.ys[at]).atan2(graph.xs[to] - graph.xs[at]);
        let mut gap = incoming_angle - angle;
        while gap <= 0.0 {
            gap += two_pi;
        }
        while gap > two_pi {
            gap -= two_pi;
        }
        if gap < best_gap {
            best_gap = gap;
            best = edge as i32;
        }
    }
    return best;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn directed_graph_trace_rings(graph: &mut DirectedGraph) -> Vec<Vec<f64>> {
    let mut rings: Vec<Vec<f64>> = Vec::new();
    for start in 0..graph.edge_from.len() {
        if graph.used[start] {
            continue;
        }
        let ring = directed_graph_walk(graph, start);
        if let Some(r) = ring {
            if r.len() >= 6 {
                rings.push(r);
            }
        }
    }
    return rings;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
// The vertex for snapped-vertex `id`, created at `(x, y)` when the id first occurs. Ids arrive in
// first-occurrence order, so a new id is always the next vertex index.
fn directed_graph_vertex(graph: &mut DirectedGraph, id: usize, x: f64, y: f64) -> usize {
    if id == graph.xs.len() {
        graph.xs.push(x);
        graph.ys.push(y);
        graph.outgoing.push(Vec::new());
    }
    return id;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn directed_graph_walk(graph: &mut DirectedGraph, start_edge: usize) -> Option<Vec<f64>> {
    let mut ring: Vec<f64> = Vec::new();
    let mut edge = start_edge;
    let mut guard: usize = 0;
    let limit = graph.edge_from.len() + 2;
    while guard < limit {
        guard += 1;
        graph.used[edge] = true;
        let from = graph.edge_from[edge];
        ring.push(graph.xs[from]);
        ring.push(graph.ys[from]);
        let to = graph.edge_to[edge];
        let next = directed_graph_next_edge(graph, to, from);
        if next < 0 || next as usize == start_edge || graph.used[next as usize] {
            break;
        }
        edge = next as usize;
    }
    return Some(ring);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn divide_if_interior(
    events: &mut Vec<SweepEvent>,
    heap: &mut EventHeap,
    vertex_snap: f64,
    le: usize,
    x: f64,
    y: f64,
) {
    let other = get_other_event(&*events, le);
    let le_x = events[le].x;
    let le_y = events[le].y;
    let other_x = events[other].x;
    let other_y = events[other].y;
    if point_strictly_inside(le_x, le_y, other_x, other_y, x, y, vertex_snap) {
        divide_segment(events, heap, le, x, y);
    }
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Splits `le` at interior point (x, y).
fn divide_segment(events: &mut Vec<SweepEvent>, heap: &mut EventHeap, le: usize, x: f64, y: f64) {
    let is_subject = events[le].is_subject;
    let winding_delta = events[le].winding_delta;
    let right = get_other_event(&*events, le);

    let new_right = create_event(events, x, y, is_subject);
    let new_left = create_event(events, x, y, is_subject);

    events[new_right].left = false;
    events[new_right].other_event = Some(le);
    events[new_left].left = true;
    events[new_left].other_event = Some(right);
    events[new_left].winding_delta = winding_delta;

    events[le].other_event = Some(new_right);
    events[right].other_event = Some(new_left);

    event_heap_push(heap, &events, new_left);
    event_heap_push(heap, &events, new_right);
}

fn event_heap_is_empty(heap: &EventHeap) -> bool {
    return heap.length == 0;
}

fn event_heap_pop(heap: &mut EventHeap, events: &[SweepEvent]) -> usize {
    let top = heap.data[0];
    heap.length -= 1;
    let last = heap.data[heap.length];
    if heap.length > 0 {
        heap.data[0] = last;
        let mut i: usize = 0;
        let n = heap.length;
        loop {
            let left = i * 2 + 1;
            let right = left + 1;
            let mut smallest = i;
            if left < n && compare_events(events, heap.data[left], heap.data[smallest]) < 0 {
                smallest = left;
            }
            if right < n && compare_events(events, heap.data[right], heap.data[smallest]) < 0 {
                smallest = right;
            }
            if smallest == i {
                break;
            }
            heap.data.swap(i, smallest);
            i = smallest;
        }
    }
    return top;
}

fn event_heap_push(heap: &mut EventHeap, events: &[SweepEvent], event: usize) {
    if heap.length < heap.data.len() {
        heap.data[heap.length] = event;
    } else {
        heap.data.push(event);
    }
    heap.length += 1;
    let mut i = heap.length - 1;
    while i > 0 {
        let parent = (i - 1) >> 1;
        if compare_events(events, heap.data[i], heap.data[parent]) < 0 {
            heap.data.swap(i, parent);
            i = parent;
        } else {
            break;
        }
    }
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Appends every edge of every contour as a left/right event pair.
fn fill_queue(
    contours: &[Vec<f64>],
    is_subject: bool,
    events: &mut Vec<SweepEvent>,
    heap: &mut EventHeap,
    vertex_snap: f64,
) {
    for contour in contours {
        let mut count = contour.len() >> 1;
        if count < 2 {
            continue;
        }
        if approx_equal(contour[0], contour[(count - 1) * 2], vertex_snap)
            && approx_equal(contour[1], contour[(count - 1) * 2 + 1], vertex_snap)
        {
            count -= 1;
        }
        if count < 3 {
            continue;
        }
        for i in 0..count {
            let ax = contour[i * 2];
            let ay = contour[i * 2 + 1];
            let j = (i + 1) % count;
            let bx = contour[j * 2];
            let by = contour[j * 2 + 1];
            if approx_equal(ax, bx, vertex_snap) && approx_equal(ay, by, vertex_snap) {
                continue;
            }
            add_edge(ax, ay, bx, by, is_subject, events, heap);
        }
    }
}

fn find_status(status: &[usize], event: usize) -> i32 {
    for i in 0..status.len() {
        if status[i] == event {
            return i as i32;
        }
    }
    return -1;
}

// Numbers each `stride`-wide key of `keys` so equal keys share one id and ids increase in the order
// keys first occur, as a lookup-or-insert hash map assigns them, by sorting instead of hashing.
fn first_occurrence_ids(keys: &[i64], stride: usize) -> Vec<usize> {
    let count = keys.len() / stride;
    let mut order: Vec<usize> = Vec::new();
    for position in 0..count {
        order.push(position);
    }
    order.sort_by(|a, b| compare_snapped_keys(keys, stride, *a, *b));
    let mut first: Vec<usize> = vec![0; count];
    let mut group_start = 0;
    for rank in 0..count {
        if !snapped_keys_equal(keys, stride, order[group_start], order[rank]) {
            group_start = rank;
        }
        first[order[rank]] = order[group_start];
    }
    let mut ids: Vec<usize> = vec![0; count];
    let mut next = 0;
    for position in 0..count {
        if first[position] == position {
            ids[position] = next;
            next += 1;
        } else {
            ids[position] = ids[first[position]];
        }
    }
    return ids;
}

fn get_other_event(events: &[SweepEvent], event: usize) -> usize {
    return match events[event].other_event {
        Some(other) => other,
        None => throw_error(
            "Sweep event entered the Martinez queue before its endpoint pair was linked",
        ),
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathBooleanFillRule string union; TS exports no get_/parse_ free functions
pub fn get_path_boolean_fill_rule_string(value: PathBooleanFillRule) -> &'static str {
    return match value {
        PathBooleanFillRule::EvenOdd => "evenOdd",
        PathBooleanFillRule::NonZero => "nonZero",
        PathBooleanFillRule::Negative => "negative",
        PathBooleanFillRule::Positive => "positive",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathBooleanOperation string union; TS exports no get_/parse_ free functions
pub fn get_path_boolean_operation_string(value: PathBooleanOperation) -> &'static str {
    return match value {
        PathBooleanOperation::Difference => "difference",
        PathBooleanOperation::Intersection => "intersection",
        PathBooleanOperation::Union => "union",
        PathBooleanOperation::Xor => "xor",
    };
}

fn insert_status(status: &mut Vec<usize>, events: &[SweepEvent], event: usize) -> usize {
    let mut lo: usize = 0;
    let mut hi: usize = status.len();
    while lo < hi {
        let mid = (lo + hi) >> 1;
        if compare_segments(events, status[mid], event) < 0 {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    status.push(event);
    let mut shift = status.len() - 1;
    while shift > lo {
        status[shift] = status[shift - 1];
        shift -= 1;
    }
    status[lo] = event;
    return lo;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// True when segment `le` passes strictly below point (x, y).
fn is_below(events: &[SweepEvent], le: usize, x: f64, y: f64) -> bool {
    let other = get_other_event(events, le);
    return if events[le].left {
        signed_area(
            events[le].x,
            events[le].y,
            events[other].x,
            events[other].y,
            x,
            y,
        ) > 0.0
    } else {
        signed_area(
            events[other].x,
            events[other].y,
            events[le].x,
            events[le].y,
            x,
            y,
        ) > 0.0
    };
}

fn is_inside(winding: i32, fill_rule: PathBooleanFillRule) -> bool {
    return match fill_rule {
        PathBooleanFillRule::EvenOdd => (winding.abs() & 1) == 1,
        PathBooleanFillRule::Positive => winding > 0,
        PathBooleanFillRule::Negative => winding < 0,
        PathBooleanFillRule::NonZero => winding != 0,
    };
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
// Pipeline stage 2a: merges coincident sub-segments.
fn merge_coincident_segments(
    segments: &[ArrangementSegment],
    vertex_snap: f64,
) -> Vec<UniqueSegment> {
    let mut oriented: Vec<f64> = Vec::new();
    let mut keys: Vec<i64> = Vec::new();
    for seg in segments {
        let mut ax = seg.ax;
        let mut ay = seg.ay;
        let mut bx = seg.bx;
        let mut by = seg.by;
        if point_order(ax, ay, bx, by) > 0 {
            ax = seg.bx;
            ay = seg.by;
            bx = seg.ax;
            by = seg.ay;
        }
        oriented.push(ax);
        oriented.push(ay);
        oriented.push(bx);
        oriented.push(by);
        keys.push(snap(ax, vertex_snap));
        keys.push(snap(ay, vertex_snap));
        keys.push(snap(bx, vertex_snap));
        keys.push(snap(by, vertex_snap));
    }
    let ids = first_occurrence_ids(&keys, 4);
    let mut unique: Vec<UniqueSegment> = Vec::new();
    for index in 0..segments.len() {
        let seg = &segments[index];
        let idx = ids[index];
        if idx < unique.len() {
            if seg.is_subject {
                unique[idx].subject_delta += seg.winding_delta;
            } else {
                unique[idx].clip_delta += seg.winding_delta;
            }
        } else {
            let ax = oriented[index * 4];
            let ay = oriented[index * 4 + 1];
            let bx = oriented[index * 4 + 2];
            let by = oriented[index * 4 + 3];
            unique.push(UniqueSegment {
                ax,
                ay,
                bx,
                by,
                subject_delta: if seg.is_subject { seg.winding_delta } else { 0 },
                clip_delta: if seg.is_subject { 0 } else { seg.winding_delta },
            });
        }
    }
    return unique;
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathBooleanFillRule string union; TS exports no get_/parse_ free functions
pub fn parse_path_boolean_fill_rule(value: &str) -> Option<PathBooleanFillRule> {
    return match value {
        "evenOdd" => Some(PathBooleanFillRule::EvenOdd),
        "nonZero" => Some(PathBooleanFillRule::NonZero),
        "negative" => Some(PathBooleanFillRule::Negative),
        "positive" => Some(PathBooleanFillRule::Positive),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathBooleanOperation string union; TS exports no get_/parse_ free functions
pub fn parse_path_boolean_operation(value: &str) -> Option<PathBooleanOperation> {
    return match value {
        "difference" => Some(PathBooleanOperation::Difference),
        "intersection" => Some(PathBooleanOperation::Intersection),
        "union" => Some(PathBooleanOperation::Union),
        "xor" => Some(PathBooleanOperation::Xor),
        _ => None,
    };
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn point_on_endpoint_coords(
    le_x: f64,
    le_y: f64,
    other_x: f64,
    other_y: f64,
    x: f64,
    y: f64,
    vertex_snap: f64,
) -> bool {
    return (approx_equal(le_x, x, vertex_snap) && approx_equal(le_y, y, vertex_snap))
        || (approx_equal(other_x, x, vertex_snap) && approx_equal(other_y, y, vertex_snap));
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn point_order(ax: f64, ay: f64, bx: f64, by: f64) -> i32 {
    if ax < bx {
        return -1;
    }
    if ax > bx {
        return 1;
    }
    if ay < by {
        return -1;
    }
    if ay > by {
        return 1;
    }
    return 0;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn point_strictly_inside(
    lx: f64,
    ly: f64,
    rx: f64,
    ry: f64,
    x: f64,
    y: f64,
    vertex_snap: f64,
) -> bool {
    if (approx_equal(lx, x, vertex_snap) && approx_equal(ly, y, vertex_snap))
        || (approx_equal(rx, x, vertex_snap) && approx_equal(ry, y, vertex_snap))
    {
        return false;
    }
    let cross = (rx - lx) * (y - ly) - (ry - ly) * (x - lx);
    let len_sq = (rx - lx) * (rx - lx) + (ry - ly) * (ry - ly);
    if cross * cross > INTERSECTION_EPS * len_sq * len_sq {
        return false;
    }
    let dot = (x - lx) * (rx - lx) + (y - ly) * (ry - ly);
    return dot > 0.0 && dot < len_sq;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Reshapes the arrangement so two status-neighbor segments only ever meet at
/// shared endpoints.
fn possible_intersection(
    events: &mut Vec<SweepEvent>,
    heap: &mut EventHeap,
    vertex_snap: f64,
    le1: usize,
    le2: usize,
) {
    let le1_other = get_other_event(&*events, le1);
    let le2_other = get_other_event(&*events, le2);

    let le1_x = events[le1].x;
    let le1_y = events[le1].y;
    let le1_other_x = events[le1_other].x;
    let le1_other_y = events[le1_other].y;
    let le2_x = events[le2].x;
    let le2_y = events[le2].y;
    let le2_other_x = events[le2_other].x;
    let le2_other_y = events[le2_other].y;

    let inter = segment_intersection(
        le1_x,
        le1_y,
        le1_other_x,
        le1_other_y,
        le2_x,
        le2_y,
        le2_other_x,
        le2_other_y,
    );
    if inter.is_none() {
        return;
    }
    let inter = inter.unwrap();

    if inter.len() == 1 {
        let ix = inter[0].0;
        let iy = inter[0].1;
        let on1 =
            point_on_endpoint_coords(le1_x, le1_y, le1_other_x, le1_other_y, ix, iy, vertex_snap);
        if !on1 {
            divide_segment(events, heap, le1, ix, iy);
        }
        let on2 =
            point_on_endpoint_coords(le2_x, le2_y, le2_other_x, le2_other_y, ix, iy, vertex_snap);
        if !on2 {
            divide_segment(events, heap, le2, ix, iy);
        }
        return;
    }

    // Collinear overlap: split each segment at the other's strictly-interior endpoints.
    divide_if_interior(events, heap, vertex_snap, le1, le2_x, le2_y);
    divide_if_interior(events, heap, vertex_snap, le1, le2_other_x, le2_other_y);
    divide_if_interior(events, heap, vertex_snap, le2, le1_x, le1_y);
    divide_if_interior(events, heap, vertex_snap, le2, le1_other_x, le1_other_y);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn record_segment(
    events: &[SweepEvent],
    left_event: usize,
    right_event: usize,
    segments: &mut Vec<ArrangementSegment>,
    vertex_snap: f64,
) {
    if !events[left_event].left {
        return;
    }
    if approx_equal(events[left_event].x, events[right_event].x, vertex_snap)
        && approx_equal(events[left_event].y, events[right_event].y, vertex_snap)
    {
        return;
    }
    segments.push(ArrangementSegment {
        ax: events[left_event].x,
        ay: events[left_event].y,
        bx: events[right_event].x,
        by: events[right_event].y,
        is_subject: events[left_event].is_subject,
        winding_delta: events[left_event].winding_delta,
    });
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Returns None, a single intersection point, or the two endpoints of a collinear
/// overlap.
fn segment_intersection(
    a1x: f64,
    a1y: f64,
    a2x: f64,
    a2y: f64,
    b1x: f64,
    b1y: f64,
    b2x: f64,
    b2y: f64,
) -> Option<Vec<(f64, f64)>> {
    let vax = a2x - a1x;
    let vay = a2y - a1y;
    let vbx = b2x - b1x;
    let vby = b2y - b1y;
    let ex = b1x - a1x;
    let ey = b1y - a1y;
    let kross = vax * vby - vay * vbx;
    let sqr_kross = kross * kross;
    let sqr_len_a = vax * vax + vay * vay;
    let sqr_len_b = vbx * vbx + vby * vby;

    if sqr_kross > INTERSECTION_EPS * sqr_len_a * sqr_len_b {
        let s = (ex * vby - ey * vbx) / kross;
        if s < 0.0 || s > 1.0 {
            return None;
        }
        let t = (ex * vay - ey * vax) / kross;
        if t < 0.0 || t > 1.0 {
            return None;
        }
        return Some(vec![(a1x + s * vax, a1y + s * vay)]);
    }

    let kross_e = ex * vay - ey * vax;
    if kross_e * kross_e > INTERSECTION_EPS * sqr_len_a * (ex * ex + ey * ey) {
        return None;
    }

    let sa = (ex * vax + ey * vay) / sqr_len_a;
    let sb = sa + (vbx * vax + vby * vay) / sqr_len_a;
    let lo = f64::max(0.0, f64::min(sa, sb));
    let hi = f64::min(1.0, f64::max(sa, sb));
    if lo > hi + 1e-12 {
        return None;
    }
    if (lo - hi).abs() <= 1e-12 {
        return Some(vec![(a1x + lo * vax, a1y + lo * vay)]);
    }
    return Some(vec![
        (a1x + lo * vax, a1y + lo * vay),
        (a1x + hi * vax, a1y + hi * vay),
    ]);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// > 0 when (p0, p1, p2) turn counterclockwise.
fn signed_area(p0x: f64, p0y: f64, p1x: f64, p1y: f64, p2x: f64, p2y: f64) -> f64 {
    return (p0x - p2x) * (p1y - p2y) - (p1x - p2x) * (p0y - p2y);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
fn snap(v: f64, vertex_snap: f64) -> i64 {
    return (v / vertex_snap).round() as i64;
}

fn snapped_keys_equal(keys: &[i64], stride: usize, a: usize, b: usize) -> bool {
    for offset in 0..stride {
        if keys[a * stride + offset] != keys[b * stride + offset] {
            return false;
        }
    }
    return true;
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
// Pipeline stage 2c: traces kept segments into closed rings.
fn trace_rings(edges: &[[f64; 4]], vertex_snap: f64) -> Vec<Vec<f64>> {
    let mut keys: Vec<i64> = Vec::new();
    for e in edges {
        keys.push(snap(e[0], vertex_snap));
        keys.push(snap(e[1], vertex_snap));
        keys.push(snap(e[2], vertex_snap));
        keys.push(snap(e[3], vertex_snap));
    }
    let ids = first_occurrence_ids(&keys, 2);
    let mut graph = directed_graph_new();
    for index in 0..edges.len() {
        directed_graph_add_edge(
            &mut graph,
            ids[index * 2],
            ids[index * 2 + 1],
            &edges[index],
        );
    }
    return directed_graph_trace_rings(&mut graph);
}

// flight-lint: allow(f64) Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured
/// Winding number of one operand at (px, py).
fn winding_at(unique: &[UniqueSegment], px: f64, py: f64, subject: bool) -> i32 {
    let mut winding: i32 = 0;
    for v in unique {
        let lox = f64::min(v.ax, v.bx);
        let hix = f64::max(v.ax, v.bx);
        if px < lox || px >= hix {
            continue;
        }
        let t = (px - v.ax) / (v.bx - v.ax);
        let y_at = v.ay + t * (v.by - v.ay);
        if y_at < py {
            winding += if subject {
                v.subject_delta
            } else {
                v.clip_delta
            };
        }
    }
    return winding;
}

impl Default for PathBooleanKernel {
    fn default() -> Self {
        return PathBooleanKernel {
            runtime: EntityRuntimeSlot::default(),
            compute_path_boolean: compute_empty_path_boolean,
        };
    }
}

impl PathBooleanKernel {
    /// The Martinez kernel (`create_martinez_path_boolean_kernel`).
    pub fn new() -> Self {
        return create_martinez_path_boolean_kernel();
    }
}
