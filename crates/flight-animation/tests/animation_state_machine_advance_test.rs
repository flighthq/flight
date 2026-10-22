use std::sync::{Arc, RwLock};

use flight_animation::contract::*;

fn make_player_with_target(target: TargetRef, duration: f32) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            &Arc::new(RwLock::new({
                let mut track = create_animation_track();
                track.times = vec![0.0, duration];
                track.values = vec![0.0, 1.0];
                track
            })),
            target,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip)));
}

mod advance_animation_state_machine_with_scratch {
    use super::*;

    #[test]
    fn uses_outer_controller_scratch_while_advancing_players() {
        let player = make_player_with_target(Some(Arc::new(1_usize)), 2.0);
        let tree =
            create_animation_blend_tree_ref(&[create_animation_blend_tree_input(player.clone())]);
        let mut machine = create_animation_state_machine(
            &[{
                let mut created = create_animation_state_machine_state(tree);
                created.name = ("only").to_string();
                created
            }],
            None,
        );
        let mut advanced: Vec<AnimationPlayerRef> = Vec::new();
        advance_animation_state_machine_with_scratch(&mut machine, 0.5, &mut advanced);
        assert_eq!(player.read().unwrap().time, 0.5);
        assert_eq!(advanced.len(), 1);
    }
}
