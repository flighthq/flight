use std::cmp::Ordering;

/// The heuristic used by the MaxRects bin packing algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BinPackHeuristic {
    #[default]
    BestShortSideFit,
    BestAreaFit,
}

/// A rectangle identifier: either a numeric index or a textual name.
/// Maps to the TS `RectangleId = number | string` union.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RectangleId {
    Number(i32),
    Text(String),
}

/// Options controlling the bin packing algorithm.
#[derive(Debug, Clone)]
pub struct BinPackOptions {
    pub padding: f32,
    pub border: f32,
    pub allow_rotation: bool,
    pub heuristic: BinPackHeuristic,
    pub growable: bool,
    pub power_of_two: bool,
    pub square: bool,
    pub max_width: f32,
    pub max_height: f32,
}

/// The result of a bin packing operation: the placed rectangles, the bin extents, and the ids of
/// rectangles that did not fit.
#[derive(Debug, Clone, PartialEq)]
pub struct PackResult {
    pub placements: Vec<PackedRectangle>,
    pub width: f32,
    pub height: f32,
    pub unpacked: Vec<RectangleId>,
}

/// A rectangle to be packed: its identity and dimensions.
#[derive(Debug, Clone)]
pub struct PackableRectangle {
    pub id: RectangleId,
    pub width: f32,
    pub height: f32,
}

/// A placed rectangle in the output: position, dimensions (possibly swapped if rotated), and
/// whether it was turned 90 degrees.
#[derive(Debug, Clone, PartialEq)]
pub struct PackedRectangle {
    pub id: RectangleId,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotated: bool,
}

/// A free rectangle of unoccupied bin space, in the packer's internal "effective" coordinate space.
/// Mutated in place as free space is split and pruned.
#[derive(Clone, Copy)]
struct FreeRectangle {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

/// The chosen placement for one rectangle: its top-left corner in effective space, the effective
/// footprint size occupied (rectangle size plus the trailing padding gutter), and whether it was
/// rotated 90 degrees.
struct Placement {
    x: f32,
    y: f32,
    footprint_width: f32,
    footprint_height: f32,
    rotated: bool,
}

/// The intermediate result from packing into a fixed-size bin.
struct BinPackAttempt {
    placements: Vec<PackedRectangle>,
    unpacked: Vec<RectangleId>,
}

pub fn create_bin_pack_options() -> BinPackOptions {
    return BinPackOptions {
        padding: 0.0,
        border: 0.0,
        allow_rotation: false,
        heuristic: BinPackHeuristic::BestShortSideFit,
        growable: true,
        power_of_two: false,
        square: false,
        max_width: BIN_PACK_DEFAULT_MAX_EXTENT,
        max_height: BIN_PACK_DEFAULT_MAX_EXTENT,
    };
}

pub fn create_pack_result(
    placements: Vec<PackedRectangle>,
    width: f32,
    height: f32,
    unpacked: Vec<RectangleId>,
) -> PackResult {
    let mut out = PackResult {
        placements: Vec::new(),
        width: 0.0,
        height: 0.0,
        unpacked: Vec::new(),
    };
    initialize_pack_result(&mut out, placements, width, height, unpacked);
    return out;
}

pub fn create_packable_rectangle(id: RectangleId, width: f32, height: f32) -> PackableRectangle {
    let mut out = PackableRectangle {
        id: RectangleId::Number(0),
        width: 0.0,
        height: 0.0,
    };
    initialize_packable_rectangle(&mut out, id, width, height);
    return out;
}

pub fn create_packed_rectangle(
    id: RectangleId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    rotated: bool,
) -> PackedRectangle {
    let mut out = PackedRectangle {
        id: RectangleId::Number(0),
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
        rotated: false,
    };
    initialize_packed_rectangle(&mut out, id, x, y, width, height, rotated);
    return out;
}

pub fn initialize_pack_result(
    out: &mut PackResult,
    placements: Vec<PackedRectangle>,
    width: f32,
    height: f32,
    unpacked: Vec<RectangleId>,
) {
    out.placements = placements;
    out.width = width;
    out.height = height;
    out.unpacked = unpacked;
}

pub fn initialize_packable_rectangle(
    out: &mut PackableRectangle,
    id: RectangleId,
    width: f32,
    height: f32,
) {
    out.id = id;
    out.width = width;
    out.height = height;
}

pub fn initialize_packed_rectangle(
    out: &mut PackedRectangle,
    id: RectangleId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    rotated: bool,
) {
    out.id = id;
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
    out.rotated = rotated;
}

/// Fraction of the reported bin actually covered by placements, in [0, 1]. Placed area over
/// `width * height`; 0 for an empty or zero-extent result rather than NaN, since "nothing packed"
/// is an expected outcome and not a division error the caller should have to guard.
///
/// Measures the REPORTED extent, so power-of-two or square rounding shows up as the padding waste
/// it is -- which is usually the number a caller comparing packings wants to see.
pub fn get_pack_result_occupancy(result: &PackResult) -> f32 {
    let area = result.width * result.height;
    if area <= 0.0 {
        return 0.0;
    }
    let mut placed = 0.0_f32;
    for placement in &result.placements {
        placed += placement.width * placement.height;
    }
    return placed / area;
}

/// Places a set of rectangles without overlap into a bin using the MaxRects algorithm with the
/// Best-Short-Side-Fit (BSSF) heuristic, and reports each placement, the used bin extent, and any
/// ids that did not fit.
///
/// The result is deterministic: the same `rects` (by value) and `options` always produce an
/// identical `PackResult`. Inputs are sorted by descending area, then descending height, then
/// width, then id before placement -- a total order with no reliance on sort stability -- and no
/// random state is consulted.
///
/// Padding and border are honored geometrically: every pair of placements is at least `padding`
/// apart and every placement is at least `border` from the reported bin edge. When `allow_rotation`
/// is set, a rectangle may be turned 90 degrees (reported via `rotated` and swapped
/// `width`/`height`) if that fits better. A `growable` bin starts small and grows toward
/// `max_width`/`max_height`; a fixed bin overflows into `unpacked`. The reported `width`/`height`
/// is the tight used extent, then adjusted for `square` and `power_of_two` when those are set.
pub fn pack_rectangles(
    rects: &[PackableRectangle],
    options: Option<&BinPackOptions>,
) -> PackResult {
    let padding = options.map_or(0.0, |o| o.padding);
    let border = options.map_or(0.0, |o| o.border);
    let allow_rotation = options.map_or(false, |o| o.allow_rotation);
    let heuristic = options.map_or(BinPackHeuristic::BestShortSideFit, |o| o.heuristic);
    let growable = options.map_or(true, |o| o.growable);
    let power_of_two = options.map_or(false, |o| o.power_of_two);
    let square = options.map_or(false, |o| o.square);
    let max_width = options.map_or(BIN_PACK_DEFAULT_MAX_EXTENT, |o| o.max_width);
    let max_height = options.map_or(BIN_PACK_DEFAULT_MAX_EXTENT, |o| o.max_height);

    if rects.is_empty() {
        return create_pack_result(
            Vec::new(),
            finalize_extent(0.0, power_of_two),
            finalize_extent(0.0, power_of_two),
            Vec::new(),
        );
    }

    let mut degenerate: Vec<RectangleId> = Vec::new();
    let mut placeable: Vec<PackableRectangle> = Vec::new();
    for rect in rects {
        if rect.width > 0.0 && rect.height > 0.0 {
            placeable.push(PackableRectangle {
                id: rect.id.clone(),
                width: rect.width,
                height: rect.height,
            });
        } else {
            degenerate.push(rect.id.clone());
        }
    }
    if placeable.is_empty() {
        return create_pack_result(
            Vec::new(),
            finalize_extent(0.0, power_of_two),
            finalize_extent(0.0, power_of_two),
            degenerate,
        );
    }

    let sorted = sort_rectangles_for_packing(&placeable);

    let mut need_width = 2.0 * border;
    let mut need_height = 2.0 * border;
    let mut total_area = 0.0_f32;
    for rect in &sorted {
        let short_side = rect.width.min(rect.height);
        let required_width =
            (if allow_rotation { short_side } else { rect.width }) + 2.0 * border;
        let required_height =
            (if allow_rotation { short_side } else { rect.height }) + 2.0 * border;
        need_width = need_width.max(required_width);
        need_height = need_height.max(required_height);
        total_area += (rect.width + padding) * (rect.height + padding);
    }

    let seed = total_area.sqrt().ceil() + 2.0 * border;
    let mut bin_width = if growable {
        seed.max(need_width).min(max_width)
    } else {
        max_width
    };
    let mut bin_height = if growable {
        seed.max(need_height).min(max_height)
    } else {
        max_height
    };

    let mut attempt = pack_into_bin(
        &sorted,
        bin_width,
        bin_height,
        padding,
        border,
        allow_rotation,
        heuristic,
    );
    while !attempt.unpacked.is_empty()
        && growable
        && (bin_width < max_width || bin_height < max_height)
    {
        if bin_width <= bin_height && bin_width < max_width {
            bin_width = (bin_width * 2.0).min(max_width);
        } else if bin_height < max_height {
            bin_height = (bin_height * 2.0).min(max_height);
        } else {
            bin_width = (bin_width * 2.0).min(max_width);
        }
        attempt = pack_into_bin(
            &sorted,
            bin_width,
            bin_height,
            padding,
            border,
            allow_rotation,
            heuristic,
        );
    }

    let mut combined_unpacked = degenerate;
    combined_unpacked.extend(attempt.unpacked);
    let combined = BinPackAttempt {
        placements: attempt.placements,
        unpacked: combined_unpacked,
    };
    return finalize_result(combined, border, power_of_two, square);
}

/// Rounds `value` up to the next power of two (>= 1). Used only for the final `power_of_two`
/// adjustment.
fn ceil_to_power_of_two(value: f32) -> f32 {
    if value <= 1.0 {
        return 1.0;
    }
    let mut result = 1.0_f32;
    while result < value {
        result *= 2.0;
    }
    return result;
}

/// Orders two rectangle ids for the deterministic input sort: numbers before strings, numbers
/// ascending, strings lexicographically.
fn compare_rectangle_id(a: &RectangleId, b: &RectangleId) -> Ordering {
    let a_number = matches!(a, RectangleId::Number(_));
    let b_number = matches!(b, RectangleId::Number(_));
    if a_number && b_number {
        if let (RectangleId::Number(an), RectangleId::Number(bn)) = (a, b) {
            return an.cmp(bn);
        }
    }
    if a_number != b_number {
        return if a_number {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    if let (RectangleId::Text(a_str), RectangleId::Text(b_str)) = (a, b) {
        return a_str.cmp(b_str);
    }
    return Ordering::Equal;
}

/// Applies the `power_of_two` rounding (if set) to a single extent value.
fn finalize_extent(value: f32, power_of_two: bool) -> f32 {
    if power_of_two && value > 0.0 {
        return ceil_to_power_of_two(value);
    }
    return value;
}

/// Turns the raw placements from `pack_into_bin` into the public `PackResult`, shifting
/// effective-space coordinates back into bin space by `border` and finalizing the reported extent
/// for `square` / `power_of_two`.
fn finalize_result(
    packed: BinPackAttempt,
    border: f32,
    power_of_two: bool,
    square: bool,
) -> PackResult {
    let mut content_right = 0.0_f32;
    let mut content_bottom = 0.0_f32;
    for placement in &packed.placements {
        content_right = content_right.max(placement.x + placement.width);
        content_bottom = content_bottom.max(placement.y + placement.height);
    }

    let mut width = if !packed.placements.is_empty() {
        content_right + border
    } else {
        0.0
    };
    let mut height = if !packed.placements.is_empty() {
        content_bottom + border
    } else {
        0.0
    };

    if square {
        width = width.max(height);
        height = width;
    }
    width = finalize_extent(width, power_of_two);
    height = finalize_extent(height, power_of_two);
    if square {
        width = width.max(height);
        height = width;
    }

    return create_pack_result(packed.placements, width, height, packed.unpacked);
}

/// Best-Short-Side-Fit search: over every free rectangle (and, when rotation is allowed, both
/// orientations of the piece), pick the fit that leaves the smallest leftover short side, breaking
/// ties by smallest leftover long side, then by top-most / left-most free rectangle, then by the
/// unrotated orientation. Returns the chosen placement, or `None` when the piece fits nowhere.
///
/// `piece_width`/`piece_height` are the effective footprint (rectangle size plus the trailing
/// padding gutter) in the unrotated orientation.
fn find_best_placement(
    free: &[FreeRectangle],
    piece_width: f32,
    piece_height: f32,
    allow_rotation: bool,
    heuristic: BinPackHeuristic,
) -> Option<Placement> {
    let mut best: Option<Placement> = None;
    let mut best_primary = f32::INFINITY;
    let mut best_secondary = f32::INFINITY;

    for node in free {
        let max_rotated: i32 = if allow_rotation { 1 } else { 0 };
        for rotated in 0..=max_rotated {
            let width = if rotated == 1 {
                piece_height
            } else {
                piece_width
            };
            let height = if rotated == 1 {
                piece_width
            } else {
                piece_height
            };
            if width > node.width || height > node.height {
                continue;
            }

            let leftover_horizontal = node.width - width;
            let leftover_vertical = node.height - height;
            let short_side = leftover_horizontal.min(leftover_vertical);
            let long_side = leftover_horizontal.max(leftover_vertical);
            let primary = if heuristic == BinPackHeuristic::BestAreaFit {
                node.width * node.height - width * height
            } else {
                short_side
            };
            let secondary = if heuristic == BinPackHeuristic::BestAreaFit {
                short_side
            } else {
                long_side
            };

            if best.is_none()
                || primary < best_primary
                || (primary == best_primary && secondary < best_secondary)
            {
                best = Some(Placement {
                    x: node.x,
                    y: node.y,
                    footprint_width: width,
                    footprint_height: height,
                    rotated: rotated == 1,
                });
                best_primary = primary;
                best_secondary = secondary;
            }
        }
    }

    return best;
}

/// True when the whole of `a` lies within `b`, used to detect overlap for the intersection test.
fn intersects_rectangle(a: &FreeRectangle, b: &FreeRectangle) -> bool {
    return !(a.x + a.width <= b.x
        || b.x + b.width <= a.x
        || a.y + a.height <= b.y
        || b.y + b.height <= a.y);
}

/// True when the whole of `inner` lies within `outer` -- the containment test used to prune
/// redundant free rectangles after a split.
fn is_free_rectangle_contained(inner: &FreeRectangle, outer: &FreeRectangle) -> bool {
    return inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height;
}

/// Runs one MaxRects pass at a fixed bin size. Every rectangle is inflated to an "effective"
/// footprint of `(width + padding) x (height + padding)` -- the trailing gutter is what guarantees
/// at least `padding` between neighbors -- and packed into the effective usable region
/// `(bin_width - 2*border + padding) x (bin_height - 2*border + padding)`. This construction makes
/// the actual placement satisfy `x >= border` and `x + width <= bin_width - border` (likewise
/// vertically), so `border` is respected on every side while the last row/column's gutter costs no
/// real space.
fn pack_into_bin(
    sorted: &[PackableRectangle],
    bin_width: f32,
    bin_height: f32,
    padding: f32,
    border: f32,
    allow_rotation: bool,
    heuristic: BinPackHeuristic,
) -> BinPackAttempt {
    let usable_width = bin_width - 2.0 * border + padding;
    let usable_height = bin_height - 2.0 * border + padding;

    let mut placements: Vec<PackedRectangle> = Vec::new();
    let mut unpacked: Vec<RectangleId> = Vec::new();

    if usable_width <= 0.0 || usable_height <= 0.0 {
        for rect in sorted {
            unpacked.push(rect.id.clone());
        }
        return BinPackAttempt {
            placements,
            unpacked,
        };
    }

    let mut free: Vec<FreeRectangle> = vec![FreeRectangle {
        x: 0.0,
        y: 0.0,
        width: usable_width,
        height: usable_height,
    }];

    for rect in sorted {
        let piece_width = rect.width + padding;
        let piece_height = rect.height + padding;
        let placement =
            find_best_placement(&free, piece_width, piece_height, allow_rotation, heuristic);
        if placement.is_none() {
            unpacked.push(rect.id.clone());
            continue;
        }
        let placement = placement.unwrap();

        placements.push(create_packed_rectangle(
            rect.id.clone(),
            placement.x + border,
            placement.y + border,
            if placement.rotated {
                rect.height
            } else {
                rect.width
            },
            if placement.rotated {
                rect.width
            } else {
                rect.height
            },
            placement.rotated,
        ));

        split_free_rectangles(&mut free, &placement);
        prune_free_rectangles(&mut free);
    }

    return BinPackAttempt {
        placements,
        unpacked,
    };
}

/// Removes any free rectangle fully contained within another. MaxRects splitting can leave
/// redundant free rectangles nested inside larger ones; pruning them keeps the search cheap and the
/// free list non-redundant.
fn prune_free_rectangles(free: &mut Vec<FreeRectangle>) {
    let mut i: usize = 0;
    while i < free.len() {
        let mut j = i + 1;
        let mut i_removed = false;
        while j < free.len() {
            let fi = free[i];
            let fj = free[j];
            if is_free_rectangle_contained(&fi, &fj) {
                free.remove(i);
                i_removed = true;
                break;
            }
            if is_free_rectangle_contained(&fj, &fi) {
                free.remove(j);
            } else {
                j += 1;
            }
        }
        if !i_removed {
            i += 1;
        }
    }
}

/// Deterministic total order over the input rectangles: descending area, then descending height,
/// then descending width, then ascending id (numbers before strings; numbers numerically, strings
/// lexicographically). Returns a new vector; the input is not mutated.
fn sort_rectangles_for_packing(rects: &[PackableRectangle]) -> Vec<PackableRectangle> {
    let mut sorted: Vec<PackableRectangle> = rects.to_vec();
    sorted.sort_by(|a, b| {
        let area_a = a.width * a.height;
        let area_b = b.width * b.height;
        if area_a != area_b {
            return area_b
                .partial_cmp(&area_a)
                .unwrap_or(Ordering::Equal);
        }
        if a.height != b.height {
            return b.height
                .partial_cmp(&a.height)
                .unwrap_or(Ordering::Equal);
        }
        if a.width != b.width {
            return b.width
                .partial_cmp(&a.width)
                .unwrap_or(Ordering::Equal);
        }
        return compare_rectangle_id(&a.id, &b.id);
    });
    return sorted;
}

/// MaxRects splitting: for every free rectangle overlapping the just-placed footprint, replace it
/// with the (up to four) sub-rectangles covering the parts of it the footprint does not cover. The
/// footprint is the effective size (rectangle plus padding gutter), so the reserved padding is
/// carved out of the free space here.
fn split_free_rectangles(free: &mut Vec<FreeRectangle>, placement: &Placement) {
    let used_x = placement.x;
    let used_y = placement.y;
    let used_right = placement.x + placement.footprint_width;
    let used_bottom = placement.y + placement.footprint_height;
    let used = FreeRectangle {
        x: used_x,
        y: used_y,
        width: placement.footprint_width,
        height: placement.footprint_height,
    };

    let mut i = free.len() as i32 - 1;
    while i >= 0 {
        let idx = i as usize;
        let node = free[idx];
        if !intersects_rectangle(&node, &used) {
            i -= 1;
            continue;
        }

        let node_right = node.x + node.width;
        let node_bottom = node.y + node.height;
        free.remove(idx);

        if used_x > node.x {
            free.push(FreeRectangle {
                x: node.x,
                y: node.y,
                width: used_x - node.x,
                height: node.height,
            });
        }
        if used_right < node_right {
            free.push(FreeRectangle {
                x: used_right,
                y: node.y,
                width: node_right - used_right,
                height: node.height,
            });
        }
        if used_y > node.y {
            free.push(FreeRectangle {
                x: node.x,
                y: node.y,
                width: node.width,
                height: used_y - node.y,
            });
        }
        if used_bottom < node_bottom {
            free.push(FreeRectangle {
                x: node.x,
                y: used_bottom,
                width: node.width,
                height: node_bottom - used_bottom,
            });
        }

        i -= 1;
    }
}

impl std::fmt::Display for RectangleId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return match self {
            RectangleId::Number(n) => write!(f, "{}", n),
            RectangleId::Text(s) => write!(f, "{}", s),
        };
    }
}

/// The default width/height cap when `max_width`/`max_height` are unset -- large enough to be
/// effectively unbounded for typical inputs while keeping growth from running away.
pub const BIN_PACK_DEFAULT_MAX_EXTENT: f32 = 16384.0;
