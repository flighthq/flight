use flight_node::{NodeRef, RendererDataRef};
use flight_render::{BaseRenderState, NodeRenderer, RenderProxy2D};

// flight-lint: allow(test-default-call) D17 test scaffolding constructs Rust-only generic stores and option bags that have no source create function
pub fn test_default<T: Default>() -> T {
    return T::default();
}

pub static NOOP_RENDERER: NodeRenderer<BaseRenderState> = NodeRenderer {
    format: None,
    create_data: create_no_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_noop,
};

pub static SECOND_RENDERER: NodeRenderer<BaseRenderState> = NodeRenderer {
    format: None,
    create_data: create_no_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_noop,
};

pub fn display_node() -> NodeRef {
    return flight_scene2d::create_display_object(None);
}

pub fn node_with_kind(kind: &str) -> NodeRef {
    let node = display_node();
    node.write().unwrap().node_fields_mut().kind = kind.to_string();
    return node;
}

pub fn sprite_node() -> NodeRef {
    return flight_scene2d::create_sprite(None);
}

fn create_no_data(_state: &mut BaseRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    return None;
}

fn submit_noop(_state: &mut BaseRenderState, _proxy: &RenderProxy2D<BaseRenderState>) {}
