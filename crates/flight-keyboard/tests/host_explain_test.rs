use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_keyboard::contract::*;

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

fn empty_soft_keyboard() -> HostSoftKeyboardCapabilities {
    return HostSoftKeyboardCapabilities {
        accessory_bar: None,
        change: None,
        info: None,
        resize_mode_write: None,
        scroll_assist: None,
        style: None,
        visibility: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_soft_keyboard_info_capability() -> HostSoftKeyboardInfoCapability {
    return HostSoftKeyboardInfoCapability {
        get_info: Arc::new(|_| unreachable!("fixture")),
    };
}

mod explain_host_soft_keyboard_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_soft_keyboard_capabilities(&mut out, &empty_soft_keyboard());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "softKeyboard".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSoftKeyboardInfoCapability".to_string(),
                group: "softKeyboard".to_string(),
                is_present: false,
                slot: "info".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_info_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut soft_keyboard = empty_soft_keyboard();
        soft_keyboard.info = Some(fixture_host_soft_keyboard_info_capability());
        let mut out = composed_so_far();
        explain_host_soft_keyboard_capabilities(&mut out, &soft_keyboard);
        assert_eq!(out.groups[1].slots, vec!["info".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostSoftKeyboardInfoCapability".to_string(),
                group: "softKeyboard".to_string(),
                is_present: true,
                slot: "info".to_string(),
            },]
        );
    }
}
