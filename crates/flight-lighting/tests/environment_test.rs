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
        let source = create_environment(Some(&EnvironmentOptions {
            enabled: Some(false),
            environment: Some(texture.clone()),
            intensity: Some(0.5),
        }));
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
        let environment = create_environment(None);
        assert!(environment.environment.is_none());
        assert!(environment.enabled);
        assert_eq!(environment.intensity, 1.0);
        assert_eq!(environment.kind, ENVIRONMENT_KIND);
    }
}

mod initialize_environment {
    use super::*;

    #[test]
    fn stores_the_supplied_shared_texture() {
        let texture = cube();
        let mut environment = create_environment(None);
        initialize_environment(
            &mut environment,
            Some(&EnvironmentOptions {
                enabled: None,
                environment: Some(texture.clone()),
                intensity: Some(2.0),
            }),
        );
        assert!(Arc::ptr_eq(
            environment.environment.as_ref().unwrap(),
            &texture
        ));
        assert_eq!(environment.intensity, 2.0);
    }
}
