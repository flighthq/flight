use std::sync::Arc;

use flight_bitmap::contract::*;
use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

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

fn empty_bitmap() -> HostBitmapCapabilities {
    return HostBitmapCapabilities {
        encode: None,
        readback: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_bitmap_encode_capability() -> HostBitmapEncodeCapability {
    return HostBitmapEncodeCapability {
        provider: Arc::new(()),
        encode_bitmap: Arc::new(|_, _, _| unreachable!("fixture")),
        supported_formats: Vec::new(),
    };
}

fn fixture_host_bitmap_readback_capability() -> HostBitmapReadbackCapability {
    return HostBitmapReadbackCapability {
        provider: Arc::new(()),
        read_bitmap: Arc::new(|_, _, _, _| unreachable!("fixture")),
    };
}

mod explain_host_bitmap_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_bitmap_capabilities(&mut out, &empty_bitmap());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "bitmap".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostBitmapEncodeCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: false,
                    slot: "encode".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostBitmapReadbackCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: false,
                    slot: "readback".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_encode_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut bitmap = empty_bitmap();
        bitmap.encode = Some(fixture_host_bitmap_encode_capability());
        let mut out = composed_so_far();
        explain_host_bitmap_capabilities(&mut out, &bitmap);
        assert_eq!(out.groups[1].slots, vec!["encode".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostBitmapEncodeCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: true,
                    slot: "encode".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostBitmapReadbackCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: false,
                    slot: "readback".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reports_the_readback_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut bitmap = empty_bitmap();
        bitmap.readback = Some(fixture_host_bitmap_readback_capability());
        let mut out = composed_so_far();
        explain_host_bitmap_capabilities(&mut out, &bitmap);
        assert_eq!(out.groups[1].slots, vec!["readback".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![
                HostCapabilityCoverage {
                    capability: "HostBitmapEncodeCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: false,
                    slot: "encode".to_string(),
                },
                HostCapabilityCoverage {
                    capability: "HostBitmapReadbackCapability".to_string(),
                    group: "bitmap".to_string(),
                    is_present: true,
                    slot: "readback".to_string(),
                },
            ]
        );
    }

    #[test]
    fn lists_the_slot_keys_a_populated_group_actually_holds_in_source_order() {
        let mut bitmap = empty_bitmap();
        bitmap.encode = Some(fixture_host_bitmap_encode_capability());
        bitmap.readback = Some(fixture_host_bitmap_readback_capability());
        let mut out = composed_so_far();
        explain_host_bitmap_capabilities(&mut out, &bitmap);
        assert_eq!(
            out.groups[1].slots,
            vec!["encode".to_string(), "readback".to_string()]
        );
    }
}
