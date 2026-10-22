use flight_materials::PbrExtension;
use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::{GlPbrExtensionIssue, GlPbrExtensionRegistration};

pub fn register_gl_pbr_extension(state: &GlRenderState, registration: GlPbrExtensionRegistration) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.pbr_extension_registrations.insert(registration.kind.clone(), registration);
    });
}

pub fn explain_gl_pbr_extensions(
    state: &GlRenderState,
    extensions: &[PbrExtension],
) -> Vec<GlPbrExtensionIssue> {
    return get_gl_scene3d_runtime(state, |rt| {
        let mut issues = Vec::new();
        let mut seen_kinds: Vec<String> = Vec::new();

        for ext in extensions {
            let kind = get_pbr_extension_kind(ext);

            if seen_kinds.contains(&kind) {
                issues.push(GlPbrExtensionIssue {
                    code: "duplicate-kind".to_string(),
                    kind: kind.clone(),
                });
                continue;
            }
            seen_kinds.push(kind.clone());

            match rt.pbr_extension_registrations.get(&kind) {
                None => {
                    issues.push(GlPbrExtensionIssue {
                        code: "missing-registration".to_string(),
                        kind,
                    });
                }
                Some(reg) if !reg.supported => {
                    issues.push(GlPbrExtensionIssue {
                        code: "unsupported-extension".to_string(),
                        kind,
                    });
                }
                _ => {}
            }
        }

        issues
    });
}

fn get_pbr_extension_kind(ext: &PbrExtension) -> String {
    return match ext {
        PbrExtension::Anisotropy(e) => e.kind.clone(),
        PbrExtension::Clearcoat(e) => e.kind.clone(),
        PbrExtension::Iridescence(e) => e.kind.clone(),
        PbrExtension::Sheen(e) => e.kind.clone(),
        PbrExtension::Specular(e) => e.kind.clone(),
        PbrExtension::TransmissionVolume(e) => e.kind.clone(),
        PbrExtension::WrappedDiffuse(e) => e.kind.clone(),
    };
}
