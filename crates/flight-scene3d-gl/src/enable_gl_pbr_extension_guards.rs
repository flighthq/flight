use flight_materials::PbrExtension;
use flight_render_gl::GlRenderState;

use crate::gl_pbr_extension_registry::explain_gl_pbr_extensions;
use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::{GlPbrExtensionIssue, GlScene3DPbrExtensionGuard};

pub fn are_gl_pbr_extension_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.pbr_extension_guard.is_some());
}

pub fn enable_gl_pbr_extension_guards(state: &GlRenderState, guard: GlScene3DPbrExtensionGuard) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.pbr_extension_guard = Some(guard);
    });
}

fn get_gl_pbr_extension_issue_message(issue: &GlPbrExtensionIssue) -> String {
    return match issue.code.as_str() {
        "duplicate-kind" => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' appears more than once \
             — call createExtendedPbrMaterial with each extension kind at most once",
            issue.kind
        ),
        "framebuffer-feedback" => {
            "glExtendedPbrMeshMaterialRenderer: transmission scene color aliases the active draw \
             attachment — call setGlPbrTransmissionSceneColor(state, a distinct resolved \
             scene-color target)"
                .to_string()
        }
        "missing-registration" => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' has no GL registration \
             — call registerGlPbrExtension(state, kind, registration)",
            issue.kind
        ),
        "texture-unit-exhaustion" => {
            "glExtendedPbrMeshMaterialRenderer: extension maps exceed the available fragment \
             texture units — call createExtendedPbrMaterial with fewer mapped extensions"
                .to_string()
        }
        "unsupported-extension" => format!(
            "glExtendedPbrMeshMaterialRenderer: extension kind '{}' is unsupported by its GL \
             registration — call registerGlPbrExtension(state, kind, a supported registration)",
            issue.kind
        ),
        _ => format!("glExtendedPbrMeshMaterialRenderer: unknown issue code '{}'", issue.code),
    };
}

pub fn warn_gl_pbr_extension_issues(state: &GlRenderState, extensions: &[PbrExtension]) {
    let issues = explain_gl_pbr_extensions(state, extensions);
    for issue in &issues {
        let _message = get_gl_pbr_extension_issue_message(issue);
    }
}
