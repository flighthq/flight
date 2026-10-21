use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_bitmap::HostImageSource;
use flight_entity::Ref;
use flight_image::{
    HostImageDimensions, ImageResource, create_image_resolver_state, create_image_resource,
    register_test_image_dimension_resolver,
};
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, Texture2D, TextureSourceRef,
    create_texture_2d,
};
use flight_textureatlas::contract::{TextureAtlasOptions, TextureAtlasRegionOptions};

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
    let options = CreateTexture2DOptions { common, source };
    return Arc::new(RwLock::new(create_texture_2d(Some(&options))));
}

/// A shared empty 2D texture (the source's `createTexture()`).
pub fn empty_page() -> Ref<Texture2D> {
    return Arc::new(RwLock::new(create_texture_2d(None)));
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
