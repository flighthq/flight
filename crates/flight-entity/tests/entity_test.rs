use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct BaseEntity {
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(BaseEntity);

#[derive(Clone, Debug, Default, PartialEq)]
struct TestEntity {
    runtime: EntityRuntimeSlot,
    x: f32,
}

flight_entity::impl_entity!(TestEntity);

mod allocate_entity {
    use super::*;

    #[test]
    fn returns_an_entity_with_no_runtime() {
        let out: BaseEntity = allocate_entity();
        assert!(!has_entity_runtime(&out));
    }

    #[test]
    fn allocates_any_default_entity_type_with_an_empty_runtime_slot() {
        let out: TestEntity = allocate_entity();
        assert!(out.entity_runtime().data.is_none());
        assert_eq!(out.x, 0.0);
    }

    #[test]
    fn returns_a_fresh_value_on_each_call() {
        let mut a: BaseEntity = allocate_entity();
        let b: BaseEntity = allocate_entity();
        attach_entity_binding(&mut a, Box::new(()));
        assert!(has_entity_runtime(&a));
        assert!(!has_entity_runtime(&b));
    }
}

mod impl_entity {
    use super::*;

    mod sprite {
        use flight_entity::*;

        #[derive(Clone, Debug, Default, PartialEq)]
        pub struct Sprite {
            runtime: EntityRuntimeSlot,
            pub x: f32,
        }

        flight_entity::impl_entity!(Sprite);

        pub fn create_sprite(x: f32) -> Sprite {
            let mut out: Sprite = allocate_entity();
            out.x = x;
            return out;
        }
    }

    use sprite::create_sprite;

    #[test]
    fn gives_a_private_field_struct_generic_binding_access() {
        let mut out = create_sprite(1.0);
        assert!(!has_entity_runtime(&out));
        attach_entity_binding(&mut out, Box::new("wrapper".to_string()));
        assert!(has_entity_runtime(&out));
        assert_eq!(get_entity_binding_as::<String, _>(&out).unwrap(), "wrapper");
        detach_entity_binding(&mut out);
        assert!(!has_entity_binding(&out));
    }

    #[test]
    fn gives_a_private_field_struct_generic_uid_access() {
        let mut out = create_sprite(1.0);
        set_entity_uid(&mut out, "sprite-1".to_string());
        assert_eq!(get_entity_uid(&mut out), "sprite-1");
        assert_eq!(get_entity_runtime(&out).unwrap().uid.as_deref(), Some("sprite-1"));
    }

    #[test]
    fn keeps_value_semantics_for_clone_and_equality() {
        let mut source = create_sprite(2.0);
        attach_entity_binding(&mut source, Box::new(()));
        let copy = clone_entity(&source);
        assert_eq!(copy.x, 2.0);
        assert!(!has_entity_runtime(&copy));
        assert_eq!(copy, source);
        assert!(!format!("{:?}", source).contains("()"));
    }

    #[test]
    fn exposes_the_slot_through_the_trait() {
        let mut out = create_sprite(0.0);
        assert!(out.entity_runtime().data.is_none());
        out.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        assert!(has_entity_runtime(&out));
    }
}
