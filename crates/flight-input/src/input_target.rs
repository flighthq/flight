use flight_entity::{Ref, allocate_entity};

use crate::types::*;

// The contract file-structure rule requires modules before functions and impls.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_input_target_handle() {
        let method_handle = InputTargetHandle::new();
        let free_handle = create_input_target_handle();
        assert_eq!(
            flight_entity::has_entity_runtime(&*method_handle.read().unwrap()),
            flight_entity::has_entity_runtime(&*free_handle.read().unwrap())
        );
    }
}

/// Allocates an input target handle for a host adapter (TS `InputTargetHandle` is an Entity but the
/// pinned TS package exports no factory).
// flight-lint: allow(conform-extra) D12 entity factory: InputTargetHandle extends Entity but @flighthq/input exports no factory
pub fn create_input_target_handle() -> Ref<InputTargetHandle> {
    let mut out: InputTargetHandle = allocate_entity();
    initialize_input_target_handle(&mut out);
    return std::sync::Arc::new(std::sync::RwLock::new(out));
}

/// Re-initializes an input target handle under construction (D12).
// flight-lint: allow(conform-extra) D12 entity factory: InputTargetHandle extends Entity but @flighthq/input exports no factory
pub fn initialize_input_target_handle(_out: &mut InputTargetHandle) {}

// ============================================================================
// D18 sugar: the constructor delegates to the create function
// ============================================================================

impl InputTargetHandle {
    pub fn new() -> Ref<InputTargetHandle> {
        return create_input_target_handle();
    }
}
