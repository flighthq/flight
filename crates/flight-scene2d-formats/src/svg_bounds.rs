use std::sync::Arc;

use flight_geometry::{Rectangle, create_rectangle, matrix_transform_rectangle};
use flight_node::contract::{
    NodeRef, get_node_child_at, get_node_child_count, get_node_local_bounds_rectangle,
    get_node_local_matrix,
};
use flight_scene2d::contract::{Node2DRef, as_node2d_ref};
use flight_shape::contract::{SHAPE_KIND, ShapeBoundsMode, get_shape_bounds};
use flight_text::contract::{RICH_TEXT_KIND, TEXT_LABEL_KIND};

use crate::types::SvgImportContext;

pub fn create_svg_node2d_bounds(
    target: &Node2DRef,
    context: &SvgImportContext<'_>,
) -> Option<Rectangle> {
    let kind = target.read().unwrap().node2d_fields().kind.clone();
    if kind == TEXT_LABEL_KIND || kind == RICH_TEXT_KIND {
        return None;
    }
    let recorded = context
        .object_bounding_boxes
        .iter()
        .find(|(candidate, _bounds)| Arc::ptr_eq(candidate, target))
        .map(|(_candidate, bounds)| bounds.clone());
    let own_bounds = if kind == SHAPE_KIND {
        let mut shape_bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        if !get_shape_bounds(
            &mut shape_bounds,
            &*target.read().unwrap(),
            Some(ShapeBoundsMode::Fill),
        ) {
            return None;
        }
        recorded.unwrap_or(shape_bounds)
    } else {
        recorded.unwrap_or_else(|| {
            let target: NodeRef = target.clone();
            return get_node_local_bounds_rectangle(&target);
        })
    };
    let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
    let mut has_bounds = merge_non_empty_svg_bounds(&mut out, &own_bounds, false);
    let mut has_unresolved_child_bounds = false;
    let target: NodeRef = target.clone();
    for index in 0..get_node_child_count(&target) {
        let Some(child) =
            get_node_child_at(&target, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        let Some(child_bounds) = create_svg_node2d_bounds(&child, context) else {
            has_unresolved_child_bounds = true;
            continue;
        };
        let child: NodeRef = child;
        let matrix = get_node_local_matrix(&child);
        let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut bounds, &matrix, &child_bounds);
        has_bounds = merge_non_empty_svg_bounds(&mut out, &bounds, has_bounds);
    }
    return (has_bounds && !has_unresolved_child_bounds).then_some(out);
}

pub fn has_unmeasurable_svg_text(target: &Node2DRef) -> bool {
    let kind = target.read().unwrap().node2d_fields().kind.clone();
    if kind == TEXT_LABEL_KIND || kind == RICH_TEXT_KIND {
        return true;
    }
    let target: NodeRef = target.clone();
    for index in 0..get_node_child_count(&target) {
        let Some(child) =
            get_node_child_at(&target, index as i32).and_then(|child| as_node2d_ref(&child))
        else {
            continue;
        };
        if has_unmeasurable_svg_text(&child) {
            return true;
        }
    }
    return false;
}

fn merge_non_empty_svg_bounds(out: &mut Rectangle, source: &Rectangle, has_bounds: bool) -> bool {
    if source.width == 0.0 || source.height == 0.0 {
        return has_bounds;
    }
    if !has_bounds {
        out.x = source.x;
        out.y = source.y;
        out.width = source.width;
        out.height = source.height;
        return true;
    }
    let minimum_x = out.x.min(source.x);
    let minimum_y = out.y.min(source.y);
    let maximum_x = (out.x + out.width).max(source.x + source.width);
    let maximum_y = (out.y + out.height).max(source.y + source.height);
    out.x = minimum_x;
    out.y = minimum_y;
    out.width = maximum_x - minimum_x;
    out.height = maximum_y - minimum_y;
    return true;
}
