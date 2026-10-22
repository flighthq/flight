use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_entity::Ref;
use flight_host::HostImageSource;
use flight_image::{
    HostImageDimensions, ImageResource, create_image_resolver_state, create_image_resource,
    register_test_image_dimension_resolver,
};
use flight_texture::{CreateTextureCommonOptions, Texture2D, TextureSourceRef, create_texture_2d};
use flight_textureatlas::contract::{
    TextureAtlas, TextureAtlasOptions, TextureAtlasRegion, TextureAtlasRegionOptions,
    create_texture_atlas, create_texture_atlas_region, set_texture_atlas_region,
};

pub fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

/// The source's `{ height, width } as ImageResource`: an ImageResource measured through the test
/// dimension resolver.
pub fn image(width: u32, height: u32) -> Ref<ImageResource> {
    let mut state = create_image_resolver_state();
    register_test_image_dimension_resolver(&mut state);
    let source = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(HostImageDimensions { height, width }),
    });
    return create_image_resource(source, &state);
}

pub fn common() -> CreateTextureCommonOptions {
    let make: fn() -> CreateTextureCommonOptions = CreateTextureCommonOptions::default;
    return make();
}

/// A shared 2D page over `source` with the given common texture options.
pub fn page(
    source: Option<TextureSourceRef>,
    common: CreateTextureCommonOptions,
) -> Ref<Texture2D> {
    let mut texture = create_texture_2d();
    if let Some(value) = common.color_space {
        texture.color_space = value;
    }
    if let Some(value) = common.flip_x {
        texture.flip_x = value;
    }
    if let Some(value) = common.flip_y {
        texture.flip_y = value;
    }
    if let Some(value) = common.sampler {
        texture.sampler = value;
    }
    if let Some(value) = common.uv_offset {
        texture.uv_offset = value;
    }
    if let Some(value) = common.uv_rotation {
        texture.uv_rotation = value;
    }
    if let Some(value) = common.uv_scale {
        texture.uv_scale = value;
    }
    if let Some(value) = common.version {
        texture.version = value;
    }
    texture.source = source;
    return Arc::new(RwLock::new(texture));
}

/// A shared empty 2D texture (the source's `createTexture()`).
pub fn empty_page() -> Ref<Texture2D> {
    return Arc::new(RwLock::new(create_texture_2d()));
}

/// An all-`None` region options record (the source's `{}` Partial).
pub fn region_options() -> TextureAtlasRegionOptions {
    let make: fn() -> TextureAtlasRegionOptions = TextureAtlasRegionOptions::default;
    return make();
}

/// An all-`None` atlas options record (the source's `{}` Partial).
pub fn atlas_options() -> TextureAtlasOptions {
    let make: fn() -> TextureAtlasOptions = TextureAtlasOptions::default;
    return make();
}

pub fn create_test_texture_atlas(obj: Option<TextureAtlasOptions>) -> TextureAtlas {
    return Arc::try_unwrap(create_test_texture_atlas_ref(obj))
        .unwrap()
        .into_inner()
        .unwrap();
}

pub fn create_test_texture_atlas_ref(obj: Option<TextureAtlasOptions>) -> Ref<TextureAtlas> {
    let atlas = create_texture_atlas();
    if let Some(obj) = obj {
        let mut atlas = atlas.write().unwrap();
        atlas.image_height = obj.image_height.unwrap_or(0.0);
        atlas.image_name = obj.image_name;
        atlas.image_width = obj.image_width.unwrap_or(0.0);
        atlas.regions = obj.regions.unwrap_or_default();
        atlas.scale = obj.scale.unwrap_or(1.0);
        atlas.texture = obj.texture;
    }
    return atlas;
}

pub fn create_test_texture_atlas_region(
    obj: Option<&TextureAtlasRegionOptions>,
) -> Ref<TextureAtlasRegion> {
    let region = create_texture_atlas_region();
    if let Some(obj) = obj {
        set_texture_atlas_region(&mut region.write().unwrap(), obj);
    }
    return region;
}
