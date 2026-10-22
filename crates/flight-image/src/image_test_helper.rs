use std::sync::Arc;

use flight_host::HostImageSource;

use crate::image_source_dimensions::{
    register_host_image_dimension_resolver, unregister_host_image_dimension_resolver,
};
use crate::types::{HostImageDimensions, ImageResolverState};

// flight-lint: allow(conform-params) D5 caller-owned state replaces the source test module's shared resolver slot
pub fn register_test_image_dimension_resolver(state: &mut ImageResolverState) {
    register_host_image_dimension_resolver(state, Arc::new(test_image_dimension_resolver));
}

/// Portable test resolver for an opaque host source whose test handle is `HostImageDimensions`.
/// A different host value is declined without changing `out`.
pub fn test_image_dimension_resolver(
    source: &Arc<HostImageSource>,
    out: &mut HostImageDimensions,
) -> bool {
    let Some(dimensions) = source.handle.downcast_ref::<HostImageDimensions>() else {
        return false;
    };
    out.height = dimensions.height;
    out.width = dimensions.width;
    return true;
}

// flight-lint: allow(conform-params) D5 caller-owned state replaces the source test module's shared resolver slot
pub fn unregister_test_image_dimension_resolver(state: &mut ImageResolverState) {
    unregister_host_image_dimension_resolver(state);
}
