use flight_audio::contract::*;
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

fn empty_audio_decode() -> HostAudioDecodeCapabilities {
    return HostAudioDecodeCapabilities {
        aac: None,
        flac: None,
        mp3: None,
        mp4: None,
        ogg: None,
        wav: None,
        webm: None,
    };
}

mod explain_host_audio_decode_capabilities {
    use super::*;

    #[test]
    fn appends_the_group_after_earlier_groups_with_no_slots_and_covered_slots_absent_when_empty() {
        let mut out = composed_so_far();
        explain_host_audio_decode_capabilities(&mut out, &empty_audio_decode());
        assert_eq!(
            out.groups,
            vec![
                composed_so_far().groups[0].clone(),
                HostCapabilityGroupExplanation {
                    group: "audioDecode".to_string(),
                    slots: Vec::new(),
                },
            ]
        );
        assert_eq!(out.capabilities, Vec::new());
    }
}
