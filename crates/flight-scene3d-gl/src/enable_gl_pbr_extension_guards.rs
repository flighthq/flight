use std::collections::HashMap;

use flight_entity::Ref;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_materials::PbrExtension;
use flight_render_gl::GlRenderState;

use crate::gl_pbr_extension_registry::explain_gl_pbr_extensions;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlPbrExtensionIssue, GlPbrExtensionIssueCode};

// Returns whether the Extended PBR extension guard is installed on `state`.
pub fn are_gl_pbr_extension_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state).pbr_extension_guard.is_some();
}

// Installs the shakeable Extended PBR guard on `state`: when the extended renderer skips a material
// (an unregistered, unsupported or repeated extension kind, transmission feedback, or too many
// extension maps), it warns once per issue with the fix. Not calling this costs the draw nothing.
// Warnings go to `log_state`, kept as the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_pbr_extension_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    state.gl_runtime.borrow_mut().guard_log = log_state;
    get_gl_scene3d_runtime(state).pbr_extension_guard = Some(warn_gl_pbr_extension_issues);
}

// The plain-data issue code as the TS string literal it mirrors.
fn get_gl_pbr_extension_issue_code(code: GlPbrExtensionIssueCode) -> &'static str {
    return match code {
        GlPbrExtensionIssueCode::DuplicateKind => "duplicate-kind",
        GlPbrExtensionIssueCode::FramebufferFeedback => "framebuffer-feedback",
        GlPbrExtensionIssueCode::MissingRegistration => "missing-registration",
        GlPbrExtensionIssueCode::TextureUnitExhaustion => "texture-unit-exhaustion",
        GlPbrExtensionIssueCode::UnsupportedExtension => "unsupported-extension",
    };
}

fn get_gl_pbr_extension_issue_message(issue: &GlPbrExtensionIssue) -> String {
    return match issue.code {
        GlPbrExtensionIssueCode::DuplicateKind => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' appears more than once — call createExtendedPbrMaterial with each extension kind at most once",
            issue.kind
        ),
        GlPbrExtensionIssueCode::FramebufferFeedback => "glExtendedPbrMeshMaterialRenderer: transmission scene color aliases the active draw attachment — call setGlPbrTransmissionSceneColor(state, a distinct resolved scene-color target)".to_string(),
        GlPbrExtensionIssueCode::MissingRegistration => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' has no GL registration — call registerGlPbrExtension(state, kind, registration)",
            issue.kind
        ),
        GlPbrExtensionIssueCode::TextureUnitExhaustion => "glExtendedPbrMeshMaterialRenderer: extension maps exceed the available fragment texture units — call createExtendedPbrMaterial with fewer mapped extensions".to_string(),
        GlPbrExtensionIssueCode::UnsupportedExtension => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' is unsupported by its GL registration — call registerGlPbrExtension(state, kind, a supported registration)",
            issue.kind
        ),
    };
}

fn warn_gl_pbr_extension_issues(state: &mut GlRenderState, extensions: &[Ref<PbrExtension>]) {
    let issues = explain_gl_pbr_extensions(state, extensions);
    let Some(log_state) = state.gl_runtime.borrow().guard_log.clone() else {
        return;
    };
    for issue in &issues {
        let code = get_gl_pbr_extension_issue_code(issue.code);
        let mut data = HashMap::new();
        data.insert("code".to_string(), LogValue::Str(code.to_string()));
        data.insert("kind".to_string(), LogValue::Str(issue.kind.clone()));
        data.insert(
            "message".to_string(),
            LogValue::Str(get_gl_pbr_extension_issue_message(issue)),
        );
        log_once(
            &log_state,
            0.0,
            &format!("scene-gl:pbr-extension:{code}:{}", issue.kind),
            LogLevel::Warn,
            LogDataOrProvider::Data(LogData::Record(data)),
            Some("scene-gl".to_string()),
        );
    }
}
