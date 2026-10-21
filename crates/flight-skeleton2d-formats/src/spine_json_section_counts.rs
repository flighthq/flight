use std::collections::HashMap;

use serde_json::Value;

use crate::types::*;

pub fn collect_spine_json_section_counts(json: &str) -> Option<HashMap<String, usize>> {
    let doc: Value = serde_json::from_str(json).ok()?;
    let record = JsonRecord::from(doc.as_object()?.clone());
    if !is_spine_json(&record) {
        return None;
    }
    let mut counts = HashMap::new();
    count_section(&mut counts, &record, "bones", SPINE_SECTION_KIND_BONES);
    count_section(&mut counts, &record, "slots", SPINE_SECTION_KIND_SLOTS);
    count_section(&mut counts, &record, "skins", SPINE_SECTION_KIND_SKINS);
    count_section(&mut counts, &record, "events", SPINE_SECTION_KIND_EVENTS);
    count_section(
        &mut counts,
        &record,
        "ik",
        SPINE_SECTION_KIND_IK_CONSTRAINTS,
    );
    count_section(
        &mut counts,
        &record,
        "path",
        SPINE_SECTION_KIND_PATH_CONSTRAINTS,
    );
    count_section(
        &mut counts,
        &record,
        "transform",
        SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS,
    );
    count_animation_timelines(&mut counts, record.get("animations"));
    return Some(counts);
}

fn count_animation_timelines(counts: &mut HashMap<String, usize>, raw: Option<&Value>) {
    let Some(animations) = raw.and_then(Value::as_object) else {
        return;
    };
    if animations.is_empty() {
        return;
    }
    counts.insert(SPINE_SECTION_KIND_ANIMATIONS.to_string(), animations.len());
    for animation in animations.values().filter_map(Value::as_object) {
        tally_timeline(counts, animation.get("bones"), SPINE_TIMELINE_KIND_BONE);
        tally_timeline(counts, animation.get("slots"), SPINE_TIMELINE_KIND_SLOT);
        tally_timeline(counts, animation.get("deform"), SPINE_TIMELINE_KIND_DEFORM);
        tally_timeline(
            counts,
            animation
                .get("drawOrder")
                .or_else(|| animation.get("draworder")),
            SPINE_TIMELINE_KIND_DRAW_ORDER,
        );
        tally_timeline(counts, animation.get("events"), SPINE_TIMELINE_KIND_EVENT);
        tally_timeline(counts, animation.get("ik"), SPINE_TIMELINE_KIND_IK);
        tally_timeline(counts, animation.get("path"), SPINE_TIMELINE_KIND_PATH);
        tally_timeline(
            counts,
            animation.get("transform"),
            SPINE_TIMELINE_KIND_TRANSFORM,
        );
    }
}

fn count_section(
    counts: &mut HashMap<String, usize>,
    record: &JsonRecord,
    json_key: &str,
    kind: &str,
) {
    let Some(value) = record.get(json_key) else {
        return;
    };
    let count = value
        .as_array()
        .map(Vec::len)
        .or_else(|| value.as_object().map(|record| record.len()))
        .unwrap_or(0);
    if count > 0 {
        counts.insert(kind.to_string(), count);
    }
}

fn is_spine_json(record: &JsonRecord) -> bool {
    return (record.get("bones").is_some_and(Value::is_array)
        || record.get("skeleton").is_some_and(Value::is_object))
        && !record.get("armature").is_some_and(Value::is_array);
}

fn tally_timeline(counts: &mut HashMap<String, usize>, raw: Option<&Value>, kind: &str) {
    let count = raw
        .and_then(|value| {
            value
                .as_array()
                .map(Vec::len)
                .or_else(|| value.as_object().map(|record| record.len()))
        })
        .unwrap_or(0);
    if count > 0 {
        *counts.entry(kind.to_string()).or_default() += count;
    }
}
