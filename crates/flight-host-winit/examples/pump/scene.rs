//! The pump example's scene and frame, shared with the display tests so they exercise exactly what
//! the example draws.

use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_entity::Ref;
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_render::{RenderProxies2D, RenderTargetClear, prepare_scene_2d_render};
use flight_render_wgpu::{
    WgpuRenderState, WgpuRenderTarget, begin_wgpu_render_pass, end_wgpu_render_pass,
};
use flight_scene2d::{create_display_object, create_sprite};
use flight_scene2d_wgpu::render_wgpu_scene2d;
use flight_shape::{
    Shape, append_shape_begin_fill, append_shape_end_fill, append_shape_rectangle, create_shape,
    register_default_shape_bounds_commands,
};
use flight_texture::{Texture, TextureSourceRef, create_texture_2d};

/// The movable rectangle's colour and size; the pointer drags its centre.
pub const PUMP_MOVABLE_COLOR: u32 = 0xff5a5aff;
pub const PUMP_MOVABLE_HEIGHT: f64 = 90.0;
pub const PUMP_MOVABLE_WIDTH: f64 = 140.0;

pub struct PumpScene {
    pub root: NodeRef,
    pub movable: Ref<Shape>,
}

/// Builds the example scene: two rectangles and a sprite on an 800x600 window.
pub fn create_pump_scene() -> PumpScene {
    let root: NodeRef = create_display_object();
    let movable = solid_rectangle(
        PUMP_MOVABLE_COLOR,
        80.0,
        100.0,
        PUMP_MOVABLE_WIDTH,
        PUMP_MOVABLE_HEIGHT,
    );
    let second = solid_rectangle(0x42c8f5ff, 360.0, 220.0, 180.0, 120.0);
    let sprite = create_sprite();
    {
        let mut sprite = sprite.write().unwrap();
        let source: TextureSourceRef =
            Arc::new(RwLock::new(create_bitmap(96, 96, Some(0xf7c948ff))));
        let mut texture = create_texture_2d();
        texture.source = Some(source);
        sprite.data.texture = Some(Arc::new(RwLock::new(Texture::Texture2D(texture))));
        sprite.x = 620.0;
        sprite.y = 420.0;
    }
    let movable_node: NodeRef = movable.clone();
    let second_node: NodeRef = second;
    let sprite_node: NodeRef = sprite;
    add_node_child(&root, &movable_node);
    add_node_child(&root, &second_node);
    add_node_child(&root, &sprite_node);
    return PumpScene { root, movable };
}

/// Centres the movable rectangle on a pointer position. The Rust render path re-reads a node's
/// transform only after `invalidate_node_local_transform`, so the move is invalidated explicitly.
pub fn move_pump_scene_shape(scene: &PumpScene, x: f64, y: f64) {
    {
        let mut shape = scene.movable.write().unwrap();
        shape.x = x - PUMP_MOVABLE_WIDTH / 2.0;
        shape.y = y - PUMP_MOVABLE_HEIGHT / 2.0;
    }
    let node: NodeRef = scene.movable.clone();
    invalidate_node_local_transform(&node);
}

/// Prepares, draws and presents one frame of the scene.
pub fn render_pump_scene_frame(
    state: &mut WgpuRenderState,
    proxies: &mut RenderProxies2D<WgpuRenderState>,
    target: &WgpuRenderTarget,
    scene: &PumpScene,
) {
    let clear = RenderTargetClear {
        color: Some([0.03, 0.04, 0.07, 1.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    prepare_scene_2d_render(state, proxies, &scene.root);
    let mut pass = begin_wgpu_render_pass(state, target, Some(&clear));
    render_wgpu_scene2d(&mut pass, proxies, &scene.root, None);
    end_wgpu_render_pass(pass);
}

fn solid_rectangle(color: u32, x: f64, y: f64, width: f64, height: f64) -> Ref<Shape> {
    let shape = create_shape();
    let bounds = shape.read().unwrap().data.bounds_state.clone();
    register_default_shape_bounds_commands(&bounds);
    append_shape_begin_fill(&shape, color, None);
    append_shape_rectangle(&shape, 0.0, 0.0, width, height);
    append_shape_end_fill(&shape);
    {
        let mut shape = shape.write().unwrap();
        shape.x = x;
        shape.y = y;
    }
    return shape;
}
