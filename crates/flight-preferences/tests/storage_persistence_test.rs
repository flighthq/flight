use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;

use flight_permissions::HostPreferencesPersistenceQueryCapability;
use flight_permissions::HostPreferencesPersistenceRequestCapability;
use flight_permissions::StoragePersistenceOutcome;
use flight_permissions::StoragePersistenceOutcomeReason;
use flight_permissions::PermissionState;
use flight_preferences::get_storage_persistence;
use flight_preferences::request_storage_persistence;

mod get_storage_persistence {
    use super::*;

    #[test]
    fn relays_persistent_denied() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::Persistent,
            permission_state: Some(PermissionState::Denied),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(get_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_best_effort_granted() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::BestEffort,
            permission_state: Some(PermissionState::Granted),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(get_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_best_effort_null_permission() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::BestEffort,
            permission_state: None,
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(get_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_operation_failed_prompt() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::OperationFailed,
            permission_state: Some(PermissionState::Prompt),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(get_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn calls_backend_exactly_once() {
        let call_count = Arc::new(AtomicUsize::new(0));
        let count = call_count.clone();
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                count.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move {
                    Ok(StoragePersistenceOutcome {
                        outcome: StoragePersistenceOutcomeReason::Persistent,
                        permission_state: Some(PermissionState::Granted),
                    })
                }) as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let _ = crate::block_on(get_storage_persistence(&cap));
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}

mod request_storage_persistence {
    use super::*;

    #[test]
    fn relays_persistent_prompt() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::Persistent,
            permission_state: Some(PermissionState::Prompt),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(request_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_best_effort_denied() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::BestEffort,
            permission_state: Some(PermissionState::Denied),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(request_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_best_effort_null_permission() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::BestEffort,
            permission_state: None,
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(request_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn relays_operation_failed_granted() {
        let expected = StoragePersistenceOutcome {
            outcome: StoragePersistenceOutcomeReason::OperationFailed,
            permission_state: Some(PermissionState::Granted),
        };
        let expected_clone = expected.clone();
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                let e = expected_clone.clone();
                Box::pin(async move { Ok(e) })
                    as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = crate::block_on(request_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, expected.outcome);
        assert_eq!(result.permission_state, expected.permission_state);
    }

    #[test]
    fn calls_backend_exactly_once() {
        let call_count = Arc::new(AtomicUsize::new(0));
        let count = call_count.clone();
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                count.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move {
                    Ok(StoragePersistenceOutcome {
                        outcome: StoragePersistenceOutcomeReason::BestEffort,
                        permission_state: None,
                    })
                }) as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let _ = crate::block_on(request_storage_persistence(&cap));
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}
