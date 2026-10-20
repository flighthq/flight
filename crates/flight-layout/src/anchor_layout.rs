use crate::layout_state::register_layout_resolver;
use crate::types::*;

fn align_x(parent_width: f32, child_width: f32, align: ViewportAlign) -> f32 {
    if matches!(
        align,
        ViewportAlign::Left | ViewportAlign::TopLeft | ViewportAlign::BottomLeft
    ) {
        return 0.0;
    }
    if matches!(
        align,
        ViewportAlign::Right | ViewportAlign::TopRight | ViewportAlign::BottomRight
    ) {
        return parent_width - child_width;
    }
    return (parent_width - child_width) / 2.0;
}

fn align_y(parent_height: f32, child_height: f32, align: ViewportAlign) -> f32 {
    if matches!(
        align,
        ViewportAlign::Top | ViewportAlign::TopLeft | ViewportAlign::TopRight
    ) {
        return 0.0;
    }
    if matches!(
        align,
        ViewportAlign::Bottom | ViewportAlign::BottomLeft | ViewportAlign::BottomRight
    ) {
        return parent_height - child_height;
    }
    return (parent_height - child_height) / 2.0;
}

fn anchor_layout_resolver(
    out: &mut [f32],
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    parent_index: usize,
    child_index: usize,
) -> Option<LayoutResolutionFailureKind> {
    if !is_empty_style(&tree.nodes[parent_index].container_style) {
        return Some(LayoutResolutionFailureKind::InvalidContainerStyle);
    }
    let style = match &tree.nodes[child_index].item_style {
        ItemStyle::None => None,
        ItemStyle::Anchor(s) => Some(s),
        _ => return Some(LayoutResolutionFailureKind::InvalidItemStyle),
    };
    let parent_offset = parent_index * 4;
    let parent_x = out[parent_offset];
    let parent_y = out[parent_offset + 1];
    let parent_width = out[parent_offset + 2];
    let parent_height = out[parent_offset + 3];
    let left = style.and_then(|s| s.left);
    let right = style.and_then(|s| s.right);
    let top = style.and_then(|s| s.top);
    let bottom = style.and_then(|s| s.bottom);
    let intrinsic_offset = child_index * 2;
    let width = if left.is_some() && right.is_some() {
        f32::max(0.0, parent_width - left.unwrap() - right.unwrap())
    } else {
        finite_size(
            style
                .and_then(|s| s.width)
                .unwrap_or(intrinsic_sizes[intrinsic_offset]),
        )
    };
    let height = if top.is_some() && bottom.is_some() {
        f32::max(0.0, parent_height - top.unwrap() - bottom.unwrap())
    } else {
        finite_size(
            style
                .and_then(|s| s.height)
                .unwrap_or(intrinsic_sizes[intrinsic_offset + 1]),
        )
    };
    let align = style
        .and_then(|s| s.align)
        .unwrap_or(ViewportAlign::TopLeft);
    let child_offset = child_index * 4;
    out[child_offset] = if let Some(l) = left {
        parent_x + l
    } else if let Some(r) = right {
        parent_x + parent_width - r - width
    } else {
        parent_x + align_x(parent_width, width, align)
    };
    out[child_offset + 1] = if let Some(t) = top {
        parent_y + t
    } else if let Some(b) = bottom {
        parent_y + parent_height - b - height
    } else {
        parent_y + align_y(parent_height, height, align)
    };
    out[child_offset + 2] = width;
    out[child_offset + 3] = height;
    return None;
}

fn finite_size(value: f32) -> f32 {
    return if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    };
}

fn is_empty_style(style: &ContainerStyle) -> bool {
    return matches!(style, ContainerStyle::None);
}

pub fn register_anchor_layout_resolver(state: &mut LayoutState) {
    register_layout_resolver(state, ANCHOR_LAYOUT_KIND, Some(anchor_layout_resolver));
}
