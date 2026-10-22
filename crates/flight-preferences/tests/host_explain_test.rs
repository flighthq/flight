use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_permissions::HostPreferencesPersistenceQueryCapability;
use flight_preferences::contract::*;

// An entry another group's explainer already appended: each explainer appends after it.
fn composed_so_far() -> HostExplanation {
    return HostExplanation {
        capabilities: Vec::new(),
        groups: vec![HostCapabilityGroupExplanation {
            group: "earlier".to_string(),
            slots: Vec::new(),
        }],
    };
}

fn empty_preferences() -> HostPreferencesCapabilities {
    return HostPreferencesCapabilities {
        change: None,
        local: None,
        persistence_query: None,
        persistence_request: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_preferences_capability() -> HostPreferencesCapability {
    return HostPreferencesCapability {
        clear: Arc::new(|| unreachable!("fixture")),
        get_item: Arc::new(|_| unreachable!("fixture")),
        keys: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
        remove_item: Arc::new(|_| unreachable!("fixture")),
        set_item: Arc::new(|_, _| unreachable!("fixture")),
    };
}

fn fixture_host_preferences_persistence_query_capability()
-> HostPreferencesPersistenceQueryCapability {
    return HostPreferencesPersistenceQueryCapability {
        get_persistence: Arc::new(|| unreachable!("fixture")),
        provider: Arc::new(()),
    };
}

mod explain_host_preferences_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_preferences_capabilities(&mut out, &empty_preferences());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "preferences".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostPreferencesCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: false,
                    slot: "local".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostPreferencesPersistenceQueryCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: false,
                    slot: "persistenceQuery".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_local_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut preferences = empty_preferences();
        preferences.local = Some(fixture_host_preferences_capability());
        let mut out = composed_so_far();
        explain_host_preferences_capabilities(&mut out, &preferences);
        assert_eq!(out.groups[1].slots, vec!["local".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostPreferencesCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: true,
                    slot: "local".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostPreferencesPersistenceQueryCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: false,
                    slot: "persistenceQuery".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_persistence_query_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut preferences = empty_preferences();
        preferences.persistence_query =
            Some(fixture_host_preferences_persistence_query_capability());
        let mut out = composed_so_far();
        explain_host_preferences_capabilities(&mut out, &preferences);
        assert_eq!(out.groups[1].slots, vec!["persistenceQuery".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostPreferencesCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: false,
                    slot: "local".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostPreferencesPersistenceQueryCapability".to_string(),
                    group: "preferences".to_string(),
                    is_present: true,
                    slot: "persistenceQuery".to_string(),
                },
            ]
        );
    }

    #[test]
    fn lists_the_slot_keys_a_populated_group_actually_holds_in_source_order() {
        let mut preferences = empty_preferences();
        preferences.local = Some(fixture_host_preferences_capability());
        preferences.persistence_query =
            Some(fixture_host_preferences_persistence_query_capability());
        let mut out = composed_so_far();
        explain_host_preferences_capabilities(&mut out, &preferences);
        assert_eq!(
            out.groups[1].slots,
            vec!["local".to_string(), "persistenceQuery".to_string()]
        );
    }
}
