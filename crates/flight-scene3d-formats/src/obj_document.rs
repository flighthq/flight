use crate::obj_material_registry::OBJ_ALL_MATERIAL_HANDLERS;
use crate::obj_parse::parse_obj_with_material_handlers;
use crate::obj_schema::ObjMaterialLibrary;
use crate::obj_types::ObjImportOptions;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::{Scene3D, Scene3DDocument, create_scene3d_from_document};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::mtl_parse::parse_obj_material_library;

    #[test]
    fn receiver_forwards_default_explicit_and_empty_material_families_and_the_original_diagnostic_collector()
     {
        let source = "usemtl M\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\no\n";
        let library = parse_obj_material_library("newmtl M\nKd 1 0 0\n", None);
        for handlers in [
            None,
            Some(Vec::new()),
            Some(OBJ_ALL_MATERIAL_HANDLERS.clone()),
        ] {
            let expected = usize::from(
                handlers
                    .as_ref()
                    .is_none_or(|handlers| !handlers.is_empty()),
            );
            let options = ObjImportOptions {
                material_handlers: handlers,
            };
            let mut receiver_diagnostics = Vec::new();
            let mut free_diagnostics = Vec::new();
            let receiver = options.parse(source, Some(&library), Some(&mut receiver_diagnostics));
            let free = parse_obj(
                source,
                Some(&library),
                Some(&mut free_diagnostics),
                Some(&options),
            );
            assert_eq!(receiver.materials.len(), expected);
            assert_eq!(free.materials.len(), expected);
            assert_eq!(receiver.meshes.len(), 1);
            assert_eq!(receiver.meshes[0].materials, free.meshes[0].materials);
            assert_eq!(receiver.scenes[0].root_nodes, free.scenes[0].root_nodes);
            assert_eq!(receiver_diagnostics, free_diagnostics);
            assert_eq!(receiver_diagnostics.len(), 1);
            assert_eq!(receiver_diagnostics[0].kind, "obj.object-name-missing");
        }
    }
}

pub fn create_scene3d_from_obj(
    source: &str,
    materials: Option<&ObjMaterialLibrary>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&ObjImportOptions>,
) -> Scene3D {
    return create_scene3d_from_document(&parse_obj(source, materials, diagnostics, options), None);
}

pub fn parse_obj(
    source: &str,
    materials: Option<&ObjMaterialLibrary>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&ObjImportOptions>,
) -> Scene3DDocument {
    let material_handlers = options
        .and_then(|options| options.material_handlers.as_deref())
        .unwrap_or(&OBJ_ALL_MATERIAL_HANDLERS);
    return parse_obj_with_material_handlers(source, materials, diagnostics, material_handlers);
}

impl ObjImportOptions {
    pub fn parse(
        &self,
        source: &str,
        materials: Option<&ObjMaterialLibrary>,
        diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    ) -> Scene3DDocument {
        return parse_obj(source, materials, diagnostics, Some(self));
    }
}
