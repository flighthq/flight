use std::collections::HashMap;

use flight_skeleton2d_formats::contract::*;

pub fn spine_binary_header(version: &str) -> Vec<u8> {
    let mut bytes = vec![0x8a, 0xd7, 0xc5, 0x11, 0x20, 0xe3, 0x33, 0x57];
    bytes.extend(spine_binary_string(version));
    bytes.extend([0; 4]);
    return bytes;
}

pub fn minimal_spine_binary(version: &str) -> Vec<u8> {
    let mut bytes = vec![0x8a, 0xd7, 0xc5, 0x11, 0x20, 0xe3, 0x33, 0x57];
    bytes.extend(spine_binary_string(version));
    bytes.extend([0; 16]);
    bytes.push(0);
    bytes.extend([0; 10]);
    return bytes;
}

pub fn spine_binary_with_bones(version: &str, count: usize) -> Vec<u8> {
    let mut bytes = vec![0x8a, 0xd7, 0xc5, 0x11, 0x20, 0xe3, 0x33, 0x57];
    bytes.extend(spine_binary_string(version));
    bytes.extend([0; 16]);
    bytes.push(0);
    bytes.push(0);
    bytes.extend(spine_binary_varint(count));
    for index in 0..count {
        bytes.extend(spine_binary_string(&format!("bone{index}")));
        if index > 0 {
            bytes.push(0);
        }
        bytes.extend([0; 32]);
        bytes.extend([0; 2]);
    }
    bytes.extend([0; 8]);
    return bytes;
}

fn spine_binary_string(value: &str) -> Vec<u8> {
    let mut bytes = spine_binary_varint(value.len() + 1);
    bytes.extend(value.bytes());
    return bytes;
}

fn spine_binary_varint(mut value: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    while value > 0x7f {
        bytes.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }
    bytes.push(value as u8);
    return bytes;
}

pub fn with_empty_dragon_bones_section(
    action: impl for<'a> FnOnce(&mut DragonBonesSectionContext<'a>),
) {
    let doc = JsonRecord::new();
    let armature = JsonRecord::new();
    let registry = create_dragon_bones_registry();
    let mut diagnostics = Vec::new();
    let mut context = DragonBonesSectionContext {
        animations: Vec::new(),
        armature: &armature,
        bone_index_by_name: HashMap::new(),
        bones: Vec::new(),
        diagnostics: Some(&mut diagnostics),
        display_table: HashMap::new(),
        doc: &doc,
        frame_rate: 24.0,
        raw_index_to_output: Vec::new(),
        registry: &registry,
        skins: Vec::new(),
        slot_order: HashMap::new(),
        slots: Vec::new(),
    };
    action(&mut context);
}

pub fn with_empty_dragon_bones_timeline(
    action: impl for<'a, 'b> FnOnce(&mut DragonBonesTimelineContext<'a, 'b>, &JsonRecord),
) {
    let doc = JsonRecord::new();
    let armature = JsonRecord::new();
    let animation = JsonRecord::new();
    let registry = create_dragon_bones_registry();
    let mut diagnostics = Vec::new();
    let mut section = DragonBonesSectionContext {
        animations: Vec::new(),
        armature: &armature,
        bone_index_by_name: HashMap::new(),
        bones: Vec::new(),
        diagnostics: Some(&mut diagnostics),
        display_table: HashMap::new(),
        doc: &doc,
        frame_rate: 24.0,
        raw_index_to_output: Vec::new(),
        registry: &registry,
        skins: Vec::new(),
        slot_order: HashMap::new(),
        slots: Vec::new(),
    };
    let mut timeline = DragonBonesTimelineContext {
        channels: Vec::new(),
        section: &mut section,
        unmodeled_timeline_counts: HashMap::new(),
        unresolved_bone_count: 0,
        unregistered_timeline_counts: HashMap::new(),
    };
    action(&mut timeline, &animation);
}

pub fn with_empty_spine_binary_section(
    action: impl for<'a> FnOnce(&mut SpineBinarySectionContext<'a>),
) {
    let bytes = [0_u8; 256];
    let registry = create_spine_binary_registry();
    let mut diagnostics = Vec::new();
    let mut context = SpineBinarySectionContext {
        animations: Vec::new(),
        attachment_names: Vec::new(),
        bones: Vec::new(),
        diagnostics: Some(&mut diagnostics),
        nonessential: false,
        reader: create_spine_binary_reader(&bytes),
        registry: &registry,
        skins: Vec::new(),
        slots: Vec::new(),
        strings: Vec::new(),
    };
    action(&mut context);
}

pub fn with_empty_spine_binary_timeline(
    action: impl for<'a, 'b> FnOnce(&mut SpineBinaryTimelineContext<'a, 'b>),
) {
    with_empty_spine_binary_section(|section| {
        let mut timeline = SpineBinaryTimelineContext {
            channels: Vec::new(),
            draw_order: None,
            section,
            unmodeled_timeline_counts: HashMap::new(),
            unregistered_timeline_counts: HashMap::new(),
        };
        action(&mut timeline);
    });
}

pub fn with_empty_spine_json_section(
    action: impl for<'a> FnOnce(&mut SpineJsonSectionContext<'a>),
) {
    let doc = JsonRecord::new();
    let registry = create_spine_json_registry();
    let mut diagnostics = Vec::new();
    let mut context = SpineJsonSectionContext {
        animations: Vec::new(),
        attachment_names: Vec::new(),
        bones: Vec::new(),
        diagnostics: Some(&mut diagnostics),
        doc: &doc,
        registry: &registry,
        skins: Vec::new(),
        slots: Vec::new(),
    };
    action(&mut context);
}

pub fn with_empty_spine_json_timeline(
    action: impl for<'a, 'b> FnOnce(&mut SpineJsonTimelineContext<'a, 'b>, &JsonRecord),
) {
    let animation = JsonRecord::new();
    with_empty_spine_json_section(|section| {
        let mut timeline = SpineJsonTimelineContext {
            channels: Vec::new(),
            draw_order: None,
            section,
            unmodeled_timeline_counts: HashMap::new(),
            unregistered_timeline_counts: HashMap::new(),
        };
        action(&mut timeline, &animation);
    });
}
