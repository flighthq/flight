use std::sync::Arc;

use flight_audio::create_audio_resource;
use flight_swf::contract::{
    SWF_SOUND_HANDLER, initialize_timeline_audio_cue, initialize_timeline_stream_audio_cue,
};
use flight_timeline::contract::{
    TIMELINE_AUDIO_CUE_KIND, TIMELINE_STREAM_AUDIO_CUE_KIND, TimelineAudioCue,
    TimelineAudioEnvelopePoint, TimelineStreamAudioCue, create_timeline_cue_fields,
};

mod initialize_timeline_audio_cue {
    use super::*;

    #[test]
    fn writes_canonical_fields_at_unit_gain() {
        let resource = create_audio_resource(None);
        let mut out = TimelineAudioCue {
            fields: create_timeline_cue_fields(99, "stale"),
            duration: Some(9.0),
            envelope: vec![TimelineAudioEnvelopePoint {
                left_gain: 0.0,
                right_gain: 0.0,
                time: 9.0,
            }],
            gain: 0.0,
            loops: 9,
            offset: 9.0,
            resource: create_audio_resource(None),
            skip_if_playing: true,
            stop: true,
        };
        initialize_timeline_audio_cue(&mut out, resource.clone());
        let envelope = vec![TimelineAudioEnvelopePoint {
            left_gain: 1.0,
            right_gain: 1.0,
            time: 0.0,
        }];
        out.duration = Some(2.5);
        out.envelope = envelope.clone();
        out.fields.frame = 7;
        out.loops = 3;
        out.offset = 0.25;
        out.skip_if_playing = true;

        assert_eq!(out.fields.kind, TIMELINE_AUDIO_CUE_KIND);
        assert_eq!(out.duration, Some(2.5));
        assert_eq!(out.envelope, envelope);
        assert_eq!(out.fields.frame, 7);
        assert_eq!(out.loops, 3);
        assert_eq!(out.offset, 0.25);
        assert!(Arc::ptr_eq(&out.resource, &resource));
        assert!(out.skip_if_playing);
        assert!(!out.stop);
        assert_eq!(out.gain, 1.0);
    }
}

mod initialize_timeline_stream_audio_cue {
    use super::*;

    #[test]
    fn writes_canonical_fields_at_unit_gain() {
        let resource = create_audio_resource(None);
        let mut out = TimelineStreamAudioCue {
            fields: create_timeline_cue_fields(99, "stale"),
            gain: 0.0,
            resource: create_audio_resource(None),
        };
        initialize_timeline_stream_audio_cue(&mut out, resource.clone());
        out.fields.frame = 4;

        assert_eq!(out.fields.kind, TIMELINE_STREAM_AUDIO_CUE_KIND);
        assert_eq!(out.fields.frame, 4);
        assert!(Arc::ptr_eq(&out.resource, &resource));
        assert_eq!(out.gain, 1.0);
    }
}

#[test]
fn claims_the_event_and_stream_sound_tags() {
    let mut tags = SWF_SOUND_HANDLER.tags.clone();
    tags.sort_unstable();
    assert_eq!(tags, vec![14, 15, 18, 19, 45, 89]);
}

#[test]
fn defers_cross_tag_work_to_resolve_and_stream_assembly_to_finish_timeline() {
    assert!(SWF_SOUND_HANDLER.resolve.is_some());
    assert!(SWF_SOUND_HANDLER.finish_timeline.is_some());
}

#[test]
fn contributes_resources_but_claims_no_placed_character() {
    let instantiate = SWF_SOUND_HANDLER.instantiate.as_ref().unwrap();
    assert!(instantiate.create_resources.is_some());
    assert!(instantiate.create_placement_node.is_none());
    assert!(instantiate.has_placement_content.is_none());
}
