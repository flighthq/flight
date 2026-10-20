use std::cell::RefCell;
use std::rc::Rc;

use flight_animation::*;

fn make_player_with_target(target: TargetRef, duration: f32) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            create_animation_track(CreateAnimationTrackOpts {
                times: vec![0.0, duration],
                values: vec![0.0, 1.0],
                ..Default::default()
            }),
            target,
        )],
        None,
        &[],
    );
    return Rc::new(RefCell::new(create_animation_player(clip, None)));
}

mod advance_animation_state_machine_with_scratch {
    use super::*;

    #[test]
    fn uses_outer_controller_scratch_while_advancing_players() {
        let player = make_player_with_target(1, 2.0);
        let tree = create_animation_blend_tree_ref(&[create_animation_blend_tree_input(
            player.clone(),
            1.0,
            false,
        )]);
        let mut machine = create_animation_state_machine(
            &[create_animation_state_machine_state("only", tree)],
            None,
        );
        let mut advanced: Vec<AnimationPlayerRef> = Vec::new();
        advance_animation_state_machine_with_scratch(&mut machine, 0.5, &mut advanced);
        assert_eq!(player.borrow().time, 0.5);
        assert_eq!(advanced.len(), 1);
    }
}
