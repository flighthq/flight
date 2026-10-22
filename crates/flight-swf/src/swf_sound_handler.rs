use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

use flight_audio::{
    AudioResource, AudioResourceReference, EmbeddedAudioResourceReferenceValue,
    create_audio_resource, create_embedded_audio_resource_reference,
};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_timeline::contract::{
    TIMELINE_AUDIO_CUE_KIND, TIMELINE_STREAM_AUDIO_CUE_KIND, TimelineAudioCue,
    TimelineAudioEnvelopePoint, TimelineCue, TimelineStreamAudioCue, create_timeline_cue_fields,
};

use crate::{
    SwfReader, SwfSoundCueAwaitingClass, SwfSoundCueAwaitingRate, SwfSoundDefinition,
    SwfStreamSound, SwfTagHandler, SwfTagHandlerInstantiation, SwfTagHandlerRef, SwfTagParseResult,
    SwfTagParseState, SwfTagTimelineState,
};

pub static SWF_SOUND_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: Some(Arc::new(|state, timeline| {
            append_swf_stream_sound_cue(
                state,
                &mut timeline.cues,
                &timeline.stream_chunks,
                timeline.stream_start_frame,
            );
        })),
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: None,
            create_resources: Some(Arc::new(|parsed, out| {
                out.audio.extend(create_swf_audio_resources(parsed));
            })),
            has_placement_content: None,
        }),
        parse: Arc::new(|body, tag, state, timeline, _diagnostics| {
            if tag == TAG_DEFINE_SOUND {
                read_swf_sound_definition(body, state);
            } else if tag == TAG_START_SOUND {
                read_swf_start_sound(
                    body,
                    state,
                    &mut timeline.cues,
                    timeline.frames.len() as i32 + 1,
                );
            } else if tag == TAG_START_SOUND_2 {
                read_swf_start_sound_2(
                    body,
                    state,
                    &mut timeline.cues,
                    timeline.frames.len() as i32 + 1,
                );
            } else if tag == TAG_SOUND_STREAM_BLOCK {
                append_swf_stream_sound_chunk(body, state, timeline);
            } else {
                let declared = read_swf_sound_stream_head(body);
                if declared >= 0 {
                    timeline.stream_format = declared;
                    timeline.stream_start_frame = timeline.frames.len() as i32 + 1;
                }
            }
            return true;
        }),
        resolve: Some(Arc::new(|state, _timeline| {
            resolve_swf_sound_class_cues(state);
            convert_swf_sound_cue_times(state);
        })),
        tags: vec![
            TAG_DEFINE_SOUND,
            TAG_START_SOUND,
            TAG_START_SOUND_2,
            TAG_SOUND_STREAM_HEAD,
            TAG_SOUND_STREAM_HEAD_2,
            TAG_SOUND_STREAM_BLOCK,
        ],
    })
});

struct SwfSoundInfo {
    envelope: Vec<TimelineAudioEnvelopePoint>,
    in_point_samples: u32,
    loop_count: u16,
    out_point_samples: Option<u32>,
    skip_if_playing: bool,
    stop: bool,
}

const TAG_DEFINE_SOUND: u32 = 14;

const TAG_SOUND_STREAM_BLOCK: u32 = 19;

const TAG_SOUND_STREAM_HEAD: u32 = 18;

const TAG_SOUND_STREAM_HEAD_2: u32 = 45;

const TAG_START_SOUND: u32 = 15;

const TAG_START_SOUND_2: u32 = 89;

const SOUND_ENVELOPE_LEVEL_ONE: u16 = 32_768;

// flight-lint: allow(f64) timeline cue times are source seconds and retain the timeline contract's double-precision timing lane
const SOUND_ENVELOPE_RATE: f64 = 44_100.0;

const SOUND_INFO_HAS_ENVELOPE: u8 = 0x08;

const SOUND_INFO_HAS_IN_POINT: u8 = 0x01;

const SOUND_INFO_HAS_LOOPS: u8 = 0x04;

const SOUND_INFO_HAS_OUT_POINT: u8 = 0x02;

const SOUND_INFO_SYNC_NO_MULTIPLE: u8 = 0x10;

const SOUND_INFO_SYNC_STOP: u8 = 0x20;

const SOUND_FORMAT_MP3: u8 = 2;

const SOUND_FORMAT_NELLYMOSER_16K: u8 = 4;

const SOUND_FORMAT_NELLYMOSER_8K: u8 = 5;

const SWF_SOUND_RATES: [f32; 4] = [5_512.0, 11_025.0, 22_050.0, 44_100.0];

// flight-lint: allow(f64) SWF sample positions become the timeline contract's double-precision seconds
fn create_swf_audio_cue(
    info: &SwfSoundInfo,
    frame: i32,
    resource: Ref<AudioResource>,
) -> Ref<TimelineAudioCue> {
    let mut out = TimelineAudioCue {
        fields: create_timeline_cue_fields(0, TIMELINE_AUDIO_CUE_KIND),
        duration: None,
        envelope: Vec::new(),
        gain: 1.0,
        loops: 1,
        offset: 0.0,
        resource: resource.clone(),
        skip_if_playing: false,
        stop: false,
    };
    initialize_timeline_audio_cue(&mut out, resource);
    out.duration = if info.stop {
        None
    } else {
        info.out_point_samples.map(f64::from)
    };
    out.envelope = if info.stop {
        Vec::new()
    } else {
        info.envelope.clone()
    };
    out.fields.frame = frame;
    out.loops = if info.stop {
        1
    } else {
        i32::from(info.loop_count.max(1))
    };
    out.offset = if info.stop {
        0.0
    } else {
        f64::from(info.in_point_samples)
    };
    out.skip_if_playing = !info.stop && info.skip_if_playing;
    out.stop = info.stop;
    return Arc::new(RwLock::new(out));
}

fn create_swf_audio_resources(parsed: &SwfTagParseResult) -> Vec<AudioResourceReference> {
    let mut resources = Vec::new();
    for character_id in &parsed.state.sound_order {
        let Some(sound) = parsed.state.sounds.get(character_id) else {
            continue;
        };
        let reference = create_embedded_audio_resource_reference(sound.bytes.clone());
        {
            let mut reference = reference.write().unwrap();
            reference.mime_type = sound.mime_type.clone();
            reference.name = parsed.state.linkages.get(character_id).cloned();
            if let Some(shared) = parsed.state.sound_resources.get(character_id) {
                reference.resource = shared.clone();
            }
        }
        resources.push(AudioResourceReference::Embedded(
            EmbeddedAudioResourceReferenceValue { reference },
        ));
    }
    for stream in &parsed.state.stream_sounds {
        let reference = create_embedded_audio_resource_reference(stream.bytes.clone());
        {
            let mut reference = reference.write().unwrap();
            reference.mime_type = Some(stream.mime_type.clone());
            reference.resource = stream.resource.clone();
        }
        resources.push(AudioResourceReference::Embedded(
            EmbeddedAudioResourceReferenceValue { reference },
        ));
    }
    return resources;
}

fn create_swf_sound_mime_type(format: u8, flags: u8) -> Option<String> {
    if format == SOUND_FORMAT_MP3 {
        return Some(String::from("audio/mpeg"));
    }
    let essence = match format {
        0 | 3 => "audio/vnd.adobe.swf-pcm",
        1 => "audio/vnd.adobe.swf-adpcm",
        4..=6 => "audio/vnd.adobe.swf-nellymoser",
        11 => "audio/vnd.adobe.swf-speex",
        _ => return None,
    };
    let channels = if flags & 0x01 == 0 { 1 } else { 2 };
    let bits = if flags & 0x02 == 0 { 8 } else { 16 };
    return Some(format!(
        "{essence}; rate={}; channels={channels}; bits={bits}",
        resolve_swf_sound_sample_rate(format, flags)
    ));
}

/// Restores the canonical event-cue state while retaining the defining audio resource.
// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps the defining resource while callers assign authored cue fields after initialization
pub fn initialize_timeline_audio_cue(out: &mut TimelineAudioCue, resource: Ref<AudioResource>) {
    out.duration = None;
    out.envelope.clear();
    out.fields.frame = 0;
    out.gain = 1.0;
    out.fields.kind = String::from(TIMELINE_AUDIO_CUE_KIND);
    out.loops = 1;
    out.offset = 0.0;
    out.resource = resource;
    out.skip_if_playing = false;
    out.stop = false;
}

/// Restores the canonical stream-cue state while retaining the defining audio resource.
// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps the defining resource while callers assign the authored start frame after initialization
pub fn initialize_timeline_stream_audio_cue(
    out: &mut TimelineStreamAudioCue,
    resource: Ref<AudioResource>,
) {
    out.fields.frame = 0;
    out.gain = 1.0;
    out.fields.kind = String::from(TIMELINE_STREAM_AUDIO_CUE_KIND);
    out.resource = resource;
}

fn acquire_swf_sound_resource(
    state: &mut SwfTagParseState,
    character_id: u32,
) -> Ref<AudioResource> {
    if let Some(existing) = state.sound_resources.get(&character_id) {
        return existing.clone();
    }
    let resource = create_audio_resource(None);
    state.sound_resources.insert(character_id, resource.clone());
    return resource;
}

fn append_swf_stream_sound_chunk(
    body: &mut SwfReader,
    state: &SwfTagParseState,
    timeline: &mut SwfTagTimelineState,
) {
    if timeline.stream_format == i32::from(SOUND_FORMAT_MP3) {
        body.read_uint16();
        body.read_uint16();
        if body.valid && body.pos < body.end {
            let chunk = {
                let source = body.source.read().unwrap();
                source[body.pos..body.end].to_vec().into_boxed_slice()
            };
            timeline.stream_chunks.push(Arc::new(RwLock::new(chunk)));
        }
        return;
    }
    if timeline.stream_format < 0 {
        return;
    }
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from("swf.axis.sound-format-non-mp3")),
    );
    detail.insert(
        String::from("format"),
        ImportDiagnosticDetailValue::Number(timeline.stream_format as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Skip,
        "swf.stream-sound-format",
        "readSwfTimeline",
        Some(detail),
    );
}

fn append_swf_stream_sound_cue(
    state: &mut SwfTagParseState,
    cues: &mut Vec<Ref<dyn TimelineCue>>,
    chunks: &[Ref<Box<Uint8Array>>],
    start_frame: i32,
) {
    if chunks.is_empty() {
        return;
    }
    let length: usize = chunks.iter().map(|chunk| chunk.read().unwrap().len()).sum();
    if length == 0 {
        return;
    }
    let mut bytes = Vec::with_capacity(length);
    for chunk in chunks {
        bytes.extend_from_slice(&chunk.read().unwrap());
    }
    let bytes = Arc::new(RwLock::new(bytes.into_boxed_slice()));
    let resource = create_audio_resource(None);
    state.stream_sounds.push(SwfStreamSound {
        bytes,
        mime_type: String::from("audio/mpeg"),
        resource: resource.clone(),
    });
    let mut out = TimelineStreamAudioCue {
        fields: create_timeline_cue_fields(0, TIMELINE_STREAM_AUDIO_CUE_KIND),
        gain: 1.0,
        resource: resource.clone(),
    };
    initialize_timeline_stream_audio_cue(&mut out, resource);
    out.fields.frame = start_frame;
    let cue: Ref<TimelineStreamAudioCue> = Arc::new(RwLock::new(out));
    let cue: Ref<dyn TimelineCue> = cue;
    cues.push(cue);
}

// flight-lint: allow(f64) SWF sample positions become the timeline contract's double-precision seconds
fn convert_swf_sound_cue_times(state: &mut SwfTagParseState) {
    for pending in &state.sound_cues_awaiting_rate {
        let Some(sound) = state.sounds.get(&pending.character_id) else {
            continue;
        };
        let mut cue = pending.cue.write().unwrap();
        let in_point = cue.offset / f64::from(sound.sample_rate);
        cue.duration = cue
            .duration
            .map(|duration| duration / f64::from(sound.sample_rate) - in_point);
        cue.offset = in_point;
    }
}

fn read_swf_sound_definition(body: &mut SwfReader, state: &mut SwfTagParseState) {
    let character_id = u32::from(body.read_uint16());
    let flags = body.read_uint8();
    body.read_uint32();
    if !body.valid || character_id == 0 || state.sounds.contains_key(&character_id) {
        return;
    }
    let format = flags >> 4;
    if format == SOUND_FORMAT_MP3 {
        body.read_uint16();
    }
    if !body.valid {
        return;
    }
    let bytes = {
        let source = body.source.read().unwrap();
        source[body.pos..body.end].to_vec().into_boxed_slice()
    };
    state.sound_order.push(character_id);
    state.sounds.insert(
        character_id,
        SwfSoundDefinition {
            bytes: Arc::new(RwLock::new(bytes)),
            mime_type: create_swf_sound_mime_type(format, flags),
            sample_rate: resolve_swf_sound_sample_rate(format, flags),
        },
    );
}

// flight-lint: allow(f64) envelope positions are divided into the timeline contract's double-precision seconds
fn read_swf_sound_info(body: &mut SwfReader) -> Option<SwfSoundInfo> {
    let flags = body.read_uint8();
    if !body.valid {
        return None;
    }
    let in_point_samples = if flags & SOUND_INFO_HAS_IN_POINT != 0 {
        body.read_uint32()
    } else {
        0
    };
    let out_point_samples = if flags & SOUND_INFO_HAS_OUT_POINT != 0 {
        Some(body.read_uint32())
    } else {
        None
    };
    let loop_count = if flags & SOUND_INFO_HAS_LOOPS != 0 {
        body.read_uint16()
    } else {
        1
    };
    let mut envelope = Vec::new();
    if flags & SOUND_INFO_HAS_ENVELOPE != 0 {
        let points = body.read_uint8();
        for _ in 0..points {
            if !body.valid {
                break;
            }
            let position = body.read_uint32();
            let left_level = body.read_uint16();
            let right_level = body.read_uint16();
            if !body.valid {
                return None;
            }
            envelope.push(TimelineAudioEnvelopePoint {
                left_gain: f32::from(left_level.min(SOUND_ENVELOPE_LEVEL_ONE))
                    / f32::from(SOUND_ENVELOPE_LEVEL_ONE),
                right_gain: f32::from(right_level.min(SOUND_ENVELOPE_LEVEL_ONE))
                    / f32::from(SOUND_ENVELOPE_LEVEL_ONE),
                time: f64::from(position) / SOUND_ENVELOPE_RATE,
            });
        }
    }
    if !body.valid {
        return None;
    }
    return Some(SwfSoundInfo {
        envelope,
        in_point_samples,
        loop_count,
        out_point_samples,
        skip_if_playing: flags & SOUND_INFO_SYNC_NO_MULTIPLE != 0,
        stop: flags & SOUND_INFO_SYNC_STOP != 0,
    });
}

fn read_swf_sound_stream_head(body: &mut SwfReader) -> i32 {
    body.read_uint8();
    let stream_flags = body.read_uint8();
    let samples_per_frame = body.read_uint16();
    if !body.valid || samples_per_frame == 0 {
        return -1;
    }
    return i32::from(stream_flags >> 4);
}

fn read_swf_start_sound(
    body: &mut SwfReader,
    state: &mut SwfTagParseState,
    cues: &mut Vec<Ref<dyn TimelineCue>>,
    frame: i32,
) {
    let character_id = u32::from(body.read_uint16());
    let Some(info) = read_swf_sound_info(body) else {
        return;
    };
    if character_id == 0 {
        return;
    }
    let resource = acquire_swf_sound_resource(state, character_id);
    let cue = create_swf_audio_cue(&info, frame, resource);
    let timeline_cue: Ref<dyn TimelineCue> = cue.clone();
    cues.push(timeline_cue);
    state
        .sound_cues_awaiting_rate
        .push(SwfSoundCueAwaitingRate { character_id, cue });
}

fn read_swf_start_sound_2(
    body: &mut SwfReader,
    state: &mut SwfTagParseState,
    cues: &mut Vec<Ref<dyn TimelineCue>>,
    frame: i32,
) {
    let class_name = body.read_string();
    let Some(info) = read_swf_sound_info(body) else {
        return;
    };
    if class_name.is_empty() {
        return;
    }
    let cue = create_swf_audio_cue(&info, frame, create_audio_resource(None));
    let timeline_cue: Ref<dyn TimelineCue> = cue.clone();
    cues.push(timeline_cue);
    state
        .sound_cues_awaiting_class
        .push(SwfSoundCueAwaitingClass { class_name, cue });
}

// flight-lint: allow(hashmap-iteration) SymbolClass names are unique bindings in valid SWF input, so the reverse-map writes commute
fn resolve_swf_sound_class_cues(state: &mut SwfTagParseState) {
    if state.sound_cues_awaiting_class.is_empty() {
        return;
    }
    let character_ids: HashMap<String, u32> = state
        .linkages
        .iter()
        .map(|(character_id, name)| (name.clone(), *character_id))
        .collect();
    for pending in &state.sound_cues_awaiting_class {
        let Some(character_id) = character_ids.get(&pending.class_name).copied() else {
            continue;
        };
        let existing = state.sound_resources.get(&character_id).cloned();
        let resource = if let Some(existing) = existing {
            pending.cue.write().unwrap().resource = existing.clone();
            existing
        } else {
            let resource = pending.cue.read().unwrap().resource.clone();
            state.sound_resources.insert(character_id, resource.clone());
            resource
        };
        drop(resource);
        state
            .sound_cues_awaiting_rate
            .push(SwfSoundCueAwaitingRate {
                character_id,
                cue: pending.cue.clone(),
            });
    }
}

fn resolve_swf_sound_sample_rate(format: u8, flags: u8) -> f32 {
    if format == SOUND_FORMAT_NELLYMOSER_8K {
        return 8_000.0;
    }
    if format == SOUND_FORMAT_NELLYMOSER_16K {
        return 16_000.0;
    }
    return SWF_SOUND_RATES[usize::from((flags >> 2) & 0x03)];
}
