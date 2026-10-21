use std::sync::{Arc, RwLock};

use flight_animation::*;

fn make_player(duration: f32) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            create_animation_track(CreateAnimationTrackOpts {
                times: vec![0.0, duration],
                values: vec![0.0, 1.0],
                components: None,
                interpolation: None,
                quaternion: None,
                easing: None,
                segment_easings: None,
            }),
            0,
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip, None)));
}

mod advance_animation_players {
    use super::*;

    #[test]
    fn records_identity_in_caller_owned_scratch_and_skips_an_already_advanced_player() {
        let player = make_player(2.0);
        let mut advanced: Vec<AnimationPlayerRef> = vec![player.clone()];
        advance_animation_players(&[player.clone()], 0.5, &mut advanced);
        assert_eq!(player.read().unwrap().time, 0.0);
        assert_eq!(advanced.len(), 1);
    }
}
