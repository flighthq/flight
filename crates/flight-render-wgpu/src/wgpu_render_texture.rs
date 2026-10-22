// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Render textures realized on a WebGPU state (TS `wgpuRenderTexture.ts`): each public handle owns
//! a hidden texture target in the device tier's cache, keyed by the handle's entity id (D12), with
//! an honest readiness status.

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, get_entity_id};
use flight_render::{
    RenderTarget, RenderTargetDescriptor, RenderTargetFormat, RenderTexture,
    resolve_render_target_descriptor,
};
use flight_texture::{
    RenderTargetColorSpace, TextureColorSpace, TextureVariant, get_texture_source,
};

use crate::types::*;
use crate::wgpu_render_pass::{begin_wgpu_render_pass, end_wgpu_render_pass};
use crate::wgpu_texture_render_target::{
    create_wgpu_texture_render_target, destroy_wgpu_texture_render_target,
    resize_wgpu_texture_render_target,
};

/// A populated render texture's state-owned allocation, sampled without a CPU copy (TS
/// `bindWgpuRenderTexture`). An unrendered or currently written texture returns `None` and notifies
/// the guard.
pub fn bind_wgpu_render_texture(
    state: &mut WgpuRenderState,
    render_texture: &RenderTexture,
) -> Option<Ref<WgpuTextureEntry>> {
    return bind_wgpu_render_texture_variant(state, render_texture);
}

pub(crate) fn bind_wgpu_render_texture_variant(
    state: &mut WgpuRenderState,
    render_texture: &dyn TextureVariant,
) -> Option<Ref<WgpuTextureEntry>> {
    let id = get_render_texture_id(render_texture);
    let sampled = {
        let mut context = state.runtime.context.write().unwrap();
        context
            .wgpu_render_texture_cache
            .as_mut()
            .and_then(|cache| cache.get_mut(&id))
            .filter(|entry| entry.status == WgpuRenderTextureStatus::Ready)
            .map(resolve_wgpu_render_texture_sampled_entry)
    };
    if sampled.is_none() {
        notify_guard(state, render_texture);
    }
    return sampled;
}

/// Frees a render texture's hidden target (TS `destroyWgpuRenderTexture`).
pub fn destroy_wgpu_render_texture(state: &mut WgpuRenderState, render_texture: &RenderTexture) {
    let id = get_render_texture_id(render_texture);
    let removed = state
        .runtime
        .context
        .write()
        .unwrap()
        .wgpu_render_texture_cache
        .as_mut()
        .and_then(|cache| cache.remove(&id));
    if let Some(entry) = removed {
        destroy_wgpu_texture_render_target(&entry.target.read().unwrap());
    }
}

fn ensure_wgpu_render_texture_entry(
    state: &mut WgpuRenderState,
    render_texture: &RenderTexture,
) -> (Ref<WgpuTextureRenderTarget>, WgpuRenderTextureStatus) {
    let descriptor = read_render_target_descriptor(render_texture);
    let requested = resolve_render_target_descriptor(&descriptor);
    let format = get_wgpu_render_texture_format(requested.format);
    let color_space = descriptor.color_space.unwrap_or_default();
    let id = get_render_texture_id(render_texture);
    let existing = get_wgpu_render_texture_entry(state, render_texture);
    let Some(mut entry) = existing else {
        let target = create_wgpu_texture_render_target(
            state,
            requested.width as f32,
            requested.height as f32,
            Some(format),
            Some(color_space),
            Some(requested.sample_count),
        );
        let target = Arc::new(RwLock::new(target));
        state
            .runtime
            .context
            .write()
            .unwrap()
            .wgpu_render_texture_cache
            .get_or_insert_with(Default::default)
            .insert(
                id,
                WgpuRenderTextureEntry {
                    status: WgpuRenderTextureStatus::Unrendered,
                    target: target.clone(),
                    sampled: None,
                },
            );
        return (target, WgpuRenderTextureStatus::Unrendered);
    };
    if entry.target.read().unwrap().format != format {
        destroy_wgpu_texture_render_target(&entry.target.read().unwrap());
        let target = create_wgpu_texture_render_target(
            state,
            requested.width as f32,
            requested.height as f32,
            Some(format),
            Some(color_space),
            Some(requested.sample_count),
        );
        entry.target = Arc::new(RwLock::new(target));
        entry.status = WgpuRenderTextureStatus::Unrendered;
        entry.sampled = None;
    } else {
        let mut target = entry.target.write().unwrap();
        resize_wgpu_texture_render_target(
            state,
            &mut target,
            requested.width as f32,
            requested.height as f32,
            Some(requested.sample_count),
        );
        target.color_space = color_space;
    }
    let target = entry.target.clone();
    let status = entry.status;
    state
        .runtime
        .context
        .write()
        .unwrap()
        .wgpu_render_texture_cache
        .get_or_insert_with(Default::default)
        .insert(id, entry);
    return (target, status);
}

/// The render texture's realized extent and status (TS `explainWgpuRenderTexture`); the
/// descriptor's extent while unrealized.
pub fn explain_wgpu_render_texture(
    state: &WgpuRenderState,
    render_texture: &RenderTexture,
) -> WgpuRenderTextureExplanation {
    return explain_wgpu_render_texture_variant(state, render_texture);
}

fn explain_wgpu_render_texture_variant(
    state: &WgpuRenderState,
    render_texture: &dyn TextureVariant,
) -> WgpuRenderTextureExplanation {
    if let Some(entry) = get_wgpu_render_texture_entry(state, render_texture) {
        let target = entry.target.read().unwrap();
        return WgpuRenderTextureExplanation {
            height: target.height,
            status: entry.status,
            width: target.width,
        };
    }
    let (width, height) = get_texture_source(render_texture)
        .map(|source| {
            let source = source.read().unwrap();
            let fields = source.texture_source_fields();
            (fields.width, fields.height)
        })
        .unwrap_or((0, 0));
    return WgpuRenderTextureExplanation {
        height,
        status: WgpuRenderTextureStatus::Unrendered,
        width,
    };
}

fn get_render_texture_id(render_texture: &dyn TextureVariant) -> u64 {
    return get_entity_id(render_texture.texture_fields());
}

fn get_wgpu_render_texture_entry(
    state: &WgpuRenderState,
    render_texture: &dyn TextureVariant,
) -> Option<WgpuRenderTextureEntry> {
    let id = get_render_texture_id(render_texture);
    return state
        .runtime
        .context
        .read()
        .unwrap()
        .wgpu_render_texture_cache
        .as_ref()
        .and_then(|cache| cache.get(&id).cloned());
}

fn get_wgpu_render_texture_format(format: RenderTargetFormat) -> wgpu::TextureFormat {
    return match format {
        RenderTargetFormat::Rgba16F => wgpu::TextureFormat::Rgba16Float,
        RenderTargetFormat::Rgba32F => wgpu::TextureFormat::Rgba32Float,
        RenderTargetFormat::Rgba8 => wgpu::TextureFormat::Rgba8Unorm,
    };
}

/// The hidden target while its handle owns completed content (TS `getWgpuRenderTextureTarget`).
/// Effect recipes use this bridge; display composition samples the render texture.
pub fn get_wgpu_render_texture_target(
    state: &mut WgpuRenderState,
    render_texture: &RenderTexture,
) -> Option<Ref<WgpuTextureRenderTarget>> {
    let entry = get_wgpu_render_texture_entry(state, render_texture);
    if let Some(entry) = entry
        && entry.status == WgpuRenderTextureStatus::Ready
    {
        return Some(entry.target);
    }
    notify_guard(state, render_texture);
    return None;
}

/// Marks a render texture's content stale (TS `invalidateWgpuRenderTexture`); `None` is
/// `Unrendered`.
pub fn invalidate_wgpu_render_texture(
    state: &WgpuRenderState,
    render_texture: &RenderTexture,
    status: Option<WgpuRenderTextureStatus>,
) {
    let id = get_render_texture_id(render_texture);
    let mut context = state.runtime.context.write().unwrap();
    if let Some(entry) = context
        .wgpu_render_texture_cache
        .as_mut()
        .and_then(|cache| cache.get_mut(&id))
    {
        entry.status = status.unwrap_or(WgpuRenderTextureStatus::Unrendered);
    }
}

/// Whether the render texture owns completed content (TS `isWgpuRenderTextureReady`); notifies the
/// guard when it does not.
pub fn is_wgpu_render_texture_ready(
    state: &mut WgpuRenderState,
    render_texture: &RenderTexture,
) -> bool {
    let ready = get_wgpu_render_texture_entry(state, render_texture)
        .is_some_and(|entry| entry.status == WgpuRenderTextureStatus::Ready);
    if !ready {
        notify_guard(state, render_texture);
    }
    return ready;
}

fn notify_guard(state: &mut WgpuRenderState, render_texture: &dyn TextureVariant) {
    let Some(guard) = state.runtime.wgpu_render_texture_guard.clone() else {
        return;
    };
    let explanation = explain_wgpu_render_texture_variant(state, render_texture);
    guard(state, render_texture, &explanation);
}

// The RenderTarget source a render texture's constructor guarantees, read as a descriptor.
fn read_render_target_descriptor(render_texture: &RenderTexture) -> RenderTargetDescriptor {
    let source = render_texture
        .source
        .as_ref()
        .expect("a render texture carries a RenderTarget source");
    let source = source.read().unwrap();
    let target = (&*source as &dyn std::any::Any)
        .downcast_ref::<RenderTarget>()
        .expect("a render texture carries a RenderTarget source");
    return RenderTargetDescriptor {
        width: target.width as f32,
        height: target.height as f32,
        format: target.format,
        color_attachments: target.color_attachments,
        color_formats: target.color_formats.clone(),
        sample_count: target.sample_count,
        depth: target.depth,
        color_space: Some(target.color_space),
    };
}

/// Clears and populates a render texture's hidden target (TS `renderIntoWgpuRenderTexture`). The
/// callback receives the pass bound to that target, and the enclosing pass is restored even when the
/// callback panics. `clear` is what the target starts from.
pub fn render_into_wgpu_render_texture(
    state: &mut WgpuRenderState,
    render_texture: &mut RenderTexture,
    callback: impl FnOnce(&mut WgpuRenderPass<'_>),
    clear: &RenderTargetClear,
) {
    write_wgpu_render_texture_target(state, render_texture, |state, target| {
        let mut pass = begin_wgpu_render_pass(
            state,
            &WgpuRenderTarget::Texture(target.clone()),
            Some(clear),
        );
        let result = catch_unwind(AssertUnwindSafe(|| callback(&mut pass)));
        end_wgpu_render_pass(pass);
        if let Err(payload) = result {
            resume_unwind(payload);
        }
    });
}

// The sampleable entry over the target's current storage, rebuilt when its view changed.
fn resolve_wgpu_render_texture_sampled_entry(
    entry: &mut WgpuRenderTextureEntry,
) -> Ref<WgpuTextureEntry> {
    let target = entry.target.read().unwrap();
    if let Some(sampled) = &entry.sampled
        && sampled.read().unwrap().view == target.view
    {
        return sampled.clone();
    }
    let sampled = Arc::new(RwLock::new(WgpuTextureEntry {
        runtime: EntityRuntimeSlot::default(),
        bindings: WgpuTextureBindings::new(),
        mip_level_count: target.mip_level_count,
        sampler: None,
        straight_alpha: None,
        texture: target.texture.clone(),
        view: target.view.clone(),
        version: None,
        video: None,
    }));
    drop(target);
    entry.sampled = Some(sampled.clone());
    return sampled;
}

/// Installs or clears the observer of unready render-texture reads (TS `setWgpuRenderTextureGuard`).
pub fn set_wgpu_render_texture_guard(
    state: &mut WgpuRenderState,
    guard: Option<WgpuRenderTextureGuard>,
) {
    state.runtime.wgpu_render_texture_guard = guard;
}

fn set_wgpu_render_texture_status(
    state: &WgpuRenderState,
    id: u64,
    status: WgpuRenderTextureStatus,
) {
    if let Some(entry) = state
        .runtime
        .context
        .write()
        .unwrap()
        .wgpu_render_texture_cache
        .as_mut()
        .and_then(|cache| cache.get_mut(&id))
    {
        entry.status = status;
    }
}

/// Gives a backend recipe the hidden destination without opening a pass (TS
/// `writeWgpuRenderTextureTarget`). The recipe may encode several passes; success publishes the
/// handle (its color space and a version bump), while a panic restores an honest status.
pub fn write_wgpu_render_texture_target<T>(
    state: &mut WgpuRenderState,
    render_texture: &mut RenderTexture,
    callback: impl FnOnce(&mut WgpuRenderState, &Ref<WgpuTextureRenderTarget>) -> T,
) -> T {
    let (target, previous_status) = ensure_wgpu_render_texture_entry(state, render_texture);
    let id = get_render_texture_id(render_texture);
    set_wgpu_render_texture_status(state, id, WgpuRenderTextureStatus::Writing);
    let result = catch_unwind(AssertUnwindSafe(|| callback(state, &target)));
    let rendered = result.is_ok();
    let status = if rendered {
        WgpuRenderTextureStatus::Ready
    } else if previous_status == WgpuRenderTextureStatus::Writing {
        WgpuRenderTextureStatus::Writing
    } else {
        WgpuRenderTextureStatus::Unrendered
    };
    set_wgpu_render_texture_status(state, id, status);
    if rendered {
        render_texture.color_space = match target.read().unwrap().color_space {
            RenderTargetColorSpace::Linear => TextureColorSpace::Linear,
            RenderTargetColorSpace::Srgb => TextureColorSpace::Srgb,
        };
        render_texture.version = render_texture.version.wrapping_add(1);
    }
    return match result {
        Ok(value) => value,
        Err(payload) => resume_unwind(payload),
    };
}
