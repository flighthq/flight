// flight-lint: allow-file(contract-vocabulary) D17 render-view resources use Rc native context ownership and Result diagnostics

use std::rc::Rc;

use flight_entity::EntityRuntimeSlot;
use flight_node::create_viewport;
use flight_render::{RenderProxies2D, RenderTargetDescriptor};

use crate::{
    GlContextState, GlRenderStateOptions, GlRenderViewResources, create_gl_render_state,
    create_gl_texture_render_target, destroy_gl_render_state, destroy_gl_texture_render_target,
    invalidate_gl_render_state_cache, resize_gl_texture_render_target,
};

// flight-lint: allow(conform-params) D17 the native backend receives an explicit context owner
pub fn create_gl_render_view_resources(
    context_state: Rc<GlContextState>,
    width: f32,
    height: f32,
    device_pixel_ratio: f32,
    options: Option<GlRenderStateOptions>,
    target: Option<&RenderTargetDescriptor>,
) -> Result<GlRenderViewResources, String> {
    let options = options.unwrap_or_default();
    let mut render_state = create_gl_render_state(context_state, Some(&options));
    render_state.render.pixel_ratio = device_pixel_ratio;
    let mut descriptor = target.cloned().unwrap_or(RenderTargetDescriptor {
        width: 0.0,
        height: 0.0,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    });
    descriptor.width = width;
    descriptor.height = height;
    let render_target = create_gl_texture_render_target(&render_state, &descriptor, None)?
        .ok_or_else(|| "createGlRenderViewResources: target allocation was refused".to_string())?;
    let mut viewport = create_viewport();
    viewport.width = width;
    viewport.height = height;
    viewport.device_pixel_ratio = device_pixel_ratio;
    return Ok(GlRenderViewResources {
        runtime: EntityRuntimeSlot::default(),
        render_state,
        render_target,
        viewport,
        proxies: RenderProxies2D::default(),
    });
}

pub fn destroy_gl_render_view_resources(resources: &mut GlRenderViewResources) {
    destroy_gl_texture_render_target(&mut resources.render_target);
    destroy_gl_render_state(&mut resources.render_state, &mut resources.proxies);
}

pub fn resize_gl_render_view_resources(
    resources: &mut GlRenderViewResources,
    width: f32,
    height: f32,
) -> Result<(), String> {
    let storage_width = width.ceil().max(1.0) as u32;
    let storage_height = height.ceil().max(1.0) as u32;
    if resources.render_target.axes.width == storage_width
        && resources.render_target.axes.height == storage_height
    {
        return Ok(());
    }
    invalidate_gl_render_state_cache(&resources.render_state);
    resize_gl_texture_render_target(
        &resources.render_state,
        &mut resources.render_target,
        width,
        height,
    )?;
    resources.viewport.width = width;
    resources.viewport.height = height;
    return Ok(());
}
