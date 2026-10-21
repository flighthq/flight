use std::sync::Arc;

use crate::animation_player::advance_animation_player;
use crate::types::*;

pub fn advance_animation_players(
    players: &[AnimationPlayerRef],
    dt: f32,
    advanced: &mut Vec<AnimationPlayerRef>,
) {
    for player in players {
        if advanced.iter().any(|p| Arc::ptr_eq(p, player)) {
            continue;
        }
        advanced.push(player.clone());
        advance_animation_player(&mut player.write().unwrap(), dt);
    }
}
