use std::sync::Arc;

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};
use flight_surface::contract::*;

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

fn empty_canvas() -> HostCanvasCapabilities {
    return HostCanvasCapabilities { context: None };
}

fn empty_gl() -> HostGlCapabilities {
    return HostGlCapabilities { context: None };
}

fn empty_surface() -> HostSurfaceCapabilities {
    return HostSurfaceCapabilities {
        display: None,
        resize: None,
    };
}

fn empty_wgpu() -> HostWgpuCapabilities {
    return HostWgpuCapabilities { context: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_wgpu_capability() -> HostWgpuCapability {
    return HostWgpuCapability {
        provider: Arc::new(()),
        acquire: Arc::new(|_, _| unreachable!("fixture")),
        attach_surface: Arc::new(|_, _| unreachable!("fixture")),
        create: Arc::new(|_, _, _| unreachable!("fixture")),
        is_supported: Arc::new(|| unreachable!("fixture")),
        release: Arc::new(|_| unreachable!("fixture")),
    };
}

mod explain_host_canvas_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_canvas_capabilities(&mut out, &empty_canvas());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "canvas".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_gl_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_gl_capabilities(&mut out, &empty_gl());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "gl".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_surface_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_surface_capabilities(&mut out, &empty_surface());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "surface".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_wgpu_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_wgpu_capabilities(&mut out, &empty_wgpu());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "wgpu".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostWgpuCapability".to_string(),
                group: "wgpu".to_string(),
                is_present: false,
                slot: "context".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_context_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut wgpu = empty_wgpu();
        wgpu.context = Some(fixture_host_wgpu_capability());
        let mut out = composed_so_far();
        explain_host_wgpu_capabilities(&mut out, &wgpu);
        assert_eq!(out.groups[1].slots, vec!["context".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostWgpuCapability".to_string(),
                group: "wgpu".to_string(),
                is_present: true,
                slot: "context".to_string(),
            },]
        );
    }
}
