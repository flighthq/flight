//! The opt-in CustomShaderMaterial ABI guards (TS `enableWgpuScene3DCustomShaderGuards.ts`): warn-once
//! diagnostics for uniform shapes, the fixed capacities and the reserved WGSL bindings, so the renderer
//! itself carries no logging unless a caller enables them.

use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_materials::{CustomShaderMaterial, UniformValue};
use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_custom_material_abi::{
    WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY, WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY,
};
use crate::wgpu_scene3d_runtime::{find_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime};

/// Whether the custom-shader guards are installed on `state` (TS
/// `areWgpuScene3DCustomShaderGuardsEnabled`).
pub fn are_wgpu_scene3d_custom_shader_guards_enabled(state: &mut WgpuRenderState) -> bool {
    return get_wgpu_scene3d_runtime(state)
        .custom_shader_guard
        .is_some();
}

/// Installs the warn-once custom-material ABI diagnostics on `state` (TS
/// `enableWgpuScene3DCustomShaderGuards`). Idempotent. Warnings go to `log_state`, kept as the
/// state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_wgpu_scene3d_custom_shader_guards(
    state: &mut WgpuRenderState,
    log_state: Option<LogStateRef>,
) {
    get_wgpu_scene3d_runtime(state).custom_shader_guard_log = log_state;
    get_wgpu_scene3d_runtime(state).custom_shader_guard = Some(run_wgpu_custom_shader_guards);
}

// The material's uniform names in sorted order (TS `Object.keys(uniforms).sort()`).
// flight-lint: allow(hashmap-iteration) the keys are collected and sorted, so the map's order never escapes
fn get_sorted_uniform_names(material: &CustomShaderMaterial) -> Vec<String> {
    let mut names: Vec<String> = match &material.uniforms {
        Some(uniforms) => uniforms.keys().cloned().collect(),
        None => Vec::new(),
    };
    names.sort();
    return names;
}

fn has_attribute_pair(
    source: &str,
    first: &str,
    first_value: u32,
    second: &str,
    second_value: u32,
) -> bool {
    let bytes = source.as_bytes();
    let mut index = 0;
    while let Some(found) = source[index..].find('@') {
        let start = index + found;
        index = start + 1;
        let Some(end) = match_attribute(source, start, first, first_value) else {
            continue;
        };
        // Up to 80 characters that are not the start of another @group/@binding.
        let mut cursor = end;
        let mut count = 0;
        loop {
            if match_attribute(source, cursor, second, second_value).is_some() {
                return true;
            }
            if cursor >= bytes.len() || count >= 80 {
                break;
            }
            if source[cursor..].starts_with("@group") || source[cursor..].starts_with("@binding") {
                break;
            }
            let width = source[cursor..].chars().next().map_or(1, char::len_utf8);
            cursor += width;
            count += 1;
        }
    }
    return false;
}

// Whether `source` declares `@group(group)` and `@binding(binding)` on one declaration, in either
// order, within 80 characters and without another @group/@binding between them (TS: two regexes).
fn has_binding(source: &str, group: u32, binding: u32) -> bool {
    return has_attribute_pair(source, "group", group, "binding", binding)
        || has_attribute_pair(source, "binding", binding, "group", group);
}

// Matches `@name\s*(\s*value\s*)` at `start`, returning the index just past the closing paren.
fn match_attribute(source: &str, start: usize, name: &str, value: u32) -> Option<usize> {
    let rest = source.get(start..)?;
    let rest = rest.strip_prefix('@')?.strip_prefix(name)?;
    let rest_trimmed = rest.trim_start();
    let rest_trimmed = rest_trimmed.strip_prefix('(')?.trim_start();
    let digits = value.to_string();
    let after_digits = rest_trimmed.strip_prefix(digits.as_str())?;
    let after_space = after_digits.trim_start();
    let after_paren = after_space.strip_prefix(')')?;
    return Some(source.len() - after_paren.len());
}

/// Validates one custom material against the fixed WGSL binding ABI at bind time (TS
/// `runWgpuCustomShaderGuards`): uniform component counts, the UserBlock and texture capacities, and
/// the reserved Frame, Draw, UserBlock and texture-slot bindings. Silent until enabled.
pub fn run_wgpu_custom_shader_guards(
    state: &mut WgpuRenderState,
    shader_key: &str,
    source: &str,
    material: &CustomShaderMaterial,
) {
    if get_wgpu_scene3d_runtime(state)
        .custom_shader_guard
        .is_none()
    {
        return;
    }
    let log_state = find_wgpu_scene3d_runtime(state)
        .and_then(|runtime| runtime.custom_shader_guard_log.clone());

    let uniform_names = get_sorted_uniform_names(material);
    if let Some(uniforms) = &material.uniforms {
        for name in &uniform_names {
            if let Some(UniformValue::Array(value)) = uniforms.get(name)
                && (value.is_empty() || value.len() > 4)
            {
                warn(
                    &log_state,
                    &format!("uniform-length:{}:{}:{}", shader_key, name, value.len()),
                    &format!(
                        "shader \"{}\" uniform \"{}\" has {} components; WebGPU custom material uniforms must be scalars or vectors with 1–4 components.",
                        shader_key,
                        name,
                        value.len()
                    ),
                );
            }
        }
    }
    if uniform_names.len() > WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY {
        warn(
            &log_state,
            &format!("uniform-overflow:{}", shader_key),
            &format!(
                "shader \"{}\" has {} uniforms, exceeding the fixed {}-vec4 UserBlock capacity; extra alphabetically sorted fields are not uploaded.",
                shader_key,
                uniform_names.len(),
                WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY
            ),
        );
    }

    let texture_count = material.textures.as_ref().map_or(0, Vec::len);
    if texture_count > WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY {
        warn(
            &log_state,
            &format!("texture-overflow:{}", shader_key),
            &format!(
                "shader \"{}\" has {} textures, exceeding the fixed {}-texture binding capacity; extra bag-order textures are not bound.",
                shader_key, texture_count, WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY
            ),
        );
    }

    let mut required: Vec<(u32, u32, String)> = vec![
        (0, 0, "Frame".to_string()),
        (1, 0, "Draw".to_string()),
        (2, 0, "UserBlock".to_string()),
    ];
    for slot in 0..texture_count.min(WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY) as u32 {
        required.push((3, slot * 2, format!("texture sampler slot {}", slot)));
        required.push((3, slot * 2 + 1, format!("texture view slot {}", slot)));
    }
    for (group, binding, label) in required {
        if has_binding(source, group, binding) {
            continue;
        }
        warn(
            &log_state,
            &format!("missing-binding:{}:{}:{}", shader_key, group, binding),
            &format!(
                "shader \"{}\" is missing reserved @group({}) @binding({}) ({}); declare the fixed scene-wgpu custom material ABI binding.",
                shader_key, group, binding, label
            ),
        );
    }
}

fn warn(log_state: &Option<LogStateRef>, key: &str, message: &str) {
    let Some(log_state) = log_state else {
        return;
    };
    let mut data = HashMap::new();
    data.insert("message".to_string(), LogValue::Str(message.to_string()));
    log_once(
        log_state,
        0.0,
        &format!("scene-wgpu:custom-shader:{}", key),
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene-wgpu".to_string()),
    );
}
