use super::*;

#[derive(Default)]
struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

mod initialize_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_used_by_effect_factories() {
        let mut effect: TestEffect = flight_entity::allocate_entity();
        initialize_effect(&mut effect, "acme.TestEffect");
        assert_eq!(effect.effect_fields().kind, "acme.TestEffect");
    }
}
