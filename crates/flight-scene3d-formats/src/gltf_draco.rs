use crate::gltf_types::GltfDracoDecoder;

pub struct GltfDracoRegistry {
    pub decoder: Option<GltfDracoDecoder>,
}

// flight-lint: allow(conform-params) D5 caller-owned registry replaces the source ambient mutable decoder slot; returned Arc is the original callback
pub fn get_gltf_draco_decoder(registry: &GltfDracoRegistry) -> Option<GltfDracoDecoder> {
    return registry.decoder.clone();
}

// flight-lint: allow(conform-params) D5 readiness is the actual caller-owned registry slot, without an implicit codec backend
pub fn has_gltf_draco_decoder(registry: &GltfDracoRegistry) -> bool {
    return registry.decoder.is_some();
}

// flight-lint: allow(conform-params) D5 caller-owned registry replaces ambient mutable state; open synchronous decoder protocol is unchanged
pub fn register_gltf_draco_decoder(registry: &mut GltfDracoRegistry, decoder: GltfDracoDecoder) {
    registry.decoder = Some(decoder);
}

// flight-lint: allow(conform-params) D5 clear the caller-owned decoder slot, not hidden process-global state
pub fn unregister_gltf_draco_decoder(registry: &mut GltfDracoRegistry) {
    registry.decoder = None;
}
