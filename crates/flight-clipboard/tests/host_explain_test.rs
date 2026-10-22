use std::sync::Arc;

use flight_clipboard::contract::*;
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

fn empty_clipboard() -> HostClipboardCapabilities {
    return HostClipboardCapabilities {
        bookmark: None,
        change: None,
        formats: None,
        image: None,
        text: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_clipboard_formats_capability() -> HostClipboardFormatsCapability {
    return HostClipboardFormatsCapability {
        get_formats: Arc::new(|| unreachable!("fixture")),
        has_format: Arc::new(|_| unreachable!("fixture")),
        read_format: Arc::new(|_| unreachable!("fixture")),
        read_html: Arc::new(|| unreachable!("fixture")),
        read_items: Arc::new(|_| unreachable!("fixture")),
        read_rtf: Arc::new(|| unreachable!("fixture")),
        write_format: Arc::new(|_, _| unreachable!("fixture")),
        write_html: Arc::new(|_| unreachable!("fixture")),
        write_items: Arc::new(|_| unreachable!("fixture")),
        write_rtf: Arc::new(|_| unreachable!("fixture")),
    };
}

mod explain_host_clipboard_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_clipboard_capabilities(&mut out, &empty_clipboard());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "clipboard".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostClipboardFormatsCapability".to_string(),
                group: "clipboard".to_string(),
                is_present: false,
                slot: "formats".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_formats_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut clipboard = empty_clipboard();
        clipboard.formats = Some(fixture_host_clipboard_formats_capability());
        let mut out = composed_so_far();
        explain_host_clipboard_capabilities(&mut out, &clipboard);
        assert_eq!(out.groups[1].slots, vec!["formats".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostClipboardFormatsCapability".to_string(),
                group: "clipboard".to_string(),
                is_present: true,
                slot: "formats".to_string(),
            },]
        );
    }
}
