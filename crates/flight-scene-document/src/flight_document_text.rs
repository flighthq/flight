//! The Flight document text codec (TS `flightDocumentText.ts`): formats a logical document into the
//! accepted YAML subset and reads subset text back into the logical model, explaining the first
//! refusal.

// flight-lint: allow-file(contract-vocabulary) i64 refusal counters project JS safe integers (|n| <= 2^53)

// flight-lint: allow-file(f64) D1: document numbers are JS Numbers; exact formatting and the safe-integer checks need double precision

use std::collections::HashSet;
use std::sync::{Arc, RwLock};

use flight_camera::{
    OrthographicProjectionOptions, PerspectiveProjectionOptions, Projection,
    create_orthographic_projection, create_perspective_projection,
};
use flight_entity::{
    Record, allocate_entity, entries, get_record_keys, get_record_value, set_record_value,
    throw_range_error, throw_type_error, unknown_to_js_string,
};
use flight_geometry::{Transform3D, Vector3, create_transform3d};
use flight_scene3d::{Scene3DDocumentCamera, Scene3DDocumentLight};

use crate::flight_document_light::{canonical_number, get_flight_document_light_fields};
use crate::scene_document_refusal::{
    create_document_refusal, get_interactive_state_entries, get_interactive_state_phases,
};
use crate::scene_document_yaml_subset::{
    SceneDocumentYamlSubsetMapping, SceneDocumentYamlSubsetResult, SceneDocumentYamlSubsetValue,
    parse_scene_document_yaml_subset,
};
use crate::types::*;

struct ReadContext {
    refusal: Option<FlightDocumentRefusalExplanation>,
}

struct ReadResult {
    document: Option<FlightDocument>,
    refusal: Option<FlightDocumentRefusalExplanation>,
}

/// Allocates a refusal explanation with every field (D23 create of
/// `initialize_flight_document_refusal_explanation`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the create of the source's initializer-only Entity
// flight-lint: allow(conform-params) refusal positions are UTF-16 code units and counters are i64 projections of JS safe integers
pub fn create_flight_document_refusal_explanation(
    actual: Option<i64>,
    column: Option<usize>,
    kind: Option<String>,
    limit: Option<i64>,
    line: Option<usize>,
    mode: Option<String>,
    offset: Option<usize>,
    path: &str,
    reason: FlightDocumentRefusalReason,
    resource_key: Option<String>,
    token_key: Option<String>,
    version: Option<f64>,
) -> FlightDocumentRefusalExplanation {
    let mut out: FlightDocumentRefusalExplanation = allocate_entity();
    initialize_flight_document_refusal_explanation(
        &mut out,
        actual,
        column,
        kind,
        limit,
        line,
        mode,
        offset,
        path,
        reason,
        resource_key,
        token_key,
        version,
    );
    return out;
}

/// Writes every refusal field into `out` (TS `initializeFlightDocumentRefusalExplanation`), the
/// construction initializer of a refusal explanation.
// flight-lint: allow(conform-params) D9b out-first; refusal positions are UTF-16 code units and counters are i64 projections of JS safe integers
pub fn initialize_flight_document_refusal_explanation(
    out: &mut FlightDocumentRefusalExplanation,
    actual: Option<i64>,
    column: Option<usize>,
    kind: Option<String>,
    limit: Option<i64>,
    line: Option<usize>,
    mode: Option<String>,
    offset: Option<usize>,
    path: &str,
    reason: FlightDocumentRefusalReason,
    resource_key: Option<String>,
    token_key: Option<String>,
    version: Option<f64>,
) {
    out.actual = actual;
    out.column = column;
    out.kind = kind;
    out.limit = limit;
    out.line = line;
    out.mode = mode;
    out.offset = offset;
    out.path = path.to_string();
    out.reason = reason;
    out.resource_key = resource_key;
    out.token_key = token_key;
    out.version = version;
}

fn append_camera(lines: &mut Vec<String>, camera: &Scene3DDocumentCamera) {
    lines.push(format!(
        "      - far: {}",
        format_canonical_number(camera.far)
    ));
    if let Some(name) = &camera.name {
        lines.push(format!("        name: {}", format_string(name)));
    }
    lines.push(format!(
        "        near: {}",
        format_canonical_number(camera.near)
    ));
    if let Some(node) = camera.node {
        lines.push(format!("        node: {}", format_number(f64::from(node))));
    }
    lines.push("        projection:".to_string());
    append_projection(lines, &camera.projection, 10);
    lines.push("        transform:".to_string());
    append_transform3d(lines, &camera.transform, 10);
}

fn append_fields(
    lines: &mut Vec<String>,
    fields: &FlightDocumentFields,
    indent: usize,
    reserved: &[&str],
) {
    let mut keys = Vec::new();
    get_record_keys(&mut keys, fields);
    keys.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    for key in keys {
        if reserved.contains(&key.as_str()) {
            throw_type_error(&format!(
                "FlightDocument field collides with structural key: {key}"
            ));
        }
        let value = get_record_value(fields, &key).expect("key enumerated from the record");
        append_mapping_entry(lines, &key, value, indent);
    }
}

fn append_interactive_state(
    lines: &mut Vec<String>,
    state: &FlightDocumentInteractiveState,
    indent: usize,
) {
    let state_entries = get_interactive_state_entries(state);
    if state_entries.is_empty() && state.extensions.is_empty() {
        throw_type_error("FlightDocument interactive state must not be empty");
    }
    for (property, value) in state_entries {
        let value = match value {
            FlightDocumentInteractiveStateValue::Boolean(value) => {
                FlightDocumentValue::Boolean(value)
            }
            FlightDocumentInteractiveStateValue::Number(value) => {
                FlightDocumentValue::Number(value)
            }
        };
        append_mapping_entry(lines, property, &value, indent);
    }
    if state.extensions.is_empty() {
        return;
    }
    lines.push(format!("{}extensions:", " ".repeat(indent)));
    for extension in &state.extensions {
        lines.push(format!(
            "{}- kind: {}",
            " ".repeat(indent + 2),
            format_string(&extension.kind)
        ));
        append_fields(
            lines,
            &extension.fields,
            indent + 4,
            &DESCRIPTOR_RESERVED_FIELDS,
        );
    }
}

fn append_layout_node(lines: &mut Vec<String>, node: &FlightDocumentLayoutNode, index: usize) {
    if node.kind.is_empty() {
        throw_range_error("FlightDocument layout node kinds must not be empty");
    }
    if node.parent_index < -1 || node.parent_index >= index as i64 {
        throw_range_error("FlightDocument layout parentIndex must be -1 or precede its node");
    }
    lines.push(format!("            - kind: {}", format_string(&node.kind)));
    lines.push(format!("              parentIndex: {}", node.parent_index));
    if let Some(style) = &node.container_style {
        append_mapping_entry(
            lines,
            "containerStyle",
            &FlightDocumentValue::Fields(style.clone()),
            14,
        );
    }
    if let Some(style) = &node.item_style {
        append_mapping_entry(
            lines,
            "itemStyle",
            &FlightDocumentValue::Fields(style.clone()),
            14,
        );
    }
}

fn append_layouts(lines: &mut Vec<String>, layouts: &[FlightDocumentLayoutDescriptor]) {
    if layouts.is_empty() {
        return;
    }
    let mut seen_targets: HashSet<&str> = HashSet::new();
    lines.push("    layouts:".to_string());
    for layout in layouts {
        let nodes = &layout.tree.nodes;
        if nodes.is_empty() {
            throw_range_error("FlightDocument layout tree must not be empty");
        }
        if layout.targets.len() != nodes.len() {
            throw_range_error(
                "FlightDocument layout targets must match its tree nodes index-for-index",
            );
        }
        lines.push("      - targets:".to_string());
        for target in &layout.targets {
            if target.is_empty() {
                throw_range_error("FlightDocument layout target names must not be empty");
            }
            if !seen_targets.insert(target.as_str()) {
                throw_range_error("FlightDocument layout targets must be unique per scene");
            }
            lines.push(format!("          - {}", format_string(target)));
        }
        lines.push("        tree:".to_string());
        lines.push("          nodes:".to_string());
        for (index, node) in nodes.iter().enumerate() {
            append_layout_node(lines, node, index);
        }
    }
}

fn append_light(lines: &mut Vec<String>, light: &Scene3DDocumentLight) {
    let descriptor = light.descriptor.read().unwrap();
    lines.push("      - descriptor:".to_string());
    lines.push(format!(
        "          kind: {}",
        format_string(descriptor.kind())
    ));
    let Some(fields) = get_flight_document_light_fields(&*descriptor) else {
        throw_type_error("FlightDocument contains a value outside its YAML subset");
    };
    append_object_entries(lines, &fields, 10);
    if let Some(name) = &light.name {
        lines.push(format!("        name: {}", format_string(name)));
    }
    if let Some(node) = light.node {
        lines.push(format!("        node: {}", format_number(f64::from(node))));
    }
    lines.push("        transform:".to_string());
    append_transform3d(lines, &light.transform, 10);
}

fn append_mapping_entry(
    lines: &mut Vec<String>,
    key: &str,
    value: &FlightDocumentValue,
    indent: usize,
) {
    let prefix = format!("{}{}:", " ".repeat(indent), format_key(key));
    match value {
        FlightDocumentValue::Array(values) => {
            if values.is_empty() {
                throw_type_error(
                    "The FlightDocument YAML subset cannot represent an empty sequence field",
                );
            }
            lines.push(prefix);
            append_sequence(lines, values, indent + 2);
        }
        FlightDocumentValue::Fields(fields) => {
            let mut keys = Vec::new();
            get_record_keys(&mut keys, fields);
            if keys.is_empty() {
                lines.push(format!("{prefix} {{}}"));
                return;
            }
            lines.push(prefix);
            append_object_entries(lines, fields, indent + 2);
        }
        scalar => lines.push(format!("{prefix} {}", format_scalar(scalar))),
    }
}

fn append_node(lines: &mut Vec<String>, node: &FlightDocumentNode, indent: usize) {
    let prefix = " ".repeat(indent);
    lines.push(format!("{prefix}kind: {}", format_string(&node.kind)));
    append_fields(lines, &node.fields, indent, &NODE_RESERVED_FIELDS);
    append_node_interactive_metadata(lines, node, indent);
    if !node.children.is_empty() {
        lines.push(format!("{prefix}children:"));
        for child in &node.children {
            append_node_sequence_item(lines, child, indent + 2);
        }
    }
}

fn append_node_interactive_metadata(
    lines: &mut Vec<String>,
    node: &FlightDocumentNode,
    indent: usize,
) {
    let prefix = " ".repeat(indent);
    let Some(states) = &node.interactive_states else {
        if node.transition.is_some() {
            throw_type_error("FlightDocument transition requires interactiveStates");
        }
        return;
    };
    let phases = get_interactive_state_phases(states);
    if phases.is_empty() {
        throw_type_error("FlightDocument interactiveStates must not be empty");
    }
    lines.push(format!("{prefix}interactiveStates:"));
    for (phase, state) in phases {
        lines.push(format!("{prefix}  {phase}:"));
        append_interactive_state(lines, state, indent + 4);
    }
    if let Some(transition) = &node.transition {
        lines.push(format!("{prefix}transition:"));
        lines.push(format!(
            "{prefix}  kind: {}",
            format_string(&transition.kind)
        ));
        append_fields(
            lines,
            &transition.fields,
            indent + 2,
            &DESCRIPTOR_RESERVED_FIELDS,
        );
    }
}

fn append_node_sequence_item(lines: &mut Vec<String>, node: &FlightDocumentNode, indent: usize) {
    let prefix = " ".repeat(indent);
    lines.push(format!("{prefix}- kind: {}", format_string(&node.kind)));
    append_fields(lines, &node.fields, indent + 2, &NODE_RESERVED_FIELDS);
    append_node_interactive_metadata(lines, node, indent + 2);
    if !node.children.is_empty() {
        lines.push(format!("{prefix}  children:"));
        for child in &node.children {
            append_node_sequence_item(lines, child, indent + 4);
        }
    }
}

// Nested mapping values (TS `appendObjectEntries`), ordered by `compare_mapping_keys`.
fn append_object_entries(lines: &mut Vec<String>, value: &FlightDocumentFields, indent: usize) {
    let mut ordered = Vec::new();
    entries(&mut ordered, value);
    ordered.sort_by(|(left, _), (right, _)| compare_mapping_keys(left, right));
    for (key, entry) in ordered {
        append_mapping_entry(lines, key, entry, indent);
    }
}

fn append_path(path: &str, key: &str) -> String {
    return if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    };
}

fn append_projection(lines: &mut Vec<String>, projection: &Projection, indent: usize) {
    let prefix = " ".repeat(indent);
    let kind = match projection {
        Projection::Orthographic(projection) => {
            let projection = projection.read().unwrap();
            lines.push(format!(
                "{prefix}halfHeight: {}",
                format_canonical_number(projection.half_height)
            ));
            lines.push(format!(
                "{prefix}halfWidth: {}",
                format_canonical_number(projection.half_width)
            ));
            "orthographic"
        }
        Projection::Perspective(projection) => {
            let projection = projection.read().unwrap();
            lines.push(format!(
                "{prefix}aspect: {}",
                format_canonical_number(projection.aspect)
            ));
            lines.push(format!(
                "{prefix}fovY: {}",
                format_canonical_number(projection.fov_y)
            ));
            "perspective"
        }
        Projection::Raw(_) => "raw",
    };
    lines.push(format!("{prefix}kind: {kind}"));
}

fn append_resources(lines: &mut Vec<String>, resources: &[FlightDocumentResourceDescriptor]) {
    lines.push("resources:".to_string());
    for resource in resources {
        lines.push(format!("  - kind: {}", format_string(&resource.kind)));
        lines.push(format!("    key: {}", format_string(&resource.key)));
        append_fields(lines, &resource.fields, 4, &RESOURCE_RESERVED_FIELDS);
    }
}

fn append_scene(lines: &mut Vec<String>, scene: &FlightDocumentScene) {
    let (node, layouts, tokens) = match scene {
        FlightDocumentScene::Scene2D(scene) => {
            lines.push("  - kind: Scene2D".to_string());
            if let Some(color) = scene.background_color {
                lines.push(format!("    backgroundColor: {}", format_number(color)));
            }
            (&scene.scene, &scene.layouts, &scene.tokens)
        }
        FlightDocumentScene::Scene3D(scene) => {
            lines.push("  - kind: Scene3D".to_string());
            if !scene.cameras.is_empty() {
                lines.push("    cameras:".to_string());
                for camera in &scene.cameras {
                    append_camera(lines, camera);
                }
            }
            if !scene.lights.is_empty() {
                lines.push("    lights:".to_string());
                for light in &scene.lights {
                    append_light(lines, light);
                }
            }
            (&scene.scene, &scene.layouts, &scene.tokens)
        }
    };
    lines.push("    scene:".to_string());
    append_node(lines, node, 6);
    append_layouts(lines, layouts);
    append_tokens(lines, tokens);
}

fn append_sequence(lines: &mut Vec<String>, values: &[FlightDocumentValue], indent: usize) {
    let prefix = " ".repeat(indent);
    for value in values {
        match value {
            FlightDocumentValue::Array(items) => {
                if items.is_empty() {
                    throw_type_error(
                        "The FlightDocument YAML subset cannot represent an empty sequence field",
                    );
                }
                lines.push(format!("{prefix}-"));
                append_sequence(lines, items, indent + 2);
            }
            FlightDocumentValue::Fields(fields) => {
                let mut keys = Vec::new();
                get_record_keys(&mut keys, fields);
                if keys.is_empty() {
                    lines.push(format!("{prefix}- {{}}"));
                    continue;
                }
                lines.push(format!("{prefix}-"));
                append_object_entries(lines, fields, indent + 2);
            }
            scalar => lines.push(format!("{prefix}- {}", format_scalar(scalar))),
        }
    }
}

fn append_tokens(lines: &mut Vec<String>, tokens: &[FlightDocumentToken]) {
    if tokens.is_empty() {
        return;
    }
    lines.push("    tokens:".to_string());
    for token in tokens {
        lines.push(format!("      - kind: {}", format_string(&token.kind)));
        lines.push(format!("        key: {}", format_string(&token.key)));
        // Mode names are sorted so a formatted document is stable, while the token ROWS keep the
        // order they were authored in: row order is the author's, mode order is not meaningful.
        append_fields(lines, &token.values, 8, &TOKEN_RESERVED_FIELDS);
    }
}

fn append_transform3d(lines: &mut Vec<String>, transform: &Transform3D, indent: usize) {
    let prefix = " ".repeat(indent);
    lines.push(format!("{prefix}position:"));
    append_vector3(lines, &transform.position, indent + 2);
    lines.push(format!("{prefix}rotation:"));
    lines.push(format!(
        "{}w: {}",
        " ".repeat(indent + 2),
        format_canonical_number(transform.rotation.w)
    ));
    let rotation = [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
    ];
    append_vector3_components(lines, rotation, indent + 2);
    lines.push(format!("{prefix}scale:"));
    append_vector3(lines, &transform.scale, indent + 2);
}

fn append_vector3(lines: &mut Vec<String>, value: &Vector3, indent: usize) {
    append_vector3_components(lines, [value.x, value.y, value.z], indent);
}

fn append_vector3_components(lines: &mut Vec<String>, value: [f32; 3], indent: usize) {
    let prefix = " ".repeat(indent);
    lines.push(format!("{prefix}x: {}", format_canonical_number(value[0])));
    lines.push(format!("{prefix}y: {}", format_canonical_number(value[1])));
    lines.push(format!("{prefix}z: {}", format_canonical_number(value[2])));
}

// The source orders nested mapping keys with `String.prototype.localeCompare` (host collation).
// There is no canonical collation in the portable core, so this compares UTF-16 code units; that
// agrees with localeCompare for same-case ASCII identifiers and is reported as drift otherwise.
fn compare_mapping_keys(left: &str, right: &str) -> std::cmp::Ordering {
    return left.encode_utf16().cmp(right.encode_utf16());
}

fn copy_flight_document_fields(
    mapping: &SceneDocumentYamlSubsetMapping,
    reserved: &[&str],
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentFields> {
    let mut fields = FlightDocumentFields::default();
    let mut pairs = Vec::new();
    entries(&mut pairs, mapping);
    for (key, value) in pairs {
        if reserved.contains(&key) {
            continue;
        }
        let value = copy_flight_document_value(value, &append_path(path, key), context)?;
        set_record_value(&mut fields, key.to_string(), value);
    }
    return Some(fields);
}

fn copy_flight_document_value(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentValue> {
    return match value {
        SceneDocumentYamlSubsetValue::Boolean(value) => Some(FlightDocumentValue::Boolean(*value)),
        SceneDocumentYamlSubsetValue::Null => Some(FlightDocumentValue::Null),
        SceneDocumentYamlSubsetValue::Number(value) => Some(FlightDocumentValue::Number(*value)),
        SceneDocumentYamlSubsetValue::String(value) => {
            Some(FlightDocumentValue::String(value.clone()))
        }
        SceneDocumentYamlSubsetValue::Sequence(items) => {
            let mut out = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                out.push(copy_flight_document_value(
                    item,
                    &format!("{path}[{index}]"),
                    context,
                )?);
            }
            Some(FlightDocumentValue::Array(out))
        }
        SceneDocumentYamlSubsetValue::Mapping(mapping) => {
            let mut out = FlightDocumentFields::default();
            let mut pairs = Vec::new();
            entries(&mut pairs, mapping);
            for (key, item) in pairs {
                let item = copy_flight_document_value(item, &append_path(path, key), context)?;
                set_record_value(&mut out, key.to_string(), item);
            }
            Some(FlightDocumentValue::Fields(out))
        }
    };
}

/// Explains why `text` does not read as a document, or `None` when it does (TS
/// `explainFlightDocumentText`).
pub fn explain_flight_document_text(text: &str) -> Option<FlightDocumentRefusalExplanation> {
    return read_flight_document_text(text).refusal;
}

// Formats a canonical f32 engine field (camera, projection, transform) from its shortest round-trip
// f32 decimal (Principal 68e645eb C3), laid out by the JavaScript Number formatter.
fn format_canonical_number(value: f32) -> String {
    return format_number(canonical_number(value));
}

/// Formats `document` as subset text (TS `formatFlightDocumentText`). Throws `RangeError` for an
/// invalid container and `TypeError` for a value outside the subset, and re-parses its own output
/// so it can never emit text the reader refuses.
pub fn format_flight_document_text(document: &FlightDocument) -> FlightDocumentText {
    if document.version != 1.0 {
        throw_range_error("FlightDocument.version must be 1");
    }
    if document.scenes.is_empty() {
        throw_range_error("FlightDocument.scenes must not be empty");
    }
    if document.default_scene < 0 || document.default_scene as u64 >= document.scenes.len() as u64 {
        throw_range_error("FlightDocument.defaultScene must index FlightDocument.scenes");
    }

    let mut lines = vec![
        "flight: 1".to_string(),
        format!("defaultScene: {}", document.default_scene),
    ];
    if !document.resources.is_empty() {
        append_resources(&mut lines, &document.resources);
    }
    lines.push("scenes:".to_string());
    for scene in &document.scenes {
        append_scene(&mut lines, scene);
    }

    let text = lines.join("\n") + "\n";
    if let SceneDocumentYamlSubsetResult::Refusal(refusal) = parse_scene_document_yaml_subset(&text)
    {
        throw_range_error(&format!(
            "FlightDocument cannot be represented by the YAML subset: {}",
            crate::scene_document_strings::get_flight_document_refusal_reason_string(refusal.kind)
        ));
    }
    return text;
}

fn format_key(value: &str) -> String {
    return if is_safe_plain_scalar(value) {
        value.to_string()
    } else {
        quote_json_string(value)
    };
}

fn format_number(value: f64) -> String {
    if !value.is_finite() {
        throw_range_error("FlightDocument numbers must be finite");
    }
    if value.fract() == 0.0 && value.abs() > MAX_SAFE_INTEGER {
        throw_range_error("FlightDocument integers must be safe integers");
    }
    return unknown_to_js_string(&Some(Arc::new(value)));
}

fn format_scalar(value: &FlightDocumentValue) -> String {
    return match value {
        FlightDocumentValue::Null => "null".to_string(),
        FlightDocumentValue::Boolean(value) => (if *value { "true" } else { "false" }).to_string(),
        FlightDocumentValue::Number(value) => format_number(*value),
        FlightDocumentValue::String(value) => format_string(value),
        FlightDocumentValue::Array(_) | FlightDocumentValue::Fields(_) => {
            throw_type_error("FlightDocument contains a value outside its YAML subset")
        }
    };
}

fn format_string(value: &str) -> String {
    if is_safe_plain_scalar(value) && value != "false" && value != "null" && value != "true" {
        return value.to_string();
    }
    return quote_json_string(value);
}

fn has_only_keys(mapping: &SceneDocumentYamlSubsetMapping, allowed: &[&str]) -> bool {
    let mut pairs = Vec::new();
    entries(&mut pairs, mapping);
    return pairs.iter().all(|(key, _)| allowed.contains(key));
}

fn is_integer(value: f64) -> bool {
    return value.is_finite() && value.fract() == 0.0;
}

// SAFE_PLAIN_SCALAR_PATTERN: /^[A-Za-z_][A-Za-z0-9_.-]*$/
fn is_safe_plain_scalar(value: &str) -> bool {
    let mut characters = value.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    return characters.all(|character| {
        return character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-');
    });
}

fn mapping_of(
    value: Option<&SceneDocumentYamlSubsetValue>,
) -> Option<&SceneDocumentYamlSubsetMapping> {
    return match value {
        Some(SceneDocumentYamlSubsetValue::Mapping(mapping)) => Some(mapping),
        _ => None,
    };
}

fn number_of(value: Option<&SceneDocumentYamlSubsetValue>) -> Option<f64> {
    return match value {
        Some(SceneDocumentYamlSubsetValue::Number(value)) => Some(*value),
        _ => None,
    };
}

/// Reads `text` into the logical model, or `None` on any refusal (TS `parseFlightDocumentText`);
/// `explain_flight_document_text` names it.
pub fn parse_flight_document_text(text: &str) -> Option<FlightDocument> {
    return read_flight_document_text(text).document;
}

// JSON.stringify of a string: the quote, backslash and C0 controls are escaped, with the short
// escapes \b \f \n \r \t; every other code point passes through.
fn quote_json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", control as u32));
            }
            other => out.push(other),
        }
    }
    out.push('"');
    return out;
}

fn read_camera(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    context: &mut ReadContext,
) -> Option<Scene3DDocumentCamera> {
    let Some(mapping) =
        mapping_of(Some(value)).filter(|mapping| has_only_keys(mapping, &CAMERA_KEYS))
    else {
        return refuse(context, path);
    };
    let Some(far) = number_of(get_record_value(mapping, "far")) else {
        return refuse(context, &append_path(path, "far"));
    };
    let Some(near) = number_of(get_record_value(mapping, "near")) else {
        return refuse(context, &append_path(path, "near"));
    };
    let projection = read_projection(
        get_record_value(mapping, "projection"),
        &append_path(path, "projection"),
        context,
    )?;
    let transform = read_transform3d(
        get_record_value(mapping, "transform"),
        &append_path(path, "transform"),
        context,
    )?;
    let name = match get_record_value(mapping, "name") {
        None => None,
        Some(SceneDocumentYamlSubsetValue::String(name)) => Some(name.clone()),
        Some(_) => return refuse(context, &append_path(path, "name")),
    };
    let node = read_optional_index(
        get_record_value(mapping, "node"),
        &append_path(path, "node"),
        context,
    )?;
    return Some(Scene3DDocumentCamera {
        far: far as f32,
        name,
        near: near as f32,
        node,
        projection,
        transform,
    });
}

fn read_flight_document_text(text: &str) -> ReadResult {
    let value = match parse_scene_document_yaml_subset(text) {
        SceneDocumentYamlSubsetResult::Ok(value) => value,
        SceneDocumentYamlSubsetResult::Refusal(parsed) => {
            let mut out: FlightDocumentRefusalExplanation = allocate_entity();
            initialize_flight_document_refusal_explanation(
                &mut out,
                parsed.actual,
                Some(parsed.column),
                None,
                parsed.limit,
                Some(parsed.line),
                None,
                Some(parsed.offset),
                "",
                parsed.kind,
                None,
                None,
                None,
            );
            return ReadResult {
                document: None,
                refusal: Some(out),
            };
        }
    };

    let refuse_document = |reason: FlightDocumentRefusalReason, path: &str| {
        return ReadResult {
            document: None,
            refusal: Some(create_document_refusal(reason, path)),
        };
    };
    let mut context = ReadContext { refusal: None };
    let Some(mapping) =
        mapping_of(Some(&value)).filter(|mapping| has_only_keys(mapping, &DOCUMENT_KEYS))
    else {
        return refuse_document(FlightDocumentRefusalReason::StructureInvalid, "");
    };
    let Some(version) = number_of(get_record_value(mapping, "flight")) else {
        return refuse_document(FlightDocumentRefusalReason::StructureInvalid, "flight");
    };
    if version != 1.0 {
        let mut refusal =
            create_document_refusal(FlightDocumentRefusalReason::VersionUnsupported, "version");
        refusal.version = Some(version);
        return ReadResult {
            document: None,
            refusal: Some(refusal),
        };
    }

    let scenes_raw = match get_record_value(mapping, "scenes") {
        Some(SceneDocumentYamlSubsetValue::Null) => {
            return refuse_document(FlightDocumentRefusalReason::ScenesEmpty, "scenes");
        }
        Some(SceneDocumentYamlSubsetValue::Sequence(scenes)) => scenes,
        _ => return refuse_document(FlightDocumentRefusalReason::StructureInvalid, "scenes"),
    };
    if scenes_raw.is_empty() {
        return refuse_document(FlightDocumentRefusalReason::ScenesEmpty, "scenes");
    }

    let Some(default_scene) =
        number_of(get_record_value(mapping, "defaultScene")).filter(|value| is_integer(*value))
    else {
        return refuse_document(
            FlightDocumentRefusalReason::StructureInvalid,
            "defaultScene",
        );
    };
    if default_scene < 0.0 || default_scene >= scenes_raw.len() as f64 {
        let mut refusal = create_document_refusal(
            FlightDocumentRefusalReason::DefaultSceneOutOfRange,
            "defaultScene",
        );
        refusal.actual = Some(default_scene as i64);
        refusal.limit = Some(scenes_raw.len() as i64 - 1);
        return ReadResult {
            document: None,
            refusal: Some(refusal),
        };
    }

    let Some(resources) = read_resources(get_record_value(mapping, "resources"), &mut context)
    else {
        return ReadResult {
            document: None,
            refusal: context.refusal,
        };
    };
    let mut scenes = Vec::with_capacity(scenes_raw.len());
    for (index, scene) in scenes_raw.iter().enumerate() {
        let Some(scene) = read_scene(scene, index, &mut context) else {
            return ReadResult {
                document: None,
                refusal: context.refusal,
            };
        };
        scenes.push(scene);
    }
    return ReadResult {
        document: Some(FlightDocument {
            default_scene: default_scene as i64,
            resources,
            scenes,
            version: 1.0,
        }),
        refusal: None,
    };
}

fn read_interactive_state(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    dimension: FlightDocumentSceneDimension,
    context: &mut ReadContext,
) -> Option<FlightDocumentInteractiveState> {
    let Some(mapping) =
        mapping_of(Some(value)).filter(|mapping| has_only_keys(mapping, &INTERACTIVE_STATE_KEYS))
    else {
        return refuse(context, path);
    };
    let mut state = FlightDocumentInteractiveState::default();
    for property in INTERACTIVE_STATE_PROPERTIES {
        let Some(property_value) = get_record_value(mapping, property) else {
            continue;
        };
        let is_2d_property = INTERACTIVE_STATE_2D_PROPERTIES.contains(&property);
        if property == "visible" {
            let SceneDocumentYamlSubsetValue::Boolean(visible) = property_value else {
                return refuse(context, &append_path(path, property));
            };
            state.visible = Some(*visible);
            continue;
        }
        let Some(number) = number_of(Some(property_value)).filter(|number| number.is_finite())
        else {
            return refuse(context, &append_path(path, property));
        };
        if dimension == FlightDocumentSceneDimension::Scene3D && is_2d_property {
            return refuse(context, &append_path(path, property));
        }
        match property {
            "alpha" => state.alpha = Some(number),
            "scaleX" => state.scale_x = Some(number),
            "scaleY" => state.scale_y = Some(number),
            "x" => state.x = Some(number),
            _ => state.y = Some(number),
        }
    }

    if let Some(extensions_raw) = get_record_value(mapping, "extensions") {
        let SceneDocumentYamlSubsetValue::Sequence(extensions_raw) = extensions_raw else {
            return refuse(context, &append_path(path, "extensions"));
        };
        let mut kinds: HashSet<String> = HashSet::new();
        for (index, extension) in extensions_raw.iter().enumerate() {
            let extension_path = format!("{path}.extensions[{index}]");
            let extension = read_interactive_state_descriptor(extension, &extension_path, context)?;
            if !kinds.insert(extension.kind.clone()) {
                if context.refusal.is_none() {
                    let mut refusal = create_document_refusal(
                        FlightDocumentRefusalReason::InteractiveStateExtensionKindDuplicate,
                        &extension_path,
                    );
                    refusal.kind = Some(extension.kind.clone());
                    context.refusal = Some(refusal);
                }
                return None;
            }
            state
                .extensions
                .push(FlightDocumentInteractiveStateExtensionDescriptor {
                    fields: extension.fields,
                    kind: extension.kind,
                });
        }
    }
    if get_interactive_state_entries(&state).is_empty() && state.extensions.is_empty() {
        return refuse(context, path);
    }
    return Some(state);
}

// Reads a kind-tagged descriptor (an extension or a transition): a mapping with a string `kind`.
fn read_interactive_state_descriptor(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentInteractiveStateTransitionDescriptor> {
    let Some(mapping) = mapping_of(Some(value)) else {
        return refuse(context, path);
    };
    let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(mapping, "kind") else {
        return refuse(context, &append_path(path, "kind"));
    };
    let fields = copy_flight_document_fields(mapping, &DESCRIPTOR_RESERVED_FIELDS, path, context)?;
    return Some(FlightDocumentInteractiveStateTransitionDescriptor {
        fields,
        kind: kind.clone(),
    });
}

fn read_interactive_states(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    dimension: FlightDocumentSceneDimension,
    context: &mut ReadContext,
) -> Option<FlightDocumentInteractiveStates> {
    let Some(mapping) =
        mapping_of(Some(value)).filter(|mapping| has_only_keys(mapping, &INTERACTIVE_STATE_PHASES))
    else {
        return refuse(context, path);
    };
    let mut states = FlightDocumentInteractiveStates::default();
    let mut count = 0;
    for phase in INTERACTIVE_STATE_PHASES {
        let Some(state_raw) = get_record_value(mapping, phase) else {
            continue;
        };
        let state =
            read_interactive_state(state_raw, &append_path(path, phase), dimension, context)?;
        match phase {
            "disabled" => states.disabled = Some(state),
            "hover" => states.hover = Some(state),
            _ => states.pressed = Some(state),
        }
        count += 1;
    }
    if count == 0 {
        return refuse(context, path);
    }
    return Some(states);
}

fn read_layout_node(
    value: &SceneDocumentYamlSubsetValue,
    index: usize,
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentLayoutNode> {
    let Some(mapping) =
        mapping_of(Some(value)).filter(|mapping| has_only_keys(mapping, &LAYOUT_NODE_KEYS))
    else {
        return refuse(context, path);
    };
    let kind = match get_record_value(mapping, "kind") {
        Some(SceneDocumentYamlSubsetValue::String(kind)) if !kind.is_empty() => kind.clone(),
        _ => return refuse(context, &append_path(path, "kind")),
    };
    let Some(parent_index) =
        number_of(get_record_value(mapping, "parentIndex")).filter(|parent_index| {
            is_integer(*parent_index) && *parent_index >= -1.0 && *parent_index < index as f64
        })
    else {
        return refuse(context, &append_path(path, "parentIndex"));
    };
    let container_style = read_layout_style(
        get_record_value(mapping, "containerStyle"),
        &append_path(path, "containerStyle"),
        context,
    )?;
    let item_style = read_layout_style(
        get_record_value(mapping, "itemStyle"),
        &append_path(path, "itemStyle"),
        context,
    )?;
    return Some(FlightDocumentLayoutNode {
        container_style,
        item_style,
        kind,
        parent_index: parent_index as i64,
    });
}

// An absent or null style is `Some(None)`; a refused style is `None`.
fn read_layout_style(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
) -> Option<Option<FlightDocumentFields>> {
    return match value {
        None | Some(SceneDocumentYamlSubsetValue::Null) => Some(None),
        Some(SceneDocumentYamlSubsetValue::Mapping(mapping)) => {
            copy_flight_document_fields(mapping, &[], path, context).map(Some)
        }
        Some(_) => refuse(context, path),
    };
}

fn read_layouts(
    value: Option<&SceneDocumentYamlSubsetValue>,
    scene_path: &str,
    context: &mut ReadContext,
) -> Option<Vec<FlightDocumentLayoutDescriptor>> {
    let Some(value) = value else {
        return Some(Vec::new());
    };
    let layouts_path = append_path(scene_path, "layouts");
    let SceneDocumentYamlSubsetValue::Sequence(value) = value else {
        return refuse(context, &layouts_path);
    };
    let mut layouts = Vec::with_capacity(value.len());
    let mut seen_targets: HashSet<String> = HashSet::new();
    for (layout_index, raw) in value.iter().enumerate() {
        let layout_path = format!("{layouts_path}[{layout_index}]");
        let Some(raw) = mapping_of(Some(raw)).filter(|raw| has_only_keys(raw, &LAYOUT_KEYS)) else {
            return refuse(context, &layout_path);
        };

        let targets_path = append_path(&layout_path, "targets");
        let targets_raw = match get_record_value(raw, "targets") {
            Some(SceneDocumentYamlSubsetValue::Sequence(targets)) if !targets.is_empty() => targets,
            _ => return refuse(context, &targets_path),
        };
        let mut targets = Vec::with_capacity(targets_raw.len());
        for (target_index, target) in targets_raw.iter().enumerate() {
            let target_path = format!("{targets_path}[{target_index}]");
            match target {
                SceneDocumentYamlSubsetValue::String(target)
                    if !target.is_empty() && !seen_targets.contains(target) =>
                {
                    seen_targets.insert(target.clone());
                    targets.push(target.clone());
                }
                _ => return refuse(context, &target_path),
            }
        }

        let tree_path = append_path(&layout_path, "tree");
        let Some(tree_raw) = mapping_of(get_record_value(raw, "tree"))
            .filter(|tree| has_only_keys(tree, &LAYOUT_TREE_KEYS))
        else {
            return refuse(context, &tree_path);
        };
        let nodes_path = append_path(&tree_path, "nodes");
        let nodes_raw = match get_record_value(tree_raw, "nodes") {
            Some(SceneDocumentYamlSubsetValue::Sequence(nodes)) if !nodes.is_empty() => nodes,
            _ => return refuse(context, &nodes_path),
        };
        let mut nodes = Vec::with_capacity(nodes_raw.len());
        for (node_index, node) in nodes_raw.iter().enumerate() {
            nodes.push(read_layout_node(
                node,
                node_index,
                &format!("{nodes_path}[{node_index}]"),
                context,
            )?);
        }
        if targets.len() != nodes.len() {
            return refuse(context, &targets_path);
        }
        layouts.push(FlightDocumentLayoutDescriptor {
            targets,
            tree: Arc::new(FlightDocumentLayoutTree { nodes }),
        });
    }
    return Some(layouts);
}

fn read_light(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    context: &mut ReadContext,
) -> Option<Scene3DDocumentLight> {
    let Some(mapping) =
        mapping_of(Some(value)).filter(|mapping| has_only_keys(mapping, &LIGHT_KEYS))
    else {
        return refuse(context, path);
    };
    let descriptor_path = append_path(path, "descriptor");
    let Some(descriptor_raw) = mapping_of(get_record_value(mapping, "descriptor")) else {
        return refuse(context, &descriptor_path);
    };
    let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(descriptor_raw, "kind")
    else {
        return refuse(context, &append_path(&descriptor_path, "kind"));
    };
    let fields = copy_flight_document_fields(
        descriptor_raw,
        &DESCRIPTOR_RESERVED_FIELDS,
        &descriptor_path,
        context,
    )?;
    // Light is an open kind family, so the codec cannot select a closed concrete constructor: the
    // descriptor keeps its kind and every authored field, and materialization owns any kind-specific
    // interpretation (Principal 68e645eb C2).
    let mut descriptor: FlightDocumentLightDescriptor = allocate_entity();
    descriptor.fields = fields;
    descriptor.kind = kind.clone();
    let transform = read_transform3d(
        get_record_value(mapping, "transform"),
        &append_path(path, "transform"),
        context,
    )?;
    let name = match get_record_value(mapping, "name") {
        None => None,
        Some(SceneDocumentYamlSubsetValue::String(name)) => Some(name.clone()),
        Some(_) => return refuse(context, &append_path(path, "name")),
    };
    let node = read_optional_index(
        get_record_value(mapping, "node"),
        &append_path(path, "node"),
        context,
    )?;
    return Some(Scene3DDocumentLight {
        descriptor: Arc::new(RwLock::new(descriptor)),
        name,
        node,
        transform,
    });
}

fn read_node(
    value: &SceneDocumentYamlSubsetValue,
    path: &str,
    dimension: FlightDocumentSceneDimension,
    context: &mut ReadContext,
) -> Option<FlightDocumentNode> {
    let Some(mapping) = mapping_of(Some(value)) else {
        return refuse(context, path);
    };
    let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(mapping, "kind") else {
        return refuse(context, &append_path(path, "kind"));
    };
    let mut children = Vec::new();
    if let Some(children_raw) = get_record_value(mapping, "children") {
        let SceneDocumentYamlSubsetValue::Sequence(children_raw) = children_raw else {
            return refuse(context, &append_path(path, "children"));
        };
        for (index, child) in children_raw.iter().enumerate() {
            children.push(read_node(
                child,
                &format!("{path}.children[{index}]"),
                dimension,
                context,
            )?);
        }
    }
    let mut interactive_states = None;
    if let Some(states_raw) = get_record_value(mapping, "interactiveStates") {
        interactive_states = Some(read_interactive_states(
            states_raw,
            &append_path(path, "interactiveStates"),
            dimension,
            context,
        )?);
    }
    let transition_raw = get_record_value(mapping, "transition");
    if transition_raw.is_some() && interactive_states.is_none() {
        return refuse(context, &append_path(path, "transition"));
    }
    let mut transition = None;
    if let Some(transition_raw) = transition_raw {
        transition = Some(read_interactive_state_descriptor(
            transition_raw,
            &append_path(path, "transition"),
            context,
        )?);
    }
    let fields = copy_flight_document_fields(mapping, &NODE_RESERVED_FIELDS, path, context)?;
    return Some(FlightDocumentNode {
        children,
        fields,
        interactive_states,
        kind: kind.clone(),
        transition,
    });
}

// An absent index is `Some(None)`; a refused index is `None`. The canonical camera/light binding
// carrier is i32, so an index past its range refuses rather than truncating.
fn read_optional_index(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
) -> Option<Option<i32>> {
    let Some(value) = value else {
        return Some(None);
    };
    return match number_of(Some(value)) {
        Some(index) if is_integer(index) && index >= 0.0 && index <= f64::from(i32::MAX) => {
            Some(Some(index as i32))
        }
        _ => refuse(context, path),
    };
}

fn read_projection(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
) -> Option<Projection> {
    let Some(mapping) = mapping_of(value) else {
        return refuse(context, path);
    };
    return match get_record_value(mapping, "kind") {
        Some(SceneDocumentYamlSubsetValue::String(kind)) if kind == "orthographic" => {
            if !has_only_keys(mapping, &ORTHOGRAPHIC_PROJECTION_KEYS) {
                return refuse(context, path);
            }
            let Some(half_height) = number_of(get_record_value(mapping, "halfHeight")) else {
                return refuse(context, &append_path(path, "halfHeight"));
            };
            let Some(half_width) = number_of(get_record_value(mapping, "halfWidth")) else {
                return refuse(context, &append_path(path, "halfWidth"));
            };
            Some(Projection::Orthographic(create_orthographic_projection(
                &OrthographicProjectionOptions {
                    half_height: half_height as f32,
                    half_width: half_width as f32,
                },
            )))
        }
        Some(SceneDocumentYamlSubsetValue::String(kind)) if kind == "perspective" => {
            if !has_only_keys(mapping, &PERSPECTIVE_PROJECTION_KEYS) {
                return refuse(context, path);
            }
            let Some(aspect) = number_of(get_record_value(mapping, "aspect")) else {
                return refuse(context, &append_path(path, "aspect"));
            };
            let Some(fov_y) = number_of(get_record_value(mapping, "fovY")) else {
                return refuse(context, &append_path(path, "fovY"));
            };
            Some(Projection::Perspective(create_perspective_projection(
                &PerspectiveProjectionOptions {
                    aspect: Some(aspect as f32),
                    fov_y: fov_y as f32,
                },
            )))
        }
        _ => refuse(context, &append_path(path, "kind")),
    };
}

fn read_resources(
    value: Option<&SceneDocumentYamlSubsetValue>,
    context: &mut ReadContext,
) -> Option<Vec<FlightDocumentResourceDescriptor>> {
    let Some(value) = value else {
        return Some(Vec::new());
    };
    let SceneDocumentYamlSubsetValue::Sequence(value) = value else {
        return refuse(context, "resources");
    };
    let mut resources = Vec::with_capacity(value.len());
    for (index, raw) in value.iter().enumerate() {
        let path = format!("resources[{index}]");
        let Some(raw) = mapping_of(Some(raw)) else {
            return refuse(context, &path);
        };
        let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(raw, "kind") else {
            return refuse(context, &append_path(&path, "kind"));
        };
        let Some(SceneDocumentYamlSubsetValue::String(key)) = get_record_value(raw, "key") else {
            return refuse(context, &append_path(&path, "key"));
        };
        let fields = copy_flight_document_fields(raw, &RESOURCE_RESERVED_FIELDS, &path, context)?;
        resources.push(FlightDocumentResourceDescriptor {
            fields,
            key: key.clone(),
            kind: kind.clone(),
        });
    }
    return Some(resources);
}

fn read_scene(
    value: &SceneDocumentYamlSubsetValue,
    index: usize,
    context: &mut ReadContext,
) -> Option<FlightDocumentScene> {
    let path = format!("scenes[{index}]");
    let Some(mapping) = mapping_of(Some(value)) else {
        return refuse(context, &path);
    };
    return match get_record_value(mapping, "kind") {
        Some(SceneDocumentYamlSubsetValue::String(kind)) if kind == "Scene2D" => {
            read_scene2d(mapping, &path, context).map(FlightDocumentScene::Scene2D)
        }
        Some(SceneDocumentYamlSubsetValue::String(kind)) if kind == "Scene3D" => {
            read_scene3d(mapping, &path, context).map(FlightDocumentScene::Scene3D)
        }
        _ => refuse(context, &append_path(&path, "kind")),
    };
}

fn read_scene2d(
    mapping: &SceneDocumentYamlSubsetMapping,
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentScene2D> {
    if !has_only_keys(mapping, &SCENE_2D_KEYS) {
        return refuse(context, path);
    }
    let background_color = match get_record_value(mapping, "backgroundColor") {
        None | Some(SceneDocumentYamlSubsetValue::Null) => None,
        Some(SceneDocumentYamlSubsetValue::Number(color)) => Some(*color),
        Some(_) => return refuse(context, &append_path(path, "backgroundColor")),
    };
    let scene_raw =
        get_record_value(mapping, "scene").unwrap_or(&SceneDocumentYamlSubsetValue::Null);
    let scene = read_node(
        scene_raw,
        &append_path(path, "scene"),
        FlightDocumentSceneDimension::Scene2D,
        context,
    )?;
    let layouts = read_layouts(get_record_value(mapping, "layouts"), path, context)?;
    let tokens = read_tokens(get_record_value(mapping, "tokens"), path, context)?;
    let mut out: FlightDocumentScene2D = allocate_entity();
    out.background_color = background_color;
    out.layouts = layouts;
    out.scene = scene;
    out.tokens = tokens;
    return Some(out);
}

fn read_scene3d(
    mapping: &SceneDocumentYamlSubsetMapping,
    path: &str,
    context: &mut ReadContext,
) -> Option<FlightDocumentScene3D> {
    if !has_only_keys(mapping, &SCENE_3D_KEYS) {
        return refuse(context, path);
    }
    let mut cameras = Vec::new();
    if let Some(cameras_raw) = get_record_value(mapping, "cameras") {
        let SceneDocumentYamlSubsetValue::Sequence(cameras_raw) = cameras_raw else {
            return refuse(context, &append_path(path, "cameras"));
        };
        for (index, camera) in cameras_raw.iter().enumerate() {
            cameras.push(read_camera(
                camera,
                &format!("{path}.cameras[{index}]"),
                context,
            )?);
        }
    }
    let mut lights = Vec::new();
    if let Some(lights_raw) = get_record_value(mapping, "lights") {
        let SceneDocumentYamlSubsetValue::Sequence(lights_raw) = lights_raw else {
            return refuse(context, &append_path(path, "lights"));
        };
        for (index, light) in lights_raw.iter().enumerate() {
            lights.push(read_light(
                light,
                &format!("{path}.lights[{index}]"),
                context,
            )?);
        }
    }
    let scene_raw =
        get_record_value(mapping, "scene").unwrap_or(&SceneDocumentYamlSubsetValue::Null);
    let scene = read_node(
        scene_raw,
        &append_path(path, "scene"),
        FlightDocumentSceneDimension::Scene3D,
        context,
    )?;
    let layouts = read_layouts(get_record_value(mapping, "layouts"), path, context)?;
    let tokens = read_tokens(get_record_value(mapping, "tokens"), path, context)?;
    let mut out: FlightDocumentScene3D = allocate_entity();
    out.cameras = cameras;
    out.layouts = layouts;
    out.lights = lights;
    out.scene = scene;
    out.tokens = tokens;
    return Some(out);
}

fn read_tokens(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
) -> Option<Vec<FlightDocumentToken>> {
    let Some(value) = value else {
        return Some(Vec::new());
    };
    let SceneDocumentYamlSubsetValue::Sequence(value) = value else {
        return refuse(context, &append_path(path, "tokens"));
    };
    let mut tokens = Vec::with_capacity(value.len());
    let mut seen: HashSet<String> = HashSet::new();
    for (index, raw) in value.iter().enumerate() {
        let row_path = format!("{path}.tokens[{index}]");
        let Some(raw) = mapping_of(Some(raw)) else {
            return refuse(context, &row_path);
        };
        let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(raw, "kind") else {
            return refuse(context, &append_path(&row_path, "kind"));
        };
        let Some(SceneDocumentYamlSubsetValue::String(key)) = get_record_value(raw, "key") else {
            return refuse(context, &append_path(&row_path, "key"));
        };
        if !is_safe_plain_scalar(key) {
            return refuse_token(
                context,
                FlightDocumentRefusalReason::TokenKeyInvalid,
                &append_path(&row_path, "key"),
                key,
                None,
            );
        }
        if !seen.insert(key.clone()) {
            return refuse_token(
                context,
                FlightDocumentRefusalReason::TokenKeyDuplicate,
                &append_path(&row_path, "key"),
                key,
                None,
            );
        }
        let mut values: FlightDocumentTokenValues = Record::default();
        let mut pairs = Vec::new();
        entries(&mut pairs, raw);
        for (mode, mode_value) in pairs {
            if TOKEN_RESERVED_FIELDS.contains(&mode) {
                continue;
            }
            let mode_path = append_path(&row_path, mode);
            if !is_safe_plain_scalar(mode) {
                return refuse_token(
                    context,
                    FlightDocumentRefusalReason::TokenModeInvalid,
                    &mode_path,
                    key,
                    Some(mode),
                );
            }
            let mode_value = copy_flight_document_value(mode_value, &mode_path, context)?;
            set_record_value(&mut values, mode.to_string(), mode_value);
        }
        tokens.push(FlightDocumentToken {
            key: key.clone(),
            kind: kind.clone(),
            values,
        });
    }
    return Some(tokens);
}

fn read_transform3d(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
) -> Option<Transform3D> {
    let Some(mapping) =
        mapping_of(value).filter(|mapping| has_only_keys(mapping, &TRANSFORM_3D_KEYS))
    else {
        return refuse(context, path);
    };
    let position = read_vector3(
        get_record_value(mapping, "position"),
        &append_path(path, "position"),
        context,
        &VECTOR_3_KEYS,
    )?;
    let rotation_path = append_path(path, "rotation");
    let Some(rotation_raw) = mapping_of(get_record_value(mapping, "rotation"))
        .filter(|rotation| has_only_keys(rotation, &QUATERNION_KEYS))
    else {
        return refuse(context, &rotation_path);
    };
    let rotation = read_vector3(
        Some(&SceneDocumentYamlSubsetValue::Mapping(rotation_raw.clone())),
        &rotation_path,
        context,
        &QUATERNION_KEYS,
    )?;
    let Some(w) = number_of(get_record_value(rotation_raw, "w")) else {
        return refuse(context, &append_path(&rotation_path, "w"));
    };
    let scale = read_vector3(
        get_record_value(mapping, "scale"),
        &append_path(path, "scale"),
        context,
        &VECTOR_3_KEYS,
    )?;
    let mut transform = create_transform3d();
    transform.position.x = position[0] as f32;
    transform.position.y = position[1] as f32;
    transform.position.z = position[2] as f32;
    transform.rotation.x = rotation[0] as f32;
    transform.rotation.y = rotation[1] as f32;
    transform.rotation.z = rotation[2] as f32;
    transform.rotation.w = w as f32;
    transform.scale.x = scale[0] as f32;
    transform.scale.y = scale[1] as f32;
    transform.scale.z = scale[2] as f32;
    return Some(transform);
}

fn read_vector3(
    value: Option<&SceneDocumentYamlSubsetValue>,
    path: &str,
    context: &mut ReadContext,
    allowed: &[&str],
) -> Option<[f64; 3]> {
    let Some(mapping) = mapping_of(value).filter(|mapping| has_only_keys(mapping, allowed)) else {
        return refuse(context, path);
    };
    let mut out = [0.0; 3];
    for (index, axis) in ["x", "y", "z"].iter().enumerate() {
        let Some(component) = number_of(get_record_value(mapping, axis)) else {
            return refuse(context, &append_path(path, axis));
        };
        out[index] = component;
    }
    return Some(out);
}

// Records a StructureInvalid refusal unless an earlier refusal already explains the input.
fn refuse<T>(context: &mut ReadContext, path: &str) -> Option<T> {
    if context.refusal.is_none() {
        context.refusal = Some(create_document_refusal(
            FlightDocumentRefusalReason::StructureInvalid,
            path,
        ));
    }
    return None;
}

fn refuse_token<T>(
    context: &mut ReadContext,
    reason: FlightDocumentRefusalReason,
    path: &str,
    token_key: &str,
    mode: Option<&str>,
) -> Option<T> {
    if context.refusal.is_none() {
        let mut refusal = create_document_refusal(reason, path);
        refusal.mode = mode.map(str::to_string);
        refusal.token_key = Some(token_key.to_string());
        context.refusal = Some(refusal);
    }
    return None;
}

const CAMERA_KEYS: [&str; 6] = ["far", "name", "near", "node", "projection", "transform"];
const DESCRIPTOR_RESERVED_FIELDS: [&str; 1] = ["kind"];
const DOCUMENT_KEYS: [&str; 4] = ["defaultScene", "flight", "resources", "scenes"];
const INTERACTIVE_STATE_2D_PROPERTIES: [&str; 4] = ["scaleX", "scaleY", "x", "y"];
const INTERACTIVE_STATE_KEYS: [&str; 7] = [
    "alpha",
    "extensions",
    "scaleX",
    "scaleY",
    "visible",
    "x",
    "y",
];
const INTERACTIVE_STATE_PHASES: [&str; 3] = ["disabled", "hover", "pressed"];
const INTERACTIVE_STATE_PROPERTIES: [&str; 6] = ["alpha", "scaleX", "scaleY", "visible", "x", "y"];
const LIGHT_KEYS: [&str; 4] = ["descriptor", "name", "node", "transform"];
const LAYOUT_KEYS: [&str; 2] = ["targets", "tree"];
const LAYOUT_NODE_KEYS: [&str; 4] = ["containerStyle", "itemStyle", "kind", "parentIndex"];
const LAYOUT_TREE_KEYS: [&str; 1] = ["nodes"];
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
const NODE_RESERVED_FIELDS: [&str; 4] = ["children", "interactiveStates", "kind", "transition"];
const ORTHOGRAPHIC_PROJECTION_KEYS: [&str; 3] = ["halfHeight", "halfWidth", "kind"];
const PERSPECTIVE_PROJECTION_KEYS: [&str; 3] = ["aspect", "fovY", "kind"];
const QUATERNION_KEYS: [&str; 4] = ["w", "x", "y", "z"];
const RESOURCE_RESERVED_FIELDS: [&str; 2] = ["key", "kind"];
const SCENE_2D_KEYS: [&str; 5] = ["backgroundColor", "kind", "layouts", "scene", "tokens"];
const SCENE_3D_KEYS: [&str; 6] = ["cameras", "kind", "layouts", "lights", "scene", "tokens"];
// A token row flattens its mode variants beside kind and key, exactly as a resource row flattens
// its fields, so these two names are structural and can never be authored as mode names.
const TOKEN_RESERVED_FIELDS: [&str; 2] = ["key", "kind"];
const TRANSFORM_3D_KEYS: [&str; 3] = ["position", "rotation", "scale"];
const VECTOR_3_KEYS: [&str; 3] = ["x", "y", "z"];
