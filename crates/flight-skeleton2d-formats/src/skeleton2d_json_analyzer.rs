use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;

use crate::types::{JsonRecord, Skeleton2DJsonAnalysis};

type Detector = Arc<dyn Fn(&JsonRecord) -> bool + Send + Sync>;
type Census = Arc<dyn Fn(&JsonRecord) -> HashMap<String, usize> + Send + Sync>;

#[derive(Clone)]
struct Skeleton2DJsonAnalyzerEntry {
    census: Census,
    detect: Detector,
    format: String,
    order: usize,
}

#[derive(Default)]
struct AnalyzerRegistry {
    analyzers: Vec<Skeleton2DJsonAnalyzerEntry>,
    next_order: usize,
}

pub fn analyze_skeleton_2d_json(json: &str) -> Option<Skeleton2DJsonAnalysis> {
    let doc: Value = serde_json::from_str(json).ok()?;
    let record = JsonRecord::from(doc.as_object()?.clone());
    ensure_built_ins();
    let entries = registry()
        .lock()
        .expect("analyzer registry")
        .analyzers
        .clone();
    for entry in entries {
        if (entry.detect)(&record) {
            return Some(Skeleton2DJsonAnalysis {
                counts: (entry.census)(&record),
                format: entry.format,
            });
        }
    }
    return None;
}

fn census_dragon_bones(record: &JsonRecord) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    let Some(armature) = record
        .get("armature")
        .and_then(Value::as_array)
        .and_then(|values| values.first())
        .and_then(Value::as_object)
        .cloned()
        .map(JsonRecord::from)
    else {
        return counts;
    };
    count_array(&mut counts, &armature, "bone", "bones");
    count_array(&mut counts, &armature, "slot", "slots");
    count_array(&mut counts, &armature, "skin", "skins");
    count_array(&mut counts, &armature, "ik", "ikConstraints");
    count_array(&mut counts, &armature, "animation", "animations");
    return counts;
}

fn census_spine_json(record: &JsonRecord) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    count_array_or_object(&mut counts, record, "bones", "bones");
    count_array_or_object(&mut counts, record, "slots", "slots");
    count_array_or_object(&mut counts, record, "skins", "skins");
    count_array_or_object(&mut counts, record, "events", "events");
    count_array_or_object(&mut counts, record, "ik", "ikConstraints");
    count_array_or_object(&mut counts, record, "path", "pathConstraints");
    count_array_or_object(&mut counts, record, "transform", "transformConstraints");
    count_array_or_object(&mut counts, record, "animations", "animations");
    return counts;
}

fn count_array(
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

fn count_array_or_object(
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

fn ensure_built_ins() {
    if !registry()
        .lock()
        .expect("analyzer registry")
        .analyzers
        .is_empty()
    {
        return;
    }
    register_skeleton_2d_json_analyzer(
        "spine-json",
        Arc::new(is_spine_json),
        Arc::new(census_spine_json),
    );
    register_skeleton_2d_json_analyzer(
        "dragonbones",
        Arc::new(is_dragon_bones),
        Arc::new(census_dragon_bones),
    );
}

fn is_dragon_bones(record: &JsonRecord) -> bool {
    return record.get("armature").is_some_and(Value::is_array);
}

fn is_spine_json(record: &JsonRecord) -> bool {
    let spine_shape = record.get("bones").is_some_and(Value::is_array)
        || record.get("skeleton").is_some_and(Value::is_object);
    return spine_shape && !record.get("armature").is_some_and(Value::is_array);
}

pub fn register_skeleton_2d_json_analyzer(format: &str, detect: Detector, census: Census) {
    let mut state = registry().lock().expect("analyzer registry");
    if let Some(index) = state
        .analyzers
        .iter()
        .position(|entry| entry.format == format)
    {
        let order = state.analyzers[index].order;
        state.analyzers[index] = Skeleton2DJsonAnalyzerEntry {
            census,
            detect,
            format: format.to_string(),
            order,
        };
        return;
    }
    let order = state.next_order;
    state.next_order += 1;
    state.analyzers.push(Skeleton2DJsonAnalyzerEntry {
        census,
        detect,
        format: format.to_string(),
        order,
    });
}

fn registry() -> &'static Mutex<AnalyzerRegistry> {
    static REGISTRY: OnceLock<Mutex<AnalyzerRegistry>> = OnceLock::new();
    return REGISTRY.get_or_init(|| Mutex::new(AnalyzerRegistry::default()));
}

pub fn unregister_skeleton_2d_json_analyzer(format: &str) -> bool {
    let mut state = registry().lock().expect("analyzer registry");
    let Some(index) = state
        .analyzers
        .iter()
        .position(|entry| entry.format == format)
    else {
        return false;
    };
    state.analyzers.remove(index);
    return true;
}
