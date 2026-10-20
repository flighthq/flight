use flight_particles::*;

mod step_particle_objects {
    use super::*;

    #[test]
    fn spawns_into_dead_slots_when_called_with_no_forces_or_colliders() {
        let mut objects: Vec<ParticleObject> =
            (0..10).map(|_| ParticleObject::default()).collect();
        let mut state = create_particle_objects_state(10, None);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            spawn_rate: 5.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..Default::default()
        }));
        step_particle_objects(&mut objects, &mut state, &config, 1.0, None, None, None);
        let visible = objects.iter().filter(|o| o.visible).count();
        assert_eq!(visible, 5);
    }
}
