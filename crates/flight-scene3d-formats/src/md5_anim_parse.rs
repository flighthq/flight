use crate::md5_number::{is_md5_whitespace, parse_md5_float, parse_md5_integer};
use crate::md5_parse::tally_md5_drop;
use crate::md5_types::Md5DropTallyEntry;
use crate::shared::{convert_positions_z_up_to_y_up, convert_quaternions_z_up_to_y_up};
use flight_animation::{
    AnimationClip, create_animation_channel, create_animation_clip, create_animation_track,
};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene3d::{Node3DRef, Scene3DAnimationPath, Scene3DAnimationTarget};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

// flight-lint: allow(f64) Principal7f1f0994 bounded private MD5 animation token/W adapter retains parsed baseframe components until its source W calculation and final canonical f32 track writes
struct Md5AnimBaseframePose {
    components: [f64; 6],
}

// flight-lint: allow(f64) Principal7f1f0994 bounded private MD5 animation token/W adapter retains frame tokens for flag-selected quaternion W reconstruction before canonical f32 track writes
struct Md5AnimFrame {
    components: Vec<f64>,
}

struct Md5AnimHierarchyEntry {
    flags: i32,
    name: String,
    start_index: i32,
}

// flight-lint: allow(f64) Principal7f1f0994 private animation W adapter computes sumSq and sqrt in source Number precision, without the mesh normalization/Recover branch; outputs remain canonical f32 tracks
fn build_animation_clip(
    joints: &[Node3DRef],
    hierarchy: &[Md5AnimHierarchyEntry],
    baseframe: &[Md5AnimBaseframePose],
    frames: &[Md5AnimFrame],
    frame_rate: f32,
    declared_components: i32,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> Ref<AnimationClip> {
    let mut channels = Vec::new();
    let times: Vec<_> = (0..frames.len())
        .map(|frame| frame as f32 / frame_rate)
        .collect();
    let mut node_by_name = HashMap::new();
    for joint in joints {
        if let Some(name) = joint.read().unwrap().node_fields().name.clone() {
            if !name.is_empty() {
                node_by_name.insert(name, joint.clone());
            }
        }
    }
    let component_total: usize = hierarchy
        .iter()
        .map(|entry| count_md5_anim_flag_components(entry.flags))
        .sum();
    if declared_components >= 0 && declared_components as usize != component_total {
        tally_md5_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "md5anim.component-count-mismatch",
            "",
            number_detail(&[
                ("firstActual", component_total as f32),
                ("firstExpected", declared_components as f32),
            ]),
        );
    }
    if baseframe.len() < hierarchy.len() {
        tally_md5_drop(
            drops.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "md5anim.baseframe-count-mismatch",
            "",
            number_detail(&[
                ("firstActual", baseframe.len() as f32),
                ("firstExpected", hierarchy.len() as f32),
            ]),
        );
    }
    for (frame, data) in frames.iter().enumerate() {
        if data.components.len() != component_total {
            tally_md5_drop(
                drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "md5anim.frame-width-mismatch",
                "",
                number_detail(&[
                    ("firstActual", data.components.len() as f32),
                    ("firstExpected", component_total as f32),
                    ("firstFrame", frame as f32),
                ]),
            );
            break;
        }
    }
    for (joint_index, entry) in hierarchy.iter().enumerate() {
        let base = baseframe
            .get(joint_index)
            .map(|pose| pose.components)
            .unwrap_or([0.0; 6]);
        let width = count_md5_anim_flag_components(entry.flags);
        if entry.start_index < 0
            || (width > 0 && entry.start_index as usize + width > component_total)
        {
            tally_md5_drop(
                drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "md5anim.joint-frame-window-invalid",
                "",
                number_detail(&[
                    ("firstIndex", entry.start_index as f32),
                    ("firstJoint", joint_index as f32),
                    ("firstWidth", width as f32),
                ]),
            );
        }
        let mut translation_values = Vec::new();
        let mut rotation_values = Vec::new();
        for frame in frames {
            let mut values = base;
            let mut offset = entry.start_index as i64;
            for (bit, value) in values.iter_mut().enumerate() {
                if entry.flags & (1 << bit) != 0 {
                    if offset >= 0 {
                        if let Some(animated) = frame.components.get(offset as usize) {
                            *value = *animated;
                        }
                    }
                    offset += 1;
                }
            }
            let sum_sq = values[3] * values[3] + values[4] * values[4] + values[5] * values[5];
            let w = if sum_sq < 1.0 {
                -(1.0 - sum_sq).sqrt()
            } else {
                0.0
            };
            translation_values.extend_from_slice(&[
                values[0] as f32,
                values[1] as f32,
                values[2] as f32,
            ]);
            rotation_values.extend_from_slice(&[
                values[3] as f32,
                values[4] as f32,
                values[5] as f32,
                w as f32,
            ]);
        }
        convert_positions_z_up_to_y_up(&mut translation_values, None, None);
        convert_quaternions_z_up_to_y_up(&mut rotation_values, None, None);
        let node = node_by_name
            .get(&entry.name)
            .unwrap_or(&joints[joint_index])
            .clone();
        for (components, values, quaternion, path) in [
            (
                3,
                translation_values,
                false,
                Scene3DAnimationPath::Translation,
            ),
            (4, rotation_values, true, Scene3DAnimationPath::Rotation),
        ] {
            let mut track = create_animation_track();
            track.components = components;
            track.times = times.clone();
            track.values = values;
            track.quaternion = quaternion;
            let track = Arc::new(RwLock::new(track));
            channels.push(create_animation_channel(
                &track,
                Some(Arc::new(Scene3DAnimationTarget {
                    node: node.clone(),
                    path,
                })),
            ));
        }
    }
    return Arc::new(RwLock::new(create_animation_clip(channels, None, &[])));
}

fn count_md5_anim_flag_components(flags: i32) -> usize {
    return (0..6).filter(|bit| flags & (1 << bit) != 0).count();
}

fn malformed(
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    record: &str,
    reason: &str,
    line_index: usize,
) {
    let mut detail = number_detail(&[("firstLine", (line_index + 1) as f32)]);
    detail.insert(
        "reason".to_string(),
        ImportDiagnosticDetailValue::String(reason.to_string()),
    );
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Drop,
        &format!("md5anim.malformed-{record}"),
        reason,
        detail,
    );
}

fn number_detail(values: &[(&str, f32)]) -> HashMap<String, ImportDiagnosticDetailValue> {
    return values
        .iter()
        .map(|(key, value)| (key.to_string(), ImportDiagnosticDetailValue::Number(*value)))
        .collect();
}

fn parse_baseframe_block(
    lines: &[&str],
    start_line: usize,
    baseframe: &mut Vec<Md5AnimBaseframePose>,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> usize {
    let mut index = start_line;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line == "}" {
            return index;
        }
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if let Some(pose) = parse_baseframe_line(line, drops.as_deref_mut(), index - 1) {
            baseframe.push(pose);
        }
    }
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "md5anim.baseframe-block-unclosed",
        "",
        HashMap::new(),
    );
    return index;
}

fn parse_baseframe_line(
    line: &str,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<Md5AnimBaseframePose> {
    let replaced = line.replace('(', "").replace(')', "");
    let tokens: Vec<_> = replaced
        .split(is_md5_whitespace)
        .filter(|value| !value.is_empty())
        .collect();
    if tokens.len() < 6 {
        malformed(drops, "baseframe", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_float(tokens[0]),
        parse_md5_float(tokens[1]),
        parse_md5_float(tokens[2]),
        parse_md5_float(tokens[3]),
        parse_md5_float(tokens[4]),
        parse_md5_float(tokens[5]),
    ];
    if values.iter().any(Option::is_none) {
        malformed(drops, "baseframe", "non-numeric-values", line_index);
        return None;
    }
    return Some(Md5AnimBaseframePose {
        components: values.map(Option::unwrap),
    });
}

fn parse_frame_block(
    lines: &[&str],
    start_line: usize,
    frame: &mut Md5AnimFrame,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> usize {
    let mut index = start_line;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line == "}" {
            return index;
        }
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        for token in line
            .split(is_md5_whitespace)
            .filter(|value| !value.is_empty())
        {
            if let Some(value) = parse_md5_float(token) {
                frame.components.push(value);
            } else {
                let mut detail = number_detail(&[("firstLine", index as f32)]);
                detail.insert(
                    "firstToken".to_string(),
                    ImportDiagnosticDetailValue::String(token.to_string()),
                );
                tally_md5_drop(
                    drops.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    "md5anim.non-numeric-frame-value",
                    "non-numeric-frame-value",
                    detail,
                );
                frame.components.push(0.0);
            }
        }
    }
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "md5anim.frame-block-unclosed",
        "",
        HashMap::new(),
    );
    return index;
}

fn parse_hierarchy_block(
    lines: &[&str],
    start_line: usize,
    hierarchy: &mut Vec<Md5AnimHierarchyEntry>,
    mut drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> usize {
    let mut index = start_line;
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line == "}" {
            return index;
        }
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if let Some(entry) = parse_hierarchy_line(line, drops.as_deref_mut(), index - 1) {
            hierarchy.push(entry);
        }
    }
    tally_md5_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "md5anim.hierarchy-block-unclosed",
        "",
        HashMap::new(),
    );
    return index;
}

fn parse_hierarchy_line(
    line: &str,
    drops: Option<&mut Vec<Md5DropTallyEntry>>,
    line_index: usize,
) -> Option<Md5AnimHierarchyEntry> {
    let quoted = line.find('"').and_then(|start| {
        line[start + 1..]
            .find('"')
            .map(|end| (start + 1, start + 1 + end))
    });
    let Some((start, end)) = quoted else {
        malformed(drops, "hierarchy", "missing-name-quotes", line_index);
        return None;
    };
    let tokens: Vec<_> = line[end + 1..]
        .split(is_md5_whitespace)
        .filter(|value| !value.is_empty())
        .collect();
    if tokens.len() < 3 {
        malformed(drops, "hierarchy", "not-enough-components", line_index);
        return None;
    }
    let values = [
        parse_md5_integer(tokens[0]),
        parse_md5_integer(tokens[1]),
        parse_md5_integer(tokens[2]),
    ];
    if values.iter().any(Option::is_none) {
        malformed(drops, "hierarchy", "non-numeric-values", line_index);
        return None;
    }
    return Some(Md5AnimHierarchyEntry {
        name: line[start..end].to_string(),
        flags: values[1].unwrap() as i32,
        start_index: values[2].unwrap() as i32,
    });
}

pub fn parse_md5_anim(
    source: &str,
    joints: &[Node3DRef],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<AnimationClip>> {
    let lines: Vec<_> = source.split('\n').collect();
    let mut index = 0;
    let mut frame_rate = 24.0;
    let (mut num_frames, mut num_joints, mut declared_components) = (0, 0, -1);
    let mut hierarchy = Vec::new();
    let mut baseframe = Vec::new();
    let mut frames = Vec::new();
    let mut drops = diagnostics.as_ref().map(|_| Vec::new());
    while index < lines.len() {
        let line = lines[index].trim_matches(is_md5_whitespace);
        index += 1;
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        let header = line
            .split(is_md5_whitespace)
            .filter(|value| !value.is_empty())
            .nth(1)
            .and_then(parse_md5_integer);
        if line.starts_with("MD5Version") {
            if let Some(version) = header {
                if version != 10.0 {
                    report_import_diagnostic(
                        diagnostics.as_deref_mut(),
                        ImportDiagnosticSeverity::Recover,
                        "md5anim.unsupported-version",
                        "parseMd5Anim",
                        Some(number_detail(&[("version", version as f32)])),
                    );
                }
            }
        } else if line.starts_with("commandline") {
            continue;
        } else if line.starts_with("numFrames") || line.starts_with("numJoints") {
            let is_frame = line.starts_with("numFrames");
            let value = if let Some(value) = header {
                value as i32
            } else {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    if is_frame {
                        "md5anim.non-numeric-numframes"
                    } else {
                        "md5anim.non-numeric-numjoints"
                    },
                    "parseMd5Anim",
                    None,
                );
                0
            };
            if is_frame {
                num_frames = value;
            } else {
                num_joints = value;
            }
        } else if line.starts_with("frameRate") {
            if header.is_none_or(|rate| rate <= 0.0) {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    "md5anim.invalid-framerate",
                    "parseMd5Anim",
                    None,
                );
                frame_rate = 24.0;
            } else {
                frame_rate = header.unwrap() as f32;
            }
        } else if line.starts_with("numAnimatedComponents") {
            if let Some(value) = header {
                if value >= 0.0 {
                    declared_components = value as i32;
                }
            }
        } else if line == "hierarchy {" {
            index = parse_hierarchy_block(&lines, index, &mut hierarchy, drops.as_mut());
        } else if line == "baseframe {" {
            index = parse_baseframe_block(&lines, index, &mut baseframe, drops.as_mut());
        } else if line == "bounds {" {
            index = skip_block(&lines, index);
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Skip,
                "md5anim.bounds-unsupported",
                "parseMd5Anim",
                None,
            );
        } else if line.starts_with("frame ") && line.ends_with('{') {
            let mut frame = Md5AnimFrame {
                components: Vec::new(),
            };
            index = parse_frame_block(&lines, index, &mut frame, drops.as_mut());
            frames.push(frame);
        }
    }
    let mut clip = None;
    if hierarchy.is_empty() || frames.is_empty() {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Reject,
            "md5anim.no-data",
            "parseMd5Anim",
            None,
        );
    } else {
        for (kind, declared, found) in [
            ("md5anim.joint-count-mismatch", num_joints, hierarchy.len()),
            ("md5anim.frame-count-mismatch", num_frames, frames.len()),
        ] {
            if declared < 0 || declared as usize != found {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Recover,
                    kind,
                    "parseMd5Anim",
                    Some(number_detail(&[
                        ("declared", declared as f32),
                        ("found", found as f32),
                    ])),
                );
            }
        }
        if joints.len() < hierarchy.len() {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Reject,
                "md5anim.joints-too-few",
                "parseMd5Anim",
                Some(number_detail(&[
                    ("animationJoints", hierarchy.len() as f32),
                    ("suppliedJoints", joints.len() as f32),
                ])),
            );
        } else {
            clip = Some(build_animation_clip(
                joints,
                &hierarchy,
                &baseframe,
                &frames,
                frame_rate,
                declared_components,
                drops.as_mut(),
            ));
        }
    }
    if let Some(drops) = drops {
        for entry in drops {
            let mut detail = entry.value.detail;
            detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(entry.value.count as f32),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                entry.value.severity,
                &entry.value.kind,
                "parseMd5Anim",
                Some(detail),
            );
        }
    }
    return clip;
}

fn skip_block(lines: &[&str], start_line: usize) -> usize {
    let mut index = start_line;
    while index < lines.len() {
        if lines[index].trim_matches(is_md5_whitespace) == "}" {
            return index + 1;
        }
        index += 1;
    }
    return index;
}
