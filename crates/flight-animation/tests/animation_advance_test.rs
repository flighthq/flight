use std::sync::{Arc, RwLock};

use flight_animation::contract::*;

fn make_player(duration: f32) -> AnimationPlayerRef {
    let clip = create_animation_clip(
        vec![create_animation_channel(
            &Arc::new(RwLock::new({
                let mut track = create_animation_track();
                track.times = vec![0.0, duration];
                track.values = vec![0.0, 1.0];
                track
            })),
            Some(Arc::new(0_usize)),
        )],
        None,
        &[],
    );
    return Arc::new(RwLock::new(create_animation_player(clip)));
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
