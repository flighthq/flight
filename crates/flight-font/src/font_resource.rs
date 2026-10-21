use flight_entity::allocate_entity;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn fontresource_new_matches_create_font_resource() {
        let method = FontResource::new("Family");
        let free = create_font_resource("Family");
        assert_eq!(method.family, free.family);
        assert!(method.face.is_none());
        assert!(free.face.is_none());
    }
}

/// Creates an unloaded font resource for `family`.
pub fn create_font_resource(family: &str) -> FontResource {
    let mut out: FontResource = allocate_entity();
    initialize_font_resource(&mut out, family);
    return out;
}

/// Resets a construction-time font resource to the supplied family and no attached face.
pub fn initialize_font_resource(out: &mut FontResource, family: &str) {
    out.family = family.to_string();
    out.face = None;
}

impl FontResource {
    pub fn new(family: &str) -> Self {
        return create_font_resource(family);
    }
}
