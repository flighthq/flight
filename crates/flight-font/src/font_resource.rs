use flight_entity::allocate_entity;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn fontresource_new_matches_create_font_resource() {
        let method = FontResource::new();
        let free = create_font_resource();
        assert_eq!(method.family, free.family);
        assert!(method.face.is_none());
        assert!(free.face.is_none());
    }
}

/// Creates an unloaded font resource; assign its family before loading a face.
// flight-lint: allow(conform-params) Principal3139d09f D23 B: authored family is assigned after zero-field entity construction
pub fn create_font_resource() -> FontResource {
    let mut out: FontResource = allocate_entity();
    initialize_font_resource(&mut out);
    return out;
}

/// Initializes a preallocated construction-time font resource without replacing its entity runtime.
// flight-lint: allow(conform-params) Principal3139d09f D23 B: construction initializes defaults; authored family is assigned afterward
pub fn initialize_font_resource(out: &mut FontResource) {
    out.family = String::new();
    out.face = None;
    return;
}

impl FontResource {
    pub fn new() -> Self {
        return create_font_resource();
    }
}
