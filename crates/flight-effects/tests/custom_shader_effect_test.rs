use std::collections::HashMap;

use super::*;

mod create_custom_shader_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_custom_shader_effect();
        let mut uniforms = HashMap::new();
        uniforms.insert(
            "intensity".to_string(),
            CustomShaderUniformValue::Number(0.5),
        );
        let mut guard = effect.write().unwrap();
        guard.shader_key = "myEffect".to_string();
        guard.uniforms = Some(uniforms);
        drop(guard);
        assert_eq!(effect.read().unwrap().shader_key, "myEffect");
        assert_eq!(
            effect
                .read()
                .unwrap()
                .uniforms
                .as_ref()
                .unwrap()
                .get("intensity"),
            Some(&CustomShaderUniformValue::Number(0.5)),
        );
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_custom_shader_effect(), "CustomShaderEffect");
    }
}

mod initialize_custom_shader_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_custom_shader_effect() {
        let mut effect: CustomShaderEffect = flight_entity::allocate_entity();
        initialize_custom_shader_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "CustomShaderEffect");
    }
}
