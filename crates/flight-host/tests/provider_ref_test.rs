use std::sync::Arc;

use flight_host::contract::*;

type Callback = Arc<dyn Fn() + Send + Sync>;

struct CapabilityFacet {
    callback: Callback,
    provider: ProviderRef,
}

#[test]
fn different_providers_stay_distinct_when_their_callback_is_shared() {
    let callback: Callback = Arc::new(|| {});
    let first = CapabilityFacet {
        callback: callback.clone(),
        provider: identity(),
    };
    let second = CapabilityFacet {
        callback,
        provider: identity(),
    };
    assert!(!Arc::ptr_eq(&first.provider, &second.provider));
    assert!(Arc::ptr_eq(&first.callback, &second.callback));
}

#[test]
fn facets_from_one_provider_share_identity() {
    let provider: ProviderRef = identity();
    let callback: Callback = Arc::new(|| {});
    let first = CapabilityFacet {
        callback: callback.clone(),
        provider: provider.clone(),
    };
    let second = CapabilityFacet { callback, provider };
    assert!(Arc::ptr_eq(&first.provider, &second.provider));
    assert!(Arc::ptr_eq(&first.callback, &second.callback));
}

// An identity-bearing payload: each call allocates a distinct object on every target (an array in
// TypeScript), as a platform handle is. A unit payload has no identity once lowered.
fn identity() -> Arc<Vec<i32>> {
    return Arc::new(Vec::new());
}
