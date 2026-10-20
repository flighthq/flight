use crate::layout_state::register_layout_resolver;
use crate::types::*;

fn finite_size(value: f32) -> f32 {
    return if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    };
}

fn get_grid_auto_track_size(
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    container: &GridLayoutContainerStyle,
    columns: bool,
    track_index: usize,
) -> f32 {
    let tracks = if columns {
        &container.columns
    } else {
        &container.rows
    };
    let mut size: f32 = 0.0;
    for i in 0..tree.nodes.len() {
        let node = &tree.nodes[i];
        if node.parent_index != parent_index as i32 || !is_grid_item_style_valid(&node.item_style)
        {
            continue;
        }
        let item = match &node.item_style {
            ItemStyle::Grid(s) => Some(s),
            _ => None,
        };
        let start = if columns {
            get_grid_column(tree, parent_index, i, container.columns.len())
        } else {
            get_grid_row(tree, parent_index, i, container.columns.len())
        };
        let span = if columns {
            item.and_then(|s| s.column_span).unwrap_or(1)
        } else {
            item.and_then(|s| s.row_span).unwrap_or(1)
        };
        if (track_index as i32) < start || (track_index as i32) >= start + span {
            continue;
        }
        let mut auto_tracks_in_span = 0;
        let end = std::cmp::min((start + span) as usize, tracks.len());
        for j in (start as usize)..end {
            if matches!(tracks[j], GridLayoutTrack::Auto) {
                auto_tracks_in_span += 1;
            }
        }
        if auto_tracks_in_span > 0 {
            let mut remaining_intrinsic =
                finite_size(intrinsic_sizes[i * 2 + if columns { 0 } else { 1 }]);
            let gap = if columns {
                container.column_gap.unwrap_or(0.0)
            } else {
                container.row_gap.unwrap_or(0.0)
            };
            remaining_intrinsic -= gap * f32::max(0.0, (span - 1) as f32);
            for j in (start as usize)..end {
                if let GridLayoutTrack::Fixed { size: s } = &tracks[j] {
                    remaining_intrinsic -= s;
                }
            }
            size = f32::max(
                size,
                f32::max(0.0, remaining_intrinsic) / auto_tracks_in_span as f32,
            );
        }
    }
    return size;
}

fn get_grid_column(
    tree: &LayoutTree,
    parent_index: usize,
    child_index: usize,
    column_count: usize,
) -> i32 {
    let item = match &tree.nodes[child_index].item_style {
        ItemStyle::Grid(s) => Some(s),
        _ => None,
    };
    if let Some(c) = item.and_then(|s| s.column) {
        return c;
    }
    return get_grid_ordinal(tree, parent_index, child_index) % column_count as i32;
}

fn get_grid_ordinal(
    tree: &LayoutTree,
    parent_index: usize,
    child_index: usize,
) -> i32 {
    let mut ordinal: i32 = 0;
    for i in 0..child_index {
        if tree.nodes[i].parent_index == parent_index as i32 {
            ordinal += 1;
        }
    }
    return ordinal;
}

fn get_grid_row(
    tree: &LayoutTree,
    parent_index: usize,
    child_index: usize,
    column_count: usize,
) -> i32 {
    let item = match &tree.nodes[child_index].item_style {
        ItemStyle::Grid(s) => Some(s),
        _ => None,
    };
    if let Some(r) = item.and_then(|s| s.row) {
        return r;
    }
    return get_grid_ordinal(tree, parent_index, child_index) / column_count as i32;
}

#[allow(clippy::too_many_arguments)]
fn get_grid_track_size(
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    container: &GridLayoutContainerStyle,
    columns: bool,
    track_index: usize,
    available_size: f32,
    gap: f32,
) -> f32 {
    let tracks = if columns {
        &container.columns
    } else {
        &container.rows
    };
    let track = &tracks[track_index];
    match track {
        GridLayoutTrack::Fixed { size } => return *size,
        GridLayoutTrack::Auto => {
            return get_grid_auto_track_size(
                tree,
                intrinsic_sizes,
                parent_index,
                container,
                columns,
                track_index,
            );
        }
        GridLayoutTrack::Fraction { fraction } => {
            let mut occupied =
                gap * f32::max(0.0, (tracks.len() as i32 - 1) as f32);
            let mut total_fraction: f32 = 0.0;
            for i in 0..tracks.len() {
                match &tracks[i] {
                    GridLayoutTrack::Fixed { size } => occupied += size,
                    GridLayoutTrack::Auto => {
                        occupied += get_grid_auto_track_size(
                            tree,
                            intrinsic_sizes,
                            parent_index,
                            container,
                            columns,
                            i,
                        );
                    }
                    GridLayoutTrack::Fraction { fraction: f } => {
                        total_fraction += f;
                    }
                }
            }
            return if total_fraction == 0.0 {
                0.0
            } else {
                (f32::max(0.0, available_size - occupied) * fraction) / total_fraction
            };
        }
    }
}

fn grid_layout_resolver(
    out: &mut [f32],
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    child_index: usize,
) -> Option<LayoutResolutionFailureKind> {
    let container = match &tree.nodes[parent_index].container_style {
        ContainerStyle::Grid(c) if is_valid_grid_container(c) => c,
        _ => return Some(LayoutResolutionFailureKind::InvalidContainerStyle),
    };
    match &tree.nodes[child_index].item_style {
        ItemStyle::None => {}
        ItemStyle::Grid(s) if is_valid_grid_item(s) => {}
        _ => return Some(LayoutResolutionFailureKind::InvalidItemStyle),
    }

    let item = match &tree.nodes[child_index].item_style {
        ItemStyle::Grid(s) => Some(s),
        _ => None,
    };

    let column = get_grid_column(tree, parent_index, child_index, container.columns.len());
    let row = get_grid_row(tree, parent_index, child_index, container.columns.len());
    let column_span = item.and_then(|s| s.column_span).unwrap_or(1);
    let row_span = item.and_then(|s| s.row_span).unwrap_or(1);
    if column < 0
        || row < 0
        || column + column_span > container.columns.len() as i32
        || row + row_span > container.rows.len() as i32
    {
        return Some(LayoutResolutionFailureKind::InvalidItemStyle);
    }

    let parent_offset = parent_index * 4;
    let padding_left = container.padding_left.unwrap_or(0.0);
    let padding_right = container.padding_right.unwrap_or(0.0);
    let padding_top = container.padding_top.unwrap_or(0.0);
    let padding_bottom = container.padding_bottom.unwrap_or(0.0);
    let column_gap = container.column_gap.unwrap_or(0.0);
    let row_gap = container.row_gap.unwrap_or(0.0);
    let available_width =
        f32::max(0.0, out[parent_offset + 2] - padding_left - padding_right);
    let available_height =
        f32::max(0.0, out[parent_offset + 3] - padding_top - padding_bottom);

    let mut x = out[parent_offset] + padding_left;
    for i in 0..(column as usize) {
        x += get_grid_track_size(
            tree,
            intrinsic_sizes,
            parent_index,
            container,
            true,
            i,
            available_width,
            column_gap,
        );
        x += column_gap;
    }
    let mut width = column_gap * f32::max(0.0, (column_span - 1) as f32);
    for i in (column as usize)..((column + column_span) as usize) {
        width += get_grid_track_size(
            tree,
            intrinsic_sizes,
            parent_index,
            container,
            true,
            i,
            available_width,
            column_gap,
        );
    }

    let mut y = out[parent_offset + 1] + padding_top;
    for i in 0..(row as usize) {
        y += get_grid_track_size(
            tree,
            intrinsic_sizes,
            parent_index,
            container,
            false,
            i,
            available_height,
            row_gap,
        );
        y += row_gap;
    }
    let mut height = row_gap * f32::max(0.0, (row_span - 1) as f32);
    for i in (row as usize)..((row + row_span) as usize) {
        height += get_grid_track_size(
            tree,
            intrinsic_sizes,
            parent_index,
            container,
            false,
            i,
            available_height,
            row_gap,
        );
    }

    let child_offset = child_index * 4;
    out[child_offset] = x;
    out[child_offset + 1] = y;
    out[child_offset + 2] = width;
    out[child_offset + 3] = height;
    return None;
}

fn is_grid_item_style_valid(item_style: &ItemStyle) -> bool {
    return match item_style {
        ItemStyle::None => true,
        ItemStyle::Grid(s) => is_valid_grid_item(s),
        _ => false,
    };
}

fn is_non_negative_optional(value: Option<f32>) -> bool {
    return match value {
        None => true,
        Some(v) => v.is_finite() && v >= 0.0,
    };
}

fn is_valid_grid_container(c: &GridLayoutContainerStyle) -> bool {
    return is_valid_track_list(&c.columns)
        && is_valid_track_list(&c.rows)
        && is_non_negative_optional(c.column_gap)
        && is_non_negative_optional(c.padding_bottom)
        && is_non_negative_optional(c.padding_left)
        && is_non_negative_optional(c.padding_right)
        && is_non_negative_optional(c.padding_top)
        && is_non_negative_optional(c.row_gap);
}

fn is_valid_grid_item(s: &GridLayoutItemStyle) -> bool {
    let has_column = s.column.is_some();
    let has_row = s.row.is_some();
    if has_column != has_row {
        return false;
    }
    if let Some(c) = s.column {
        if c < 0 {
            return false;
        }
    }
    if let Some(cs) = s.column_span {
        if cs < 1 {
            return false;
        }
    }
    if let Some(r) = s.row {
        if r < 0 {
            return false;
        }
    }
    if let Some(rs) = s.row_span {
        if rs < 1 {
            return false;
        }
    }
    return true;
}

fn is_valid_track_list(tracks: &[GridLayoutTrack]) -> bool {
    if tracks.is_empty() {
        return false;
    }
    for track in tracks {
        match track {
            GridLayoutTrack::Auto => {}
            GridLayoutTrack::Fixed { size } => {
                if !size.is_finite() || *size < 0.0 {
                    return false;
                }
            }
            GridLayoutTrack::Fraction { fraction } => {
                if !fraction.is_finite() || *fraction <= 0.0 {
                    return false;
                }
            }
        }
    }
    return true;
}

pub fn register_grid_layout_resolver(state: &mut LayoutState) {
    register_layout_resolver(state, GRID_LAYOUT_KIND, Some(grid_layout_resolver));
}
