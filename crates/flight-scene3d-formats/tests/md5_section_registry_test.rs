use flight_scene3d_formats::*;
use std::sync::Arc;

#[test]
fn contains_each_family_once_in_skeleton_then_material_order() {
    assert_eq!(
        MD5_ALL_SECTION_HANDLERS.len(),
        MD5_SKELETON_FAMILY.len() + MD5_MATERIAL_FAMILY.len()
    );
    assert!(Arc::ptr_eq(
        &MD5_ALL_SECTION_HANDLERS[0],
        &MD5_SKELETON_FAMILY[0]
    ));
    assert!(Arc::ptr_eq(
        &MD5_ALL_SECTION_HANDLERS[1],
        &MD5_MATERIAL_FAMILY[0]
    ));
    assert_eq!(
        MD5_ALL_SECTION_HANDLERS
            .iter()
            .map(|handler| handler.read().unwrap().feature.clone())
            .collect::<Vec<_>>(),
        [MD5_SKELETON_FEATURE, MD5_MATERIAL_FEATURE]
    );
}
