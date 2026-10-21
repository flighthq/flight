use std::collections::HashMap;

use serde_json::Value;

use crate::types::*;

pub fn collect_dragon_bones_section_counts(json: &str) -> Option<HashMap<String, usize>> {
    let doc: Value = serde_json::from_str(json).ok()?;
    let record = JsonRecord::from(doc.as_object()?.clone());
    let armatures = record.get("armature")?.as_array()?;
    let Some(armature) = armatures
        .first()
        .and_then(Value::as_object)
        .cloned()
        .map(JsonRecord::from)
    else {
        return Some(HashMap::new());
    };
    let mut counts = HashMap::new();
    count_section(
        &mut counts,
        &armature,
        "bone",
        DRAGON_BONES_SECTION_KIND_BONES,
    );
    count_section(
        &mut counts,
        &armature,
        "slot",
        DRAGON_BONES_SECTION_KIND_SLOTS,
    );
    count_section(
        &mut counts,
        &armature,
        "skin",
        DRAGON_BONES_SECTION_KIND_SKINS,
    );
    count_section(
        &mut counts,
        &armature,
        "ik",
        DRAGON_BONES_SECTION_KIND_IK_CONSTRAINTS,
    );
    count_animation_timelines(&mut counts, armature.get("animation"));
    return Some(counts);
}

fn count_animation_timelines(counts: &mut HashMap<String, usize>, raw: Option<&Value>) {
    let Some(animations) = raw.and_then(Value::as_array) else {
        return;
    };
    if animations.is_empty() {
        return;
    }
    counts.insert(
        DRAGON_BONES_SECTION_KIND_ANIMATIONS.to_string(),
        animations.len(),
    );
    for animation in animations.iter().filter_map(Value::as_object) {
        tally_timeline(
            counts,
            animation.get("bone"),
            DRAGON_BONES_TIMELINE_KIND_BONE,
        );
        tally_timeline(
            counts,
            animation.get("slot"),
            DRAGON_BONES_TIMELINE_KIND_SLOT,
        );
        tally_timeline(
            counts,
            animation.get("ffd"),
            DRAGON_BONES_TIMELINE_KIND_DEFORM,
        );
        tally_timeline(counts, animation.get("ik"), DRAGON_BONES_TIMELINE_KIND_IK);
        tally_timeline(
            counts,
            animation.get("zOrder"),
            DRAGON_BONES_TIMELINE_KIND_Z_ORDER,
        );
    }
}

fn count_section(
    counts: &mut HashMap<String, usize>,
    record: &JsonRecord,
    json_key: &str,
    kind: &str,
) {
    let count = record
        .get(json_key)
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if count > 0 {
        counts.insert(kind.to_string(), count);
    }
}

fn tally_timeline(counts: &mut HashMap<String, usize>, raw: Option<&Value>, kind: &str) {
    let count = raw.and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    if count > 0 {
        *counts.entry(kind.to_string()).or_default() += count;
    }
}
