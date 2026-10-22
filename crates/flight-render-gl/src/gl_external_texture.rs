// flight-lint: allow-file(contract-vocabulary) D17 external textures intentionally expose borrowed native glow names

use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::{allocate_entity, get_entity_id};
use flight_render::{CreateExternalTextureOptions, EXTERNAL_TEXTURE_SOURCE_KIND, ExternalTexture};
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, Texture2D, TextureDimension,
    TextureSourceRef, TextureVariant, create_texture_2d,
};

use crate::{
    GlRenderState, GlTextureRealization, apply_gl_sampler_state, bind_gl_texture_realization,
    register_gl_texture_resolver,
};

pub fn create_external_gl_texture(
    state: &mut GlRenderState,
    handle: glow::NativeTexture,
    options: &CreateExternalTextureOptions,
) -> Texture2D {
    let mut source: ExternalTexture = allocate_entity();
    initialize_external_gl_texture_source(&mut source, options);
    let source_id = get_entity_id(&source);
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let texture = create_texture_2d(Some(&CreateTexture2DOptions {
        common: CreateTextureCommonOptions {
            color_space: options.color_space,
            sampler: options.sampler.clone(),
            ..CreateTextureCommonOptions::default()
        },
        source: Some(source),
    }));
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .external_by_source_entity
        .insert(source_id, handle);
    register_gl_texture_resolver(
        state,
        EXTERNAL_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_external_gl_texture),
    );
    return texture;
}

pub fn initialize_external_gl_texture_source(
    out: &mut ExternalTexture,
    options: &CreateExternalTextureOptions,
) {
    out.height = options.height;
    out.kind = EXTERNAL_TEXTURE_SOURCE_KIND.to_string();
    out.version = 0;
    out.width = options.width;
}

pub fn dispose_external_gl_texture(state: &GlRenderState, texture: &Texture2D) -> bool {
    let Some(source_id) = get_external_texture_source_id(texture) else {
        return false;
    };
    return state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .external_by_source_entity
        .remove(&source_id)
        .is_some();
}

fn get_external_texture_source_id(texture: &dyn TextureVariant) -> Option<u64> {
    if texture.dimension() != TextureDimension::Texture2D {
        return None;
    }
    let source = texture.source_2d()?.as_ref()?.clone();
    let source = source.read().unwrap();
    if source.texture_source_fields().kind != EXTERNAL_TEXTURE_SOURCE_KIND {
        return None;
    }
    let external = (&*source as &dyn Any).downcast_ref::<ExternalTexture>()?;
    return Some(get_entity_id(external));
}

fn resolve_external_gl_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: flight_texture::TextureColorSpace,
) -> Option<GlTextureRealization> {
    let source_id = get_external_texture_source_id(texture)?;
    let handle = state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .external_by_source_entity
        .get(&source_id)
        .copied()?;
    let realization = GlTextureRealization {
        straight_alpha: false,
        texture: handle,
    };
    bind_gl_texture_realization(state, Some(realization));
    apply_gl_sampler_state(state, handle, Some(&texture.texture_fields().sampler), None);
    return Some(realization);
}
