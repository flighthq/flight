use super::*;

mod create_sketch_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_sketch_effect();
        effect.write().unwrap().strength = Some(0.8);
        assert_eq!(effect.read().unwrap().strength, Some(0.8));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_sketch_effect(), "SketchEffect");
    }
}

mod initialize_sketch_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_sketch_effect() {
        let mut effect: SketchEffect = flight_entity::allocate_entity();
        initialize_sketch_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "SketchEffect");
    }
}
