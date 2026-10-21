use std::sync::Arc;

use flight_hostcapability::contract::*;

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
        provider: Arc::new(()),
    };
    let second = CapabilityFacet {
        callback,
        provider: Arc::new(()),
    };
    assert!(!Arc::ptr_eq(&first.provider, &second.provider));
    assert!(Arc::ptr_eq(&first.callback, &second.callback));
}

#[test]
fn facets_from_one_provider_share_identity() {
    let provider: ProviderRef = Arc::new(());
    let callback: Callback = Arc::new(|| {});
    let first = CapabilityFacet {
        callback: callback.clone(),
        provider: provider.clone(),
    };
    let second = CapabilityFacet { callback, provider };
    assert!(Arc::ptr_eq(&first.provider, &second.provider));
    assert!(Arc::ptr_eq(&first.callback, &second.callback));
}
