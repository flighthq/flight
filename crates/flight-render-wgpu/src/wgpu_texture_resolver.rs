// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Source-kind texture resolution (TS `wgpuTextureResolver.ts`): one keyed lookup by the source's
//! declared kind. Resolution may realize, upload and cache the GPU entry, but binds no pass state;
//! the draw caller binds the returned entry's group explicitly.

use std::sync::{Arc, LazyLock};

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_entity::Ref;
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

use crate::types::*;
use crate::wgpu_draw::{
    bind_wgpu_bitmap_texture, bind_wgpu_compressed_image_texture, bind_wgpu_image_resource_texture,
};
use crate::wgpu_render_state::empty_kind_map;
use crate::wgpu_render_texture::bind_wgpu_render_texture_variant;

/// The standard bitmap, image and render-texture resolvers as one table (TS
/// `standardWgpuTextureResolvers`).
pub static STANDARD_WGPU_TEXTURE_RESOLVERS: LazyLock<KindMap<WgpuTextureResolver>> =
    LazyLock::new(|| {
        let table = with_kind_map_entry(
            &empty_kind_map(),
            BITMAP_TEXTURE_SOURCE_KIND.to_string(),
            resolve_wgpu_bitmap_texture as WgpuTextureResolver,
        );
        let table = with_kind_map_entry(
            &table,
            IMAGE_TEXTURE_SOURCE_KIND.to_string(),
            resolve_wgpu_image_texture,
        );
        return with_kind_map_entry(
            &table,
            RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            resolve_wgpu_render_texture,
        );
    });

/// Registers the bitmap, image and render-texture resolvers (TS
/// `registerStandardWgpuTextureResolvers`).
pub fn register_standard_wgpu_texture_resolvers(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_render_texture_resolver(state);
}

/// Registers the Bitmap source resolver (TS `registerWgpuBitmapTextureResolver`).
pub fn register_wgpu_bitmap_texture_resolver(state: &mut WgpuRenderState) {
    register_wgpu_texture_resolver(
        state,
        BITMAP_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_wgpu_bitmap_texture),
    );
}

/// Registers the compressed-image source resolver (TS
/// `registerWgpuCompressedImageTextureResolver`).
pub fn register_wgpu_compressed_image_texture_resolver(state: &mut WgpuRenderState) {
    register_wgpu_texture_resolver(
        state,
        COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_wgpu_compressed_image_texture),
    );
}

/// Registers the host-image source resolver (TS `registerWgpuImageTextureResolver`).
pub fn register_wgpu_image_texture_resolver(state: &mut WgpuRenderState) {
    register_wgpu_texture_resolver(
        state,
        IMAGE_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_wgpu_image_texture),
    );
}

/// Registers the render-texture source resolver (TS `registerWgpuRenderTextureResolver`).
pub fn register_wgpu_render_texture_resolver(state: &mut WgpuRenderState) {
    register_wgpu_texture_resolver(
        state,
        RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
        Some(resolve_wgpu_render_texture),
    );
}

/// Registers or replaces one source-kind resolver on this state (TS `registerWgpuTextureResolver`).
/// The persistent table replacement is last-write-wins; `None` removes the key.
pub fn register_wgpu_texture_resolver(
    state: &mut WgpuRenderState,
    source_kind: TextureSourceKind,
    resolver: Option<WgpuTextureResolver>,
) {
    let registries = &mut state.runtime.registries;
    let table = &registries.texture_resolvers;
    registries.texture_resolvers = Arc::new(match resolver {
        None => without_kind_map_entry(table, source_kind),
        Some(resolver) => with_kind_map_entry(table, source_kind, resolver),
    });
}

fn resolve_wgpu_bitmap_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let bitmap = (&*source as &dyn std::any::Any).downcast_ref::<Bitmap>()?;
    let mipmaps = texture.texture_fields().sampler.mipmaps;
    return Some(bind_wgpu_bitmap_texture(
        state,
        bitmap,
        Some(mipmaps),
        Some(premultiply),
        Some(color_space),
    ));
}

fn resolve_wgpu_compressed_image_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let image = (&*source as &dyn std::any::Any).downcast_ref::<CompressedImageResource>()?;
    return bind_wgpu_compressed_image_texture(state, image, Some(color_space));
}

fn resolve_wgpu_image_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    let source = get_texture_source(texture)?;
    let source = source.read().unwrap();
    let image = (&*source as &dyn std::any::Any).downcast_ref::<ImageResource>()?;
    let mipmaps = texture.texture_fields().sampler.mipmaps;
    return bind_wgpu_image_resource_texture(
        state,
        image,
        Some(mipmaps),
        Some(premultiply),
        Some(color_space),
    );
}

fn resolve_wgpu_render_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    return bind_wgpu_render_texture_variant(state, texture);
}

/// Resolves a texture through its source kind's resolver (TS `resolveWgpuTexture`). A missing
/// resolver reports a registry miss and returns `None`.
pub fn resolve_wgpu_texture(
    state: &mut WgpuRenderState,
    texture: &dyn TextureVariant,
    premultiply: Option<bool>,
    working_color_space: Option<RenderTargetColorSpace>,
) -> Option<Ref<WgpuTextureEntry>> {
    let source_kind = get_texture_source_kind(texture)?;
    let entry = state
        .runtime
        .registries
        .texture_resolvers
        .entries
        .get(&source_kind)
        .copied();
    let Some(entry) = entry else {
        emit_render_registry_miss(state, RenderRegistryTable::TextureResolver, source_kind);
        return None;
    };
    let color_space = get_texture_sample_color_space(
        texture.texture_fields().color_space,
        working_color_space.unwrap_or(RenderTargetColorSpace::Linear),
    );
    return entry(state, texture, premultiply.unwrap_or(false), color_space);
}
