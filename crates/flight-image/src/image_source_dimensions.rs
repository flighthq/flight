use flight_bitmap::HostImageSource;
use std::sync::Arc;

use crate::types::{HostImageDimensionResolver, HostImageDimensions, ImageResolverState};

// flight-lint: allow(conform-extra) D5 construction seam for explicit caller-owned resolver state
pub fn create_image_resolver_state() -> ImageResolverState {
    return ImageResolverState::default();
}

// flight-lint: allow(conform-params) D5/D9: out is first and caller-owned state replaces the source module-global resolver
pub fn get_host_image_source_dimensions(
    out: &mut HostImageDimensions,
    source: &Arc<HostImageSource>,
    state: &ImageResolverState,
) -> bool {
    let Some(resolver) = &state.dimension_resolver else {
        return false;
    };
    return resolver(source, out);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the source module-global resolver
pub fn has_host_image_dimension_resolver(state: &ImageResolverState) -> bool {
    return state.dimension_resolver.is_some();
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the source module-global resolver
pub fn register_host_image_dimension_resolver(
    state: &mut ImageResolverState,
    resolver: HostImageDimensionResolver,
) {
    state.dimension_resolver = Some(resolver);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the source module-global resolver
pub fn unregister_host_image_dimension_resolver(state: &mut ImageResolverState) {
    state.dimension_resolver = None;
}
