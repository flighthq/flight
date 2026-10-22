//! Private access to the command stream of the shape-family kinds the shape renderers accept (TS
//! reads `(renderProxy.source as Shape).data.commands` for Shape, MorphShape and Scale9Shape alike).

use flight_node::Node;
use flight_shape::{MorphShape, Scale9Shape, Shape, ShapeCommandToken};

pub(crate) fn get_gl_shape_commands(node: &dyn Node) -> Option<&[ShapeCommandToken]> {
    let any = node.as_any();
    if let Some(shape) = any.downcast_ref::<Shape>() {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = any.downcast_ref::<MorphShape>() {
        return Some(&shape.data.commands);
    }
    if let Some(shape) = any.downcast_ref::<Scale9Shape>() {
        return Some(&shape.data.commands);
    }
    return None;
}
