use std::sync::Arc;

use flight_app::contract::*;
use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

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

fn empty_app() -> HostAppCapabilities {
    return HostAppCapabilities {
        activate: None,
        activation_policy: None,
        all_windows_closed: None,
        badge: None,
        dock: None,
        exit: None,
        focus: None,
        hide: None,
        locale: None,
        login_item: None,
        loop_: None,
        name: None,
        name_write: None,
        open_file: None,
        path: None,
        quit: None,
        quit_request: None,
        ready: None,
        recent_documents: None,
        relaunch: None,
        second_instance: None,
        show: None,
        single_instance: None,
        user_model_id: None,
        version: None,
    };
}

fn empty_fullscreen() -> HostFullscreenCapabilities {
    return HostFullscreenCapabilities { element: None };
}

fn empty_window() -> HostWindowCapabilities {
    return HostWindowCapabilities {
        appearance: None,
        attach: None,
        attention: None,
        content_protection: None,
        focus: None,
        fullscreen: None,
        geometry: None,
        hierarchy: None,
        lifecycle: None,
        progress: None,
        shadow: None,
        shell: None,
        size_constraints: None,
        state: None,
        visibility: None,
        z_order: None,
    };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_window_geometry_capability() -> HostWindowGeometryCapability {
    return HostWindowGeometryCapability {
        provider: Arc::new(()),
        center: None,
        get_bounds: Arc::new(|_, _| unreachable!("fixture")),
        set_position: Arc::new(|_, _, _| unreachable!("fixture")),
        set_size: Arc::new(|_, _, _| unreachable!("fixture")),
        subscribe_move: None,
        subscribe_resize: None,
    };
}

fn fixture_host_window_lifecycle_capability() -> HostWindowLifecycleCapability {
    return HostWindowLifecycleCapability {
        provider: Arc::new(()),
        close: Arc::new(|_| unreachable!("fixture")),
        open: Arc::new(|_, _| unreachable!("fixture")),
        subscribe_close: None,
    };
}

mod explain_host_app_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_app_capabilities(&mut out, &empty_app());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "app".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_fullscreen_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_fullscreen_capabilities(&mut out, &empty_fullscreen());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "fullscreen".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_window_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_window_capabilities(&mut out, &empty_window());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "window".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }

    #[test]
    fn lists_the_slot_keys_a_populated_group_actually_holds_in_source_order() {
        let mut window = empty_window();
        window.geometry = Some(fixture_host_window_geometry_capability());
        window.lifecycle = Some(fixture_host_window_lifecycle_capability());
        let mut out = composed_so_far();
        explain_host_window_capabilities(&mut out, &window);
        assert_eq!(
            out.groups[1].slots,
            vec!["geometry".to_string(), "lifecycle".to_string()]
        );
    }
}
