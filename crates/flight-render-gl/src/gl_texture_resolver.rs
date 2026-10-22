// flight-lint: allow-file(contract-vocabulary) D17 texture resolution dispatches the open native TextureVariant contract and glow names

use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_image::{
    COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND, CompressedImageResource, IMAGE_TEXTURE_SOURCE_KIND,
    ImageResource,
};
use flight_registry::{KindMap, with_kind_map_entry, without_kind_map_entry};
use flight_render::{
    RENDER_TARGET_TEXTURE_SOURCE_KIND, RenderRegistryTable, emit_render_registry_miss,
};
use flight_texture::{
    RenderTargetColorSpace, TextureColorSpace, TextureSourceKind, TextureVariant,
    get_texture_sample_color_space, get_texture_source, get_texture_source_kind,
};

use crate::{
    GlRenderState, GlTextureRealization, GlTextureResolver, bind_gl_bitmap_texture,
    bind_gl_compressed_image_texture, bind_gl_image_resource_texture, bind_gl_render_texture,
    bind_gl_texture_realization,
};

pub fn register_gl_bitmap_texture_resolver(state: &mut GlRenderState) {
    register_gl_texture_resolver(
        state,
        BITMAP_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_gl_bitmap_texture),
    );
}

pub fn register_gl_compressed_image_texture_resolver(state: &mut GlRenderState) {
    register_gl_texture_resolver(
        state,
        COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_gl_compressed_image_texture),
    );
}

pub fn register_gl_image_texture_resolver(state: &mut GlRenderState) {
    register_gl_texture_resolver(
        state,
        IMAGE_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_gl_image_texture),
    );
}

pub fn register_gl_render_texture_resolver(state: &mut GlRenderState) {
    register_gl_texture_resolver(
        state,
        RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_gl_render_texture),
    );
}

pub fn register_gl_texture_resolver(
    state: &mut GlRenderState,
    source_kind: TextureSourceKind,
    resolver: Option<GlTextureResolver>,
) {
    let table = &state.gl_registries.texture_resolvers;
    state.gl_registries.texture_resolvers = Arc::new(match resolver {
        Some(resolver) => with_kind_map_entry(table, source_kind, resolver),
        None => without_kind_map_entry(table, source_kind),
    });
}

pub fn register_standard_gl_texture_resolvers(state: &mut GlRenderState) {
    register_gl_bitmap_texture_resolver(state);
    register_gl_image_texture_resolver(state);
    register_gl_render_texture_resolver(state);
}

fn resolve_gl_bitmap_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let bitmap = (&*source as &dyn Any).downcast_ref::<Bitmap>()?;
    let handle = bind_gl_bitmap_texture(
        state,
        bitmap,
        Some(&texture.texture_fields().sampler),
        None,
        premultiply,
        color_space,
    )
    .ok()?;
    return Some(GlTextureRealization {
        straight_alpha: false,
        texture: handle,
    });
}

fn resolve_gl_compressed_image_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let image = (&*source as &dyn Any).downcast_ref::<CompressedImageResource>()?;
    let handle = bind_gl_compressed_image_texture(
        state,
        image,
        Some(&texture.texture_fields().sampler),
        None,
        color_space,
    )
    .ok()?;
    return Some(GlTextureRealization {
        straight_alpha: true,
        texture: handle,
    });
}

fn resolve_gl_image_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let image = (&*source as &dyn Any).downcast_ref::<ImageResource>()?;
    let handle = bind_gl_image_resource_texture(
        state,
        image,
        Some(&texture.texture_fields().sampler),
        None,
        premultiply,
        color_space,
    )
    .ok()?;
    return Some(GlTextureRealization {
        straight_alpha: false,
        texture: handle,
    });
}

fn resolve_gl_render_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    let handle = bind_gl_render_texture(state, texture, Some(&texture.texture_fields().sampler))?;
    return Some(GlTextureRealization {
        straight_alpha: false,
        texture: handle,
    });
}

pub fn resolve_gl_texture(
    state: &mut GlRenderState,
    texture: &dyn TextureVariant,
    premultiply: Option<bool>,
    working_color_space: Option<RenderTargetColorSpace>,
) -> Option<glow::NativeTexture> {
    let source_kind = get_texture_source_kind(texture)?;
    let Some(resolver) = state
        .gl_registries
        .texture_resolvers
        .entries
        .get(&source_kind)
        .copied()
    else {
        emit_render_registry_miss(state, RenderRegistryTable::TextureResolver, source_kind);
        return None;
    };
    let realization = resolver(
        state,
        texture,
        premultiply.unwrap_or(false),
        get_texture_sample_color_space(
            texture.texture_fields().color_space,
            working_color_space.unwrap_or(RenderTargetColorSpace::Linear),
        ),
    )?;
    return bind_gl_texture_realization(state, Some(realization));
}

// flight-lint: allow(conform-extra) D17 caller-owned registry initialization exposes the immutable standard resolver table
pub fn standard_gl_texture_resolvers() -> KindMap<GlTextureResolver> {
    let mut map: KindMap<GlTextureResolver> = KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
    map = with_kind_map_entry(
        &map,
        BITMAP_TEXTURE_SOURCE_KIND.to_string(),
        resolve_gl_bitmap_texture as GlTextureResolver,
    );
    map = with_kind_map_entry(
        &map,
        IMAGE_TEXTURE_SOURCE_KIND.to_string(),
        resolve_gl_image_texture as GlTextureResolver,
    );
    return with_kind_map_entry(
        &map,
        RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
        resolve_gl_render_texture as GlTextureResolver,
    );
}
