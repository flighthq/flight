// flight-lint: allow-file(contract-vocabulary) D17 render textures use open texture traits, Rc/RefCell target ownership, callbacks, and Result diagnostics

use flight_render::RenderTargetClear;
use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_entity::get_entity_id;
use flight_render::{RenderTarget, RenderTargetDescriptor, RenderTexture};
use flight_texture::{
    RenderTargetColorSpace, Sampler, TextureColorSpace, TextureDimension, TextureUvTransform,
    TextureVariant,
};

use crate::{
    GlRenderPass, GlRenderState, GlRenderTextureEntry, GlRenderTextureExplanation,
    GlRenderTextureGuard, GlRenderTextureStatus, GlTextureRealization, apply_gl_sampler_state,
    begin_gl_render_pass, bind_gl_texture_realization, clear_gl_render_target,
    create_gl_texture_render_target, destroy_gl_texture_render_target, end_gl_render_pass,
    pop_gl_render_state, push_gl_render_state, resize_gl_texture_render_target,
};

pub fn bind_gl_render_texture(
    state: &mut GlRenderState,
    render_texture: &dyn TextureVariant,
    sampler: Option<&Sampler>,
) -> Option<glow::NativeTexture> {
    let entry = get_gl_render_texture_entry(state, render_texture);
    let Some(entry) = entry else {
        notify_gl_render_texture_guard(state, render_texture);
        bind_gl_texture_realization(state, None);
        return None;
    };
    let entry = entry.borrow();
    if entry.status != GlRenderTextureStatus::Ready {
        drop(entry);
        notify_gl_render_texture_guard(state, render_texture);
        bind_gl_texture_realization(state, None);
        return None;
    }
    let texture = entry.target.texture;
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture,
        }),
    );
    apply_gl_sampler_state(
        state,
        texture,
        sampler.or(Some(&render_texture.texture_fields().sampler)),
        None,
    );
    return Some(texture);
}

pub fn clear_gl_render_texture(
    state: &mut GlRenderState,
    render_texture: &mut RenderTexture,
) -> Result<(), String> {
    return write_gl_render_texture_target(state, render_texture, |state, target| {
        push_gl_render_state(state);
        clear_gl_render_target(
            target,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        pop_gl_render_state(state);
        return Ok(());
    });
}

pub fn destroy_gl_render_texture(state: &GlRenderState, render_texture: &dyn TextureVariant) {
    let Some((texture_id, _)) = get_render_target_source(render_texture) else {
        return;
    };
    destroy_gl_render_texture_by_source_id(state, texture_id);
}

pub(crate) fn destroy_gl_render_texture_by_source_id(state: &GlRenderState, texture_id: u64) {
    let entry = state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .render_target_by_source_entity
        .remove(&texture_id);
    if let Some(entry) = entry {
        destroy_gl_texture_render_target(&mut entry.borrow_mut().target);
    }
}

fn ensure_gl_render_texture_entry(
    state: &GlRenderState,
    render_texture: &dyn TextureVariant,
) -> Result<Rc<RefCell<GlRenderTextureEntry>>, String> {
    let (source_id, descriptor) = get_render_target_source(render_texture)
        .ok_or_else(|| "RenderTexture has no RenderTarget source".to_string())?;
    let texture_id = source_id;
    let existing = state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .render_target_by_source_entity
        .get(&texture_id)
        .cloned();
    if let Some(entry) = existing {
        let requested = flight_render::resolve_render_target_descriptor(&descriptor);
        let allocation_matches =
            matches_gl_render_texture_allocation(&entry.borrow().target, &requested);
        if allocation_matches {
            resize_gl_texture_render_target(
                state,
                &mut entry.borrow_mut().target,
                descriptor.width,
                descriptor.height,
            )?;
            entry.borrow_mut().target.requested_axes = requested;
        } else {
            destroy_gl_texture_render_target(&mut entry.borrow_mut().target);
            let target =
                create_gl_texture_render_target(state, &descriptor, None)?.ok_or_else(|| {
                    "RenderTexture preferred target allocation was refused".to_string()
                })?;
            let mut entry = entry.borrow_mut();
            entry.target = target;
            entry.status = GlRenderTextureStatus::Unrendered;
        }
        return Ok(entry);
    }
    let target = create_gl_texture_render_target(state, &descriptor, None)?
        .ok_or_else(|| "RenderTexture preferred target allocation was refused".to_string())?;
    let entry = Rc::new(RefCell::new(GlRenderTextureEntry {
        status: GlRenderTextureStatus::Unrendered,
        target,
    }));
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .render_target_by_source_entity
        .insert(texture_id, Rc::clone(&entry));
    return Ok(entry);
}

pub fn explain_gl_render_texture(
    state: &GlRenderState,
    render_texture: &dyn TextureVariant,
) -> GlRenderTextureExplanation {
    let entry = get_gl_render_texture_entry(state, render_texture);
    if let Some(entry) = entry {
        let entry = entry.borrow();
        return GlRenderTextureExplanation {
            height: entry.target.axes.height,
            status: entry.status,
            width: entry.target.axes.width,
        };
    }
    let dimensions = get_render_target_source(render_texture)
        .map(|(_, descriptor)| (descriptor.width as u32, descriptor.height as u32))
        .unwrap_or_default();
    return GlRenderTextureExplanation {
        height: dimensions.1,
        status: GlRenderTextureStatus::Unrendered,
        width: dimensions.0,
    };
}

pub fn get_gl_render_texture_color_space(
    state: &GlRenderState,
    render_texture: &dyn TextureVariant,
) -> TextureColorSpace {
    let target_color_space = get_gl_render_texture_entry(state, render_texture)
        .map(|entry| entry.borrow().target.axes.color_space);
    return target_color_space.map_or(render_texture.texture_fields().color_space, |value| {
        match value {
            RenderTargetColorSpace::Linear => TextureColorSpace::Linear,
            RenderTargetColorSpace::Srgb => TextureColorSpace::Srgb,
        }
    });
}

fn get_gl_render_texture_entry(
    state: &GlRenderState,
    render_texture: &dyn TextureVariant,
) -> Option<Rc<RefCell<GlRenderTextureEntry>>> {
    let (texture_id, _) = get_render_target_source(render_texture)?;
    return state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .render_target_by_source_entity
        .get(&texture_id)
        .cloned();
}

pub(crate) fn get_gl_render_texture_source_id(render_texture: &dyn TextureVariant) -> Option<u64> {
    return get_render_target_source(render_texture).map(|(id, _)| id);
}

pub fn get_gl_render_texture_target(
    state: &mut GlRenderState,
    render_texture: &dyn TextureVariant,
) -> Option<Rc<RefCell<GlRenderTextureEntry>>> {
    let entry = get_gl_render_texture_entry(state, render_texture);
    if entry
        .as_ref()
        .is_some_and(|entry| entry.borrow().status == GlRenderTextureStatus::Ready)
    {
        return entry;
    }
    notify_gl_render_texture_guard(state, render_texture);
    return None;
}

fn get_render_target_source(
    render_texture: &dyn TextureVariant,
) -> Option<(u64, RenderTargetDescriptor)> {
    if render_texture.dimension() != TextureDimension::Texture2D {
        return None;
    }
    let source = render_texture.source_2d()?.as_ref()?.clone();
    let source = source.read().unwrap();
    let target = (&*source as &dyn Any).downcast_ref::<RenderTarget>()?;
    return Some((
        get_entity_id(target),
        RenderTargetDescriptor {
            width: target.width as f32,
            height: target.height as f32,
            format: target.format,
            color_attachments: target.color_attachments,
            color_formats: target.color_formats.clone(),
            sample_count: target.sample_count,
            depth: target.depth,
            color_space: Some(target.color_space),
        },
    ));
}

pub fn invalidate_gl_render_texture(
    state: &GlRenderState,
    render_texture: &dyn TextureVariant,
    status: Option<GlRenderTextureStatus>,
) {
    if let Some(entry) = get_gl_render_texture_entry(state, render_texture) {
        entry.borrow_mut().status = status.unwrap_or(GlRenderTextureStatus::Unrendered);
    }
}

pub fn is_gl_render_texture_ready(
    state: &mut GlRenderState,
    render_texture: &dyn TextureVariant,
) -> bool {
    let ready = get_gl_render_texture_entry(state, render_texture)
        .is_some_and(|entry| entry.borrow().status == GlRenderTextureStatus::Ready);
    if !ready {
        notify_gl_render_texture_guard(state, render_texture);
    }
    return ready;
}

fn matches_gl_render_texture_allocation(
    target: &crate::GlTextureRenderTarget,
    descriptor: &flight_render::RenderTargetAxes,
) -> bool {
    let requested = &target.requested_axes;
    return requested.format == descriptor.format
        && requested.color_attachments == descriptor.color_attachments
        && requested.color_formats == descriptor.color_formats
        && requested.sample_count == descriptor.sample_count
        && requested.depth == descriptor.depth
        && requested.color_space == descriptor.color_space;
}

fn notify_gl_render_texture_guard(state: &mut GlRenderState, render_texture: &dyn TextureVariant) {
    let Some(guard) = state.gl_runtime.borrow().render_texture_guard else {
        return;
    };
    let explanation = explain_gl_render_texture(state, render_texture);
    guard(state, render_texture, &explanation);
}

pub fn render_into_gl_render_texture<F>(
    state: &mut GlRenderState,
    render_texture: &mut RenderTexture,
    callback: F,
    clear: &RenderTargetClear,
) -> Result<(), String>
where
    F: FnOnce(&mut GlRenderState, &GlRenderPass) -> Result<(), String>,
{
    return write_gl_render_texture_target(state, render_texture, |state, target| {
        push_gl_render_state(state);
        let result = (|| {
            let pass = begin_gl_render_pass(state, target, Some(clear), None)?;
            let callback_result = callback(state, &pass);
            let end_result = end_gl_render_pass(state, &pass);
            callback_result?;
            return end_result;
        })();
        pop_gl_render_state(state);
        return result;
    });
}

pub fn set_gl_render_texture_guard(state: &GlRenderState, guard: Option<GlRenderTextureGuard>) {
    state.gl_runtime.borrow_mut().render_texture_guard = guard;
}

pub fn write_gl_render_texture_target<T, F>(
    state: &mut GlRenderState,
    render_texture: &mut RenderTexture,
    callback: F,
) -> Result<T, String>
where
    F: FnOnce(&mut GlRenderState, &mut crate::GlTextureRenderTarget) -> Result<T, String>,
{
    let entry = ensure_gl_render_texture_entry(state, render_texture)?;
    let previous_status = entry.borrow().status;
    entry.borrow_mut().status = GlRenderTextureStatus::Writing;
    let result = {
        let mut entry = entry.borrow_mut();
        callback(state, &mut entry.target)
    };
    match result {
        Ok(value) => {
            let color_space = entry.borrow().target.axes.color_space;
            entry.borrow_mut().status = GlRenderTextureStatus::Ready;
            render_texture.texture_fields_mut().color_space = match color_space {
                RenderTargetColorSpace::Linear => TextureColorSpace::Linear,
                RenderTargetColorSpace::Srgb => TextureColorSpace::Srgb,
            };
            let next_version = render_texture.texture_fields().version.wrapping_add(1);
            render_texture.texture_fields_mut().version = next_version;
            return Ok(value);
        }
        Err(error) => {
            entry.borrow_mut().status = if previous_status == GlRenderTextureStatus::Writing {
                GlRenderTextureStatus::Writing
            } else {
                GlRenderTextureStatus::Unrendered
            };
            return Err(error);
        }
    }
}
