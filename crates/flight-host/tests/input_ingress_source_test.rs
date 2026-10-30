use std::sync::Arc;

use flight_host::contract::*;

#[test]
fn input_ingress_sources_are_told_apart_by_handle_identity_not_by_provider() {
    let provider: ProviderRef = identity();
    let first = InputIngressSource {
        provider: provider.clone(),
        handle: identity(),
    };
    let second = InputIngressSource {
        provider: provider.clone(),
        handle: identity(),
    };
    assert!(Arc::ptr_eq(&first.clone().handle, &first.handle));
    assert!(Arc::ptr_eq(&first.provider, &second.provider));
    assert!(!Arc::ptr_eq(&first.handle, &second.handle));
}

// An identity-bearing payload: each call allocates a distinct object on every target (an array in
// TypeScript), as a platform handle is. A unit payload has no identity once lowered.
fn identity() -> Arc<Vec<i32>> {
    return Arc::new(Vec::new());
}
