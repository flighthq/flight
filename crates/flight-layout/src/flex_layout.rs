use crate::layout_state::register_layout_resolver;
use crate::types::*;

fn count_flex_siblings(
    tree: &LayoutTree,
    parent_index: usize,
    start_index: usize,
    end_index: usize,
) -> i32 {
    let mut count = 0;
    for i in start_index..end_index {
        if tree.nodes[i].parent_index == parent_index as i32 {
            count += 1;
        }
    }
    return count;
}

fn finite_size(value: f32) -> f32 {
    return if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    };
}

#[allow(clippy::too_many_lines, unused_assignments)]
fn flex_layout_resolver(
    out: &mut [f32],
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    child_index: usize,
) -> Option<LayoutResolutionFailureKind> {
    let container = match &tree.nodes[parent_index].container_style {
        ContainerStyle::None => None,
        ContainerStyle::Flex(c) if is_valid_flex_container(c) => Some(c),
        _ => return Some(LayoutResolutionFailureKind::InvalidContainerStyle),
    };
    match &tree.nodes[child_index].item_style {
        ItemStyle::None => {}
        ItemStyle::Flex(s) if is_valid_flex_item(s) => {}
        _ => return Some(LayoutResolutionFailureKind::InvalidItemStyle),
    }

    let direction = container
        .and_then(|c| c.direction)
        .unwrap_or(FlexLayoutDirection::Row);
    let wrap = container
        .and_then(|c| c.wrap)
        .unwrap_or(FlexLayoutWrap::NoWrap);
    let row =
        direction == FlexLayoutDirection::Row || direction == FlexLayoutDirection::RowReverse;
    let reverse = direction == FlexLayoutDirection::RowReverse
        || direction == FlexLayoutDirection::ColumnReverse;
    let gap = container.and_then(|c| c.gap).unwrap_or(0.0);
    let padding_left = container.and_then(|c| c.padding_left).unwrap_or(0.0);
    let padding_right = container.and_then(|c| c.padding_right).unwrap_or(0.0);
    let padding_top = container.and_then(|c| c.padding_top).unwrap_or(0.0);
    let padding_bottom = container.and_then(|c| c.padding_bottom).unwrap_or(0.0);
    let parent_offset = parent_index * 4;
    let main_start = out[parent_offset + if row { 0 } else { 1 }]
        + if row { padding_left } else { padding_top };
    let cross_start = out[parent_offset + if row { 1 } else { 0 }]
        + if row { padding_top } else { padding_left };
    let main_size = f32::max(
        0.0,
        out[parent_offset + if row { 2 } else { 3 }]
            - if row {
                padding_left + padding_right
            } else {
                padding_top + padding_bottom
            },
    );
    let cross_size = f32::max(
        0.0,
        out[parent_offset + if row { 3 } else { 2 }]
            - if row {
                padding_top + padding_bottom
            } else {
                padding_left + padding_right
            },
    );

    let mut line_start_index: i32 = -1;
    let mut line_last_index: i32 = -1;
    let mut line_count: i32 = 0;
    let mut line_base_sum: f32 = 0.0;
    let mut line_grow_sum: f32 = 0.0;
    let mut line_shrink_weight: f32 = 0.0;
    let mut line_cross: f32 = 0.0;
    let mut line_used_for_wrap: f32 = 0.0;
    let mut cross_offset: f32 = 0.0;
    let mut contains_target = false;
    let nodes = &tree.nodes;

    for i in 0..nodes.len() {
        if nodes[i].parent_index != parent_index as i32 {
            continue;
        }
        let base = get_flex_base(&nodes[i], intrinsic_sizes, i, row);
        if wrap != FlexLayoutWrap::NoWrap
            && line_count > 0
            && line_used_for_wrap + gap + base > main_size
        {
            if contains_target {
                break;
            }
            cross_offset += line_cross + gap;
            line_start_index = -1;
            line_last_index = -1;
            line_count = 0;
            line_base_sum = 0.0;
            line_grow_sum = 0.0;
            line_shrink_weight = 0.0;
            line_cross = 0.0;
            line_used_for_wrap = 0.0;
        }
        if line_start_index < 0 {
            line_start_index = i as i32;
        }
        line_last_index = i as i32;
        let item = get_flex_item_style(&nodes[i]);
        let grow = item.and_then(|s| s.grow).unwrap_or(0.0);
        let shrink = item.and_then(|s| s.shrink).unwrap_or(1.0);
        line_base_sum += base;
        line_grow_sum += grow;
        line_shrink_weight += shrink * base;
        line_cross = f32::max(line_cross, get_flex_cross(intrinsic_sizes, i, row));
        line_used_for_wrap += (if line_count == 0 { 0.0 } else { gap }) + base;
        line_count += 1;
        if i == child_index {
            contains_target = true;
        }
    }

    if !contains_target {
        return Some(LayoutResolutionFailureKind::InvalidItemStyle);
    }
    if wrap == FlexLayoutWrap::NoWrap {
        line_cross = cross_size;
    }
    let cross_reverse = wrap == FlexLayoutWrap::WrapReverse;
    if cross_reverse {
        cross_offset = cross_size - cross_offset - line_cross;
    }

    let distributable =
        main_size - line_base_sum - gap * f32::max(0.0, (line_count - 1) as f32);
    let shrink_scale = get_flex_shrink_scale(
        tree,
        intrinsic_sizes,
        parent_index,
        row,
        line_start_index as usize,
        line_last_index as usize,
        f32::max(0.0, -distributable),
        line_shrink_weight,
    );
    let mut used_main = gap * f32::max(0.0, (line_count - 1) as f32);
    let mut target_main_size: f32 = 0.0;
    let mut before_target: f32 = 0.0;
    for i in (line_start_index as usize)..=(line_last_index as usize) {
        let node = &nodes[i];
        if node.parent_index != parent_index as i32 {
            continue;
        }
        let item = get_flex_item_style(node);
        let base = get_flex_base(node, intrinsic_sizes, i, row);
        let item_main_size = get_flex_item_main_size(
            base,
            item.and_then(|s| s.grow).unwrap_or(0.0),
            item.and_then(|s| s.shrink).unwrap_or(1.0),
            distributable,
            line_grow_sum,
            shrink_scale,
        );
        if i == child_index {
            target_main_size = item_main_size;
        } else if i < child_index {
            before_target += item_main_size + gap;
        }
        used_main += item_main_size;
    }

    let free_main = f32::max(0.0, main_size - used_main);
    let justify = container
        .and_then(|c| c.justify)
        .unwrap_or(FlexLayoutJustify::Start);
    let justify_gap = get_flex_justify_gap(justify, free_main, line_count);
    let justify_offset = get_flex_justify_offset(justify, free_main, justify_gap);
    let target_ordinal =
        count_flex_siblings(tree, parent_index, line_start_index as usize, child_index);
    before_target += justify_gap * target_ordinal as f32;
    let target_main = if reverse {
        main_start + main_size - justify_offset - before_target - target_main_size
    } else {
        main_start + justify_offset + before_target
    };

    let item = match &tree.nodes[child_index].item_style {
        ItemStyle::Flex(s) => Some(s),
        _ => None,
    };
    let align = match item.and_then(|s| s.align_self.clone()) {
        None | Some(FlexAlignSelf::Auto) => container
            .and_then(|c| c.align)
            .unwrap_or(FlexLayoutAlign::Stretch),
        Some(FlexAlignSelf::Align(a)) => a,
    };
    let mut target_cross_size = get_flex_cross(intrinsic_sizes, child_index, row);
    if align == FlexLayoutAlign::Stretch {
        target_cross_size = line_cross;
    }
    let target_cross = cross_start
        + cross_offset
        + get_flex_align_offset(align, line_cross, target_cross_size, cross_reverse);
    let child_offset = child_index * 4;
    out[child_offset] = if row { target_main } else { target_cross };
    out[child_offset + 1] = if row { target_cross } else { target_main };
    out[child_offset + 2] = if row {
        target_main_size
    } else {
        target_cross_size
    };
    out[child_offset + 3] = if row {
        target_cross_size
    } else {
        target_main_size
    };
    return None;
}

fn get_flex_align_offset(
    align: FlexLayoutAlign,
    available: f32,
    size: f32,
    reverse: bool,
) -> f32 {
    if align == FlexLayoutAlign::Center {
        return (available - size) / 2.0;
    }
    if align
        == (if reverse {
            FlexLayoutAlign::Start
        } else {
            FlexLayoutAlign::End
        })
    {
        return available - size;
    }
    return 0.0;
}

fn get_flex_base(
    node: &LayoutNode,
    intrinsic_sizes: &[f32],
    node_index: usize,
    row: bool,
) -> f32 {
    let item = get_flex_item_style(node);
    let basis = item.and_then(|s| s.basis).unwrap_or(FlexBasis::Auto);
    return match basis {
        FlexBasis::Auto => {
            finite_size(intrinsic_sizes[node_index * 2 + if row { 0 } else { 1 }])
        }
        FlexBasis::Fixed(v) => v,
    };
}

fn get_flex_cross(intrinsic_sizes: &[f32], node_index: usize, row: bool) -> f32 {
    return finite_size(intrinsic_sizes[node_index * 2 + if row { 1 } else { 0 }]);
}

fn get_flex_item_main_size(
    base: f32,
    grow: f32,
    shrink: f32,
    distributable: f32,
    grow_sum: f32,
    shrink_scale: f32,
) -> f32 {
    if distributable > 0.0 && grow_sum > 0.0 {
        return base + (distributable * grow) / grow_sum;
    }
    if distributable < 0.0 {
        return f32::max(0.0, base - shrink_scale * shrink * base);
    }
    return base;
}

fn get_flex_item_style(node: &LayoutNode) -> Option<&FlexLayoutItemStyle> {
    return match &node.item_style {
        ItemStyle::Flex(s) => Some(s),
        _ => None,
    };
}

fn get_flex_justify_gap(justify: FlexLayoutJustify, free: f32, count: i32) -> f32 {
    if justify == FlexLayoutJustify::SpaceBetween {
        return if count > 1 {
            free / (count - 1) as f32
        } else {
            0.0
        };
    }
    if justify == FlexLayoutJustify::SpaceAround {
        return if count > 0 {
            free / count as f32
        } else {
            0.0
        };
    }
    if justify == FlexLayoutJustify::SpaceEvenly {
        return free / (count + 1) as f32;
    }
    return 0.0;
}

fn get_flex_justify_offset(
    justify: FlexLayoutJustify,
    free: f32,
    distributed_gap: f32,
) -> f32 {
    if justify == FlexLayoutJustify::End {
        return free;
    }
    if justify == FlexLayoutJustify::Center {
        return free / 2.0;
    }
    if justify == FlexLayoutJustify::SpaceAround {
        return distributed_gap / 2.0;
    }
    if justify == FlexLayoutJustify::SpaceEvenly {
        return distributed_gap;
    }
    return 0.0;
}

#[allow(clippy::too_many_arguments)]
fn get_flex_shrink_scale(
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    row: bool,
    line_start_index: usize,
    line_last_index: usize,
    deficit: f32,
    initial_weight: f32,
) -> f32 {
    if deficit == 0.0 || initial_weight == 0.0 {
        return 0.0;
    }
    let mut scale = deficit / initial_weight;
    let mut frozen_count: i32 = -1;
    loop {
        let mut next_frozen_count: i32 = 0;
        let mut frozen_base: f32 = 0.0;
        let mut active_weight: f32 = 0.0;
        for i in line_start_index..=line_last_index {
            let node = &tree.nodes[i];
            if node.parent_index != parent_index as i32 {
                continue;
            }
            let item = get_flex_item_style(node);
            let base = get_flex_base(node, intrinsic_sizes, i, row);
            let weight = item.and_then(|s| s.shrink).unwrap_or(1.0) * base;
            if weight == 0.0 {
                continue;
            }
            if scale * weight >= base {
                frozen_base += base;
                next_frozen_count += 1;
            } else {
                active_weight += weight;
            }
        }
        if next_frozen_count == frozen_count || active_weight == 0.0 {
            return scale;
        }
        frozen_count = next_frozen_count;
        scale = f32::max(0.0, deficit - frozen_base) / active_weight;
    }
}

fn is_non_negative_optional(value: Option<f32>) -> bool {
    return match value {
        None => true,
        Some(v) => v.is_finite() && v >= 0.0,
    };
}

fn is_valid_flex_container(c: &FlexLayoutContainerStyle) -> bool {
    return is_non_negative_optional(c.gap)
        && is_non_negative_optional(c.padding_bottom)
        && is_non_negative_optional(c.padding_left)
        && is_non_negative_optional(c.padding_right)
        && is_non_negative_optional(c.padding_top);
}

fn is_valid_flex_item(s: &FlexLayoutItemStyle) -> bool {
    if let Some(FlexBasis::Fixed(v)) = s.basis {
        if !v.is_finite() || v < 0.0 {
            return false;
        }
    }
    return is_non_negative_optional(s.grow) && is_non_negative_optional(s.shrink);
}

pub fn register_flex_layout_resolver(state: &mut LayoutState) {
    register_layout_resolver(state, FLEX_LAYOUT_KIND, Some(flex_layout_resolver));
}
