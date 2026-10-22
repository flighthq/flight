use std::any::Any;
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{Ref, allocate_entity};
use flight_host::HostImageSource;
use flight_texture::{AlphaType, TextureGamut, TextureSourceFields, TextureSourceRef};

use crate::image_source_dimensions::get_host_image_source_dimensions;
use crate::types::{
    COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND, CompressedImageData, CompressedImageResource,
    HostImageDimensions, IMAGE_TEXTURE_SOURCE_KIND, ImageResolverState, ImageResource,
};

pub fn create_compressed_image_resource(
    compressed: Arc<CompressedImageData>,
) -> Ref<CompressedImageResource> {
    let mut out: CompressedImageResource = allocate_entity();
    initialize_compressed_image_resource(&mut out, compressed);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D5 explicit resolver state replaces the source module-global dimension hook
pub fn create_image_resource(
    image: Arc<HostImageSource>,
    state: &ImageResolverState,
) -> Ref<ImageResource> {
    let mut resource = ImageResource {
        fields: TextureSourceFields::default(),
        self_handle: Weak::new(),
        source: image,
    };
    resource.fields.alpha_type = AlphaType::Straight;
    resource.fields.gamut = TextureGamut::Srgb;
    resource.fields.height = 0;
    resource.fields.kind = IMAGE_TEXTURE_SOURCE_KIND.to_string();
    resource.fields.version = 0;
    resource.fields.width = 0;
    update_image_resource_size(&mut resource, state);
    let resource = Arc::new(RwLock::new(resource));
    resource.write().unwrap().self_handle = Arc::downgrade(&resource);
    return resource;
}

pub fn initialize_compressed_image_resource(
    out: &mut CompressedImageResource,
    compressed: Arc<CompressedImageData>,
) {
    out.fields.alpha_type = AlphaType::Straight;
    out.compressed = compressed;
    out.fields.gamut = TextureGamut::Srgb;
    out.fields.height = out.compressed.container.height as u32;
    out.fields.kind = COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string();
    out.fields.version = 0;
    out.fields.width = out.compressed.container.width as u32;
}

// flight-lint: allow(conform-extra) D16 typed recovery retains the same ImageResource allocation after TextureSource family erasure
pub fn as_image_resource_ref(source: &TextureSourceRef) -> Option<Ref<ImageResource>> {
    let source = source.read().unwrap();
    let source: &dyn Any = &*source;
    return source
        .downcast_ref::<ImageResource>()?
        .self_handle
        .upgrade();
}

pub fn clone_image_resource(resource: &Ref<ImageResource>) -> Ref<ImageResource> {
    let resource = resource.read().unwrap();
    let mut out = ImageResource {
        fields: TextureSourceFields::default(),
        self_handle: Weak::new(),
        source: resource.source.clone(),
    };
    out.fields.alpha_type = resource.alpha_type;
    out.fields.gamut = resource.gamut;
    out.fields.height = resource.height;
    out.fields.kind = resource.kind.clone();
    out.fields.version = resource.version;
    out.fields.width = resource.width;
    drop(resource);
    let out = Arc::new(RwLock::new(out));
    out.write().unwrap().self_handle = Arc::downgrade(&out);
    return out;
}

// flight-lint: allow(conform-params) D5 explicit resolver state replaces the source module-global dimension hook
pub fn invalidate_image_resource(resource: &Ref<ImageResource>, state: &ImageResolverState) {
    let mut resource = resource.write().unwrap();
    update_image_resource_size(&mut resource, state);
    resource.fields.version = resource.version.wrapping_add(1);
}

pub fn is_image_resource_empty(resource: &Ref<ImageResource>) -> bool {
    let resource = resource.read().unwrap();
    return resource.width == 0 || resource.height == 0;
}

fn update_image_resource_size(resource: &mut ImageResource, state: &ImageResolverState) {
    let mut measured = HostImageDimensions {
        height: resource.height,
        width: resource.width,
    };
    if !get_host_image_source_dimensions(&mut measured, &resource.source, state) {
        return;
    }
    resource.fields.height = measured.height;
    resource.fields.width = measured.width;
}
