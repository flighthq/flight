use std::sync::Arc;

use flight_filesystem::contract::*;
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

fn empty_file_system() -> HostFileSystemCapabilities {
    return HostFileSystemCapabilities { access: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_file_system_capability() -> HostFileSystemCapability {
    return HostFileSystemCapability {
        provider: Arc::new(()),
        append_text_file: None,
        can_access_file: None,
        copy: None,
        directory_exists: None,
        file_exists: None,
        get_file_system_usage: None,
        make_directory: None,
        open_file_read_stream: None,
        open_file_write_stream: None,
        read_binary_file: None,
        read_binary_file_range: None,
        read_directory: None,
        read_directory_recursive: None,
        read_text_file: None,
        remove_directory: None,
        remove_file: None,
        rename: None,
        stat_file: None,
        write_binary_file: None,
        write_file_atomic: None,
        write_text_file: None,
    };
}

mod explain_host_file_system_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_file_system_capabilities(&mut out, &empty_file_system());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "fileSystem".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostFileSystemCapability".to_string(),
                group: "fileSystem".to_string(),
                is_present: false,
                slot: "access".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_access_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut file_system = empty_file_system();
        file_system.access = Some(fixture_host_file_system_capability());
        let mut out = composed_so_far();
        explain_host_file_system_capabilities(&mut out, &file_system);
        assert_eq!(out.groups[1].slots, vec!["access".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostFileSystemCapability".to_string(),
                group: "fileSystem".to_string(),
                is_present: true,
                slot: "access".to_string(),
            },]
        );
    }
}
