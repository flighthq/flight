use std::sync::Arc;

use flight_font::contract::*;
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

fn empty_font() -> HostFontCapabilities {
    return HostFontCapabilities { loader: None };
}

fn empty_glyph() -> HostGlyphCapabilities {
    return HostGlyphCapabilities { rasterizer: None };
}

// Capability stand-ins: every callback is unreachable, as these tests read only whether a slot is
// filled.
fn fixture_host_font_loading_capability() -> HostFontLoadingCapability {
    return HostFontLoadingCapability {
        add_font_face: Arc::new(|_| unreachable!("fixture")),
        check_font_face: Arc::new(|_| unreachable!("fixture")),
        create_font_face: Arc::new(|_, _| unreachable!("fixture")),
        load_font_face: Arc::new(|_| unreachable!("fixture")),
        load_font_faces: Arc::new(|_| unreachable!("fixture")),
        provider: Arc::new(()),
        when_ready: Arc::new(|| unreachable!("fixture")),
    };
}

fn fixture_host_glyph_rasterizer_capability() -> HostGlyphRasterizerCapability {
    return HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_, _| unreachable!("fixture")),
    };
}

mod explain_host_font_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_font_capabilities(&mut out, &empty_font());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "font".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostFontLoadingCapability".to_string(),
                group: "font".to_string(),
                is_present: false,
                slot: "loader".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_loader_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut font = empty_font();
        font.loader = Some(fixture_host_font_loading_capability());
        let mut out = composed_so_far();
        explain_host_font_capabilities(&mut out, &font);
        assert_eq!(out.groups[1].slots, vec!["loader".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostFontLoadingCapability".to_string(),
                group: "font".to_string(),
                is_present: true,
                slot: "loader".to_string(),
            },]
        );
    }
}

mod explain_host_glyph_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_glyph_capabilities(&mut out, &empty_glyph());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "glyph".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostGlyphRasterizerCapability".to_string(),
                group: "glyph".to_string(),
                is_present: false,
                slot: "rasterizer".to_string(),
            },]
        );
    }

    #[test]
    fn reports_the_rasterizer_slot_filled_and_its_capability_present_once_it_is_filled() {
        let mut glyph = empty_glyph();
        glyph.rasterizer = Some(fixture_host_glyph_rasterizer_capability());
        let mut out = composed_so_far();
        explain_host_glyph_capabilities(&mut out, &glyph);
        assert_eq!(out.groups[1].slots, vec!["rasterizer".to_string()]);
        assert_eq!(
            out.capabilities,
            vec![HostCapabilityCoverage {
                capability: "HostGlyphRasterizerCapability".to_string(),
                group: "glyph".to_string(),
                is_present: true,
                slot: "rasterizer".to_string(),
            },]
        );
    }
}
