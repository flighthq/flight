#![allow(dead_code)]
//! Test rig for the headless host: host creation that skips by name when the machine has no
//! adapter, and the known scene the read-back test renders through the SDK's own wgpu path.

use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::Ref;
use flight_host_headless::*;
use flight_node::{NodeRef, Transform2DNode, add_node_child};
use flight_render::{RenderProxies2D, RenderTargetClear, prepare_scene_2d_render};
use flight_render_wgpu::*;
use flight_scene2d::{create_display_object, create_sprite};
use flight_scene2d_wgpu::contract::*;
use flight_texture::{Texture, TextureSourceRef, create_texture_2d};

// flight-lint: allow(test-default-call) test scaffolding fills Rust-only option bags whose omitted fields are the source's undefined
pub fn test_default<T: Default>() -> T {
    return T::default();
}

/// A host on whatever adapter the machine offers, or `None` after printing why the calling test is
/// skipped. A machine with no adapter at all (no GPU, no software Vulkan) skips; it never passes.
pub fn create_test_headless_host(test: &str) -> Option<HeadlessHost> {
    let host = create_headless_host(None);
    if host.is_none() {
        let explanation = explain_headless_host(None);
        eprintln!(
            "SKIPPED {test}: no headless adapter ({:?}: {}). Install a software Vulkan adapter (Mesa lavapipe: mesa-vulkan-drivers) to run it.",
            explanation.reason, explanation.message
        );
    }
    return host;
}

/// The known scene's extent, clear color and sprites. Every sprite is opaque, solid and placed on
/// whole pixels at its natural size, so every pixel of the frame is known exactly.
pub const SCENE_WIDTH: u32 = 64;
pub const SCENE_HEIGHT: u32 = 48;
pub const SCENE_CLEAR: u32 = 0x204080ff;
pub const SCENE_SPRITES: [(u32, i32, i32, u32, u32); 2] =
    [(0xff0000ff, 8, 6, 16, 12), (0x00ff00ff, 30, 20, 20, 24)];

/// The frame the known scene must produce, as packed RGBA, pixel by pixel.
pub fn create_known_scene_expected_bitmap() -> Bitmap {
    let mut out = create_bitmap(SCENE_WIDTH, SCENE_HEIGHT, Some(SCENE_CLEAR));
    for (color, x, y, width, height) in SCENE_SPRITES {
        for row in y..y + height as i32 {
            for column in x..x + width as i32 {
                let offset = ((row as u32 * SCENE_WIDTH + column as u32) * 4) as usize;
                out.data[offset..offset + 4].copy_from_slice(&color.to_be_bytes());
            }
        }
    }
    return out;
}

/// Renders the known scene on `host` through the SDK's sequence (create render state, register
/// renderers, prepare, begin pass, render, end pass, submit) into the host's capture-enabled render
/// target, and returns its screen target.
pub fn render_known_scene(host: &HeadlessHost) -> Ref<WgpuScreenRenderTarget> {
    let mut state = create_known_scene_render_state(get_headless_host_wgpu_device(host).unwrap());
    let target = create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT).unwrap();
    return render_known_scene_with(&mut state, &target);
}

/// A render state over `device` with the known scene's renderers registered.
pub fn create_known_scene_render_state(device: &flight_host::WgpuDevice) -> WgpuRenderState {
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let mut state = create_wgpu_render_state(
        device,
        Some(&WgpuRenderStateOptions {
            format: Some(format),
            ..test_default()
        }),
    );
    register_wgpu_standard_material(&mut state);
    register_wgpu_bitmap_texture_resolver(&mut state);
    register_wgpu_scene2d_renderer(&mut state);
    register_wgpu_sprite_renderer(&mut state);
    return state;
}

/// Renders the known scene through `state` into `target`, a headless screen target, and returns
/// that screen target.
pub fn render_known_scene_with(
    state: &mut WgpuRenderState,
    target: &WgpuRenderTarget,
) -> Ref<WgpuScreenRenderTarget> {
    let root: NodeRef = create_display_object();
    for (color, x, y, width, height) in SCENE_SPRITES {
        let sprite = create_sprite();
        {
            let mut guard = sprite.write().unwrap();
            *guard.transform2d_mut().x = f64::from(x);
            *guard.transform2d_mut().y = f64::from(y);
            guard.data.texture = Some(create_solid_texture(color, width, height));
        }
        let node: NodeRef = sprite;
        add_node_child(&root, &node);
    }

    let WgpuRenderTarget::Screen(screen) = target else {
        panic!("a headless render target is a screen target");
    };
    let screen = screen.clone();

    let mut proxies: RenderProxies2D<WgpuRenderState> = test_default();
    prepare_scene_2d_render(state, &mut proxies, &root);
    let [red, green, blue, alpha] = SCENE_CLEAR.to_be_bytes();
    let mut pass = begin_wgpu_render_pass(
        state,
        target,
        Some(&RenderTargetClear {
            color: Some([
                f32::from(red) / 255.0,
                f32::from(green) / 255.0,
                f32::from(blue) / 255.0,
                f32::from(alpha) / 255.0,
            ]),
            colors: None,
            depth: Some(1.0),
            stencil: None,
        }),
    );
    render_wgpu_scene2d(&mut pass, &mut proxies, &root, None);
    end_wgpu_render_pass(pass);
    submit_wgpu_frame(state);
    return screen;
}

fn create_solid_texture(color: u32, width: u32, height: u32) -> Ref<Texture> {
    let bitmap = create_bitmap(width, height, Some(color));
    let source: TextureSourceRef = Arc::new(RwLock::new(bitmap));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    return Arc::new(RwLock::new(Texture::Texture2D(texture)));
}
