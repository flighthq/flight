// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Foreign GPU textures adopted by a WebGPU state (TS `wgpuExternalTexture.ts`). The native handle
//! is borrowed: the state caches an entry over it, keyed by the source's entity id (D12), and the
//! source kind resolves through the external-texture resolver.

use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity, get_entity_id};
use flight_render::{CreateExternalTextureOptions, EXTERNAL_TEXTURE_SOURCE_KIND, ExternalTexture};
use flight_texture::{
    Texture2D, TextureDimension, TextureFilter, TextureSourceRef, TextureVariant, clone_sampler,
    create_texture_2d, get_texture_source,
};

use crate::types::*;
use crate::wgpu_draw::base_filter;
use crate::wgpu_render_state::get_wgpu_sampler;
use crate::wgpu_texture_resolver::register_wgpu_texture_resolver;

/// Wraps a foreign texture as a 2D texture this state samples (TS `createExternalWgpuTexture`). The
/// external source fixes its own filtering, so the entry carries its sampler and the draw policy does
/// not override it; bind groups are built per sampler on demand.
pub fn create_external_wgpu_texture(
    state: &mut WgpuRenderState,
    handle: wgpu::Texture,
    options: &CreateExternalTextureOptions,
) -> Texture2D {
    let mut source: ExternalTexture = allocate_entity();
    initialize_external_wgpu_texture_source(&mut source, options);
    let source_id = get_entity_id(&source);
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let mut texture = create_texture_2d();
    if let Some(color_space) = options.color_space {
        texture.color_space = color_space;
    }
    if let Some(sampler) = options.sampler.as_ref() {
        texture.sampler = clone_sampler(sampler);
    }
    texture.source = Some(source);
    let view = handle.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = get_external_wgpu_sampler(state, &texture);
    let mut entry = WgpuTextureEntry {
        runtime: EntityRuntimeSlot::default(),
        bindings: WgpuTextureBindings::new(),
        mip_level_count: 1,
        sampler: None,
        straight_alpha: None,
        texture: handle.clone(),
        view: view.clone(),
        version: None,
        video: None,
    };
    initialize_external_wgpu_texture_entry(&mut entry, sampler, handle, view);
    state
        .runtime
        .context
        .write()
        .unwrap()
        .wgpu_external_texture_cache
        .get_or_insert_with(Default::default)
        .insert(source_id, Arc::new(RwLock::new(entry)));
    register_wgpu_texture_resolver(
        state,
        EXTERNAL_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_external_wgpu_texture),
    );
    return texture;
}

/// Writes an external entry over a borrowed texture (TS `initializeExternalWgpuTextureEntry`).
pub fn initialize_external_wgpu_texture_entry(
    out: &mut WgpuTextureEntry,
    sampler: wgpu::Sampler,
    texture: wgpu::Texture,
    view: wgpu::TextureView,
) {
    out.bindings = WgpuTextureBindings::new();
    out.mip_level_count = 1;
    out.sampler = Some(sampler);
    out.texture = texture;
    out.view = view;
}

/// Writes an external source's extent and kind (TS `initializeExternalWgpuTextureSource`).
pub fn initialize_external_wgpu_texture_source(
    out: &mut ExternalTexture,
    options: &CreateExternalTextureOptions,
) {
    out.height = options.height;
    out.kind = EXTERNAL_TEXTURE_SOURCE_KIND.to_string();
    out.version = 0;
    out.width = options.width;
}

/// Forgets the state's entry over an external texture (TS `disposeExternalWgpuTexture`); `false`
/// when the texture is not external or had no entry. The foreign handle is not destroyed.
pub fn dispose_external_wgpu_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
) -> bool {
    let Some(source_id) = get_external_texture_source_id(texture) else {
        return false;
    };
    return state
        .runtime
        .context
        .write()
        .unwrap()
        .wgpu_external_texture_cache
        .as_mut()
        .is_some_and(|cache| cache.remove(&source_id).is_some());
}

fn get_external_texture_source_id(texture: &dyn TextureVariant) -> Option<u64> {
    if texture.dimension() != TextureDimension::Texture2D {
        return None;
    }
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    if source.texture_source_fields().kind != EXTERNAL_TEXTURE_SOURCE_KIND {
        return None;
    }
    return Some(get_entity_id(&*source));
}

fn get_external_wgpu_sampler(state: &WgpuRenderState, texture: &Texture2D) -> wgpu::Sampler {
    let sampler = &texture.sampler;
    let mipmap_filter = if sampler.mipmaps {
        match sampler.min_filter {
            TextureFilter::LinearMipmapNearest | TextureFilter::NearestMipmapNearest => {
                Some(wgpu::MipmapFilterMode::Nearest)
            }
            TextureFilter::LinearMipmapLinear | TextureFilter::NearestMipmapLinear => {
                Some(wgpu::MipmapFilterMode::Linear)
            }
            _ => None,
        }
    } else {
        None
    };
    return get_wgpu_sampler(
        state,
        base_filter(sampler.min_filter),
        base_filter(sampler.mag_filter),
        sampler.wrap_u,
        sampler.wrap_v,
        mipmap_filter,
        Some(sampler.anisotropy),
    );
}

fn resolve_external_wgpu_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: flight_texture::TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let source_id = get_external_texture_source_id(texture)?;
    return state
        .runtime
        .context
        .read()
        .unwrap()
        .wgpu_external_texture_cache
        .as_ref()
        .and_then(|cache| cache.get(&source_id).cloned());
}
