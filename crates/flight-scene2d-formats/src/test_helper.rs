use std::sync::Arc;

use flight_entity::Ref;
use flight_host::HostImageSource;
use flight_image::contract::{
    HostImageDimensions, ImageResource, create_image_resolver_state, create_image_resource,
    register_test_image_dimension_resolver,
};

// flight-lint: allow(conform-params) D24: Rust spells the two optional source parameters explicitly
pub fn create_ready_image_resource_for_test(
    width: Option<u32>,
    height: Option<u32>,
) -> Ref<ImageResource> {
    let dimensions = HostImageDimensions {
        height: height.unwrap_or(1),
        width: width.unwrap_or(1),
    };
    let source = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(dimensions),
    });
    let mut state = create_image_resolver_state();
    register_test_image_dimension_resolver(&mut state);
    return create_image_resource(source, &state);
}
