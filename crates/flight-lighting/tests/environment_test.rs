use std::sync::{Arc, RwLock};

use flight_lighting::contract::*;
use flight_texture::{Texture, create_cube_texture};

fn cube() -> flight_entity::Ref<Texture> {
    return Arc::new(RwLock::new(Texture::Cube(create_cube_texture(None))));
}

mod clone_environment {
    use super::*;

    #[test]
    fn creates_a_fresh_descriptor_that_shares_the_texture_resource() {
        let texture = cube();
        let mut source = create_environment();
        source.enabled = false;
        source.environment = Some(texture.clone());
        source.intensity = 0.5;
        let copy = clone_environment(&source);
        assert!(Arc::ptr_eq(copy.environment.as_ref().unwrap(), &texture));
        assert!(!copy.enabled);
        assert_eq!(copy.intensity, 0.5);
        assert_eq!(copy.kind, ENVIRONMENT_KIND);
    }
}

mod create_environment {
    use super::*;

    #[test]
    fn defaults_to_no_texture_at_unit_intensity() {
        let environment = create_environment();
        assert!(environment.environment.is_none());
        assert!(environment.enabled);
        assert_eq!(environment.intensity, 1.0);
        assert_eq!(environment.kind, ENVIRONMENT_KIND);
    }
}

mod initialize_environment {
    use super::*;

    #[test]
    fn restores_no_texture_and_unit_intensity() {
        let texture = cube();
        let mut environment = create_environment();
        environment.enabled = false;
        environment.environment = Some(texture);
        environment.intensity = 2.0;
        initialize_environment(&mut environment);
        assert!(environment.enabled);
        assert!(environment.environment.is_none());
        assert_eq!(environment.intensity, 1.0);
    }
}
