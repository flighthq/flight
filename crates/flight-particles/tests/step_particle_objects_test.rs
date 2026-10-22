use flight_particles::*;
use flight_particles::contract::ensure_particle_objects_state_capacity;

mod step_particle_objects {
    use super::*;

    #[test]
    fn spawns_into_dead_slots_when_called_with_no_forces_or_colliders() {
        let mut objects: Vec<ParticleObject> =
            (0..10).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 10);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(5.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        step_particle_objects(&mut objects, &mut state, &config, 1.0, None, None, None);
        let visible = objects.iter().filter(|o| o.visible).count();
        assert_eq!(visible, 5);
    }
}
