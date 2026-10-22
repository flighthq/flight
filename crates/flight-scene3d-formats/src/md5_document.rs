use crate::md5_anim_parse::parse_md5_anim;
use crate::md5_parse::parse_md5_mesh_with_section_handlers;
use crate::md5_section_registry::MD5_ALL_SECTION_HANDLERS;
use crate::md5_types::Md5ImportOptions;
use crate::scene_skeleton::find_scene3d_skeleton_joints;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene3d::{Scene3D, Scene3DDocument, create_scene3d_from_document};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::md5_types::{MD5_SKELETON_FEATURE, Md5SectionHandler};
    use std::sync::{Arc, RwLock};

    #[test]
    fn receiver_delegates_to_free_parse_with_the_selected_family_and_diagnostic_sink() {
        let source = "MD5Version 11\njoints {\n\"root\" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nvert 0 ( 0 0 ) 0 1\ntri 0 0 0 0\nweight 0 0 1 ( 0 0 0 )\n}";
        let custom = Arc::new(RwLock::new(Md5SectionHandler {
            feature: MD5_SKELETON_FEATURE.to_string(),
            collect: Arc::new(|context| {
                context.document.scenes[0].name = Some("custom".to_string());
                context.skin = Some(7);
            }),
        }));
        for handlers in [Vec::new(), vec![custom]] {
            let has_custom = !handlers.is_empty();
            let options = Md5ImportOptions {
                section_handlers: Some(handlers),
            };
            let mut method_diagnostics = Vec::new();
            let mut free_diagnostics = Vec::new();
            let method = options.parse(source, Some(&mut method_diagnostics));
            let free = parse_md5_mesh(source, Some(&mut free_diagnostics), Some(&options));
            assert_eq!(
                method.meshes[0].geometry.read().unwrap().vertices,
                free.meshes[0].geometry.read().unwrap().vertices
            );
            assert_eq!(method.scenes[0].root_nodes, free.scenes[0].root_nodes);
            assert_eq!(method.scenes[0].name, free.scenes[0].name);
            assert_eq!(method.meshes[0].skin, free.meshes[0].skin);
            assert_eq!(
                method.meshes[0].skin,
                if has_custom { Some(7) } else { None }
            );
            assert_eq!(method_diagnostics, free_diagnostics);
        }
    }
}

pub fn create_scene3d_from_md5_mesh(
    source: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&Md5ImportOptions>,
) -> Scene3D {
    return create_scene3d_from_document(&parse_md5_mesh(source, diagnostics, options), None);
}

pub fn import_md5_mesh(
    mesh_source: &str,
    anim_source: Option<&str>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&Md5ImportOptions>,
) -> Scene3D {
    let mut scene = create_scene3d_from_md5_mesh(mesh_source, diagnostics.as_deref_mut(), options);
    let Some(anim_source) = anim_source else {
        return scene;
    };
    let Some(joints) = find_scene3d_skeleton_joints(&scene.root) else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "md5mesh.animation-no-skeleton",
            "importMd5Mesh",
            None,
        );
        return scene;
    };
    let clip = parse_md5_anim(anim_source, &joints.read().unwrap(), diagnostics);
    if let Some(clip) = clip {
        scene.animations.insert("default".to_string(), clip);
    }
    return scene;
}

pub fn parse_md5_mesh(
    source: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&Md5ImportOptions>,
) -> Scene3DDocument {
    let handlers = options
        .and_then(|options| options.section_handlers.as_deref())
        .unwrap_or(&MD5_ALL_SECTION_HANDLERS);
    return parse_md5_mesh_with_section_handlers(source, diagnostics, handlers);
}

impl Md5ImportOptions {
    pub fn parse(
        &self,
        source: &str,
        diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    ) -> Scene3DDocument {
        return parse_md5_mesh(source, diagnostics, Some(self));
    }
}
