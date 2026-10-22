use std::sync::Arc;

use flight_midi::contract::*;

use crate::{block_on, error};

mod get_midi_permission {
    use super::*;

    #[test]
    fn queries_only_the_explicit_owner_and_maps_rejection() {
        let provider: flight_host::ProviderRef = Arc::new("midi-permission".to_string());
        let capability = HostMidiPermissionCapability {
            get_permission: Arc::new(|| {
                Box::pin(async {
                    Ok(PermissionQueryOutcome {
                        reason: PermissionQueryReason::Ok,
                        state: Some(PermissionState::Granted),
                    })
                })
            }),
            provider: provider.clone(),
        };
        assert_eq!(
            block_on(get_midi_permission(&capability)),
            PermissionQueryOutcome {
                reason: PermissionQueryReason::Ok,
                state: Some(PermissionState::Granted),
            }
        );
        assert!(Arc::ptr_eq(&capability.provider, &provider));

        let rejected = HostMidiPermissionCapability {
            get_permission: Arc::new(|| Box::pin(async { Err(error()) })),
            provider: Arc::new(()),
        };
        assert_eq!(
            block_on(get_midi_permission(&rejected)),
            PermissionQueryOutcome {
                reason: PermissionQueryReason::OperationFailed,
                state: None,
            }
        );
    }
}
