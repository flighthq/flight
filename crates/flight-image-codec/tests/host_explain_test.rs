use flight_host::{HostCapabilityGroupExplanation, HostExplanation};
use flight_image_codec::contract::*;

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

fn empty_image_decode() -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: None,
        png: None,
        webp: None,
    };
}

fn empty_image_encode() -> HostImageEncodeCapabilities {
    return HostImageEncodeCapabilities {
        jpeg: None,
        png: None,
        webp: None,
    };
}

mod explain_host_image_decode_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_image_decode_capabilities(&mut out, &empty_image_decode());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "imageDecode".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}

mod explain_host_image_encode_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_image_encode_capabilities(&mut out, &empty_image_encode());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "imageEncode".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
