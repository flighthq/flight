use std::rc::Rc;

use crate::animation_player::advance_animation_player;
use crate::types::*;

pub fn advance_animation_players(
    players: &[AnimationPlayerRef],
    dt: f32,
    advanced: &mut Vec<AnimationPlayerRef>,
) {
    for player in players {
        if advanced.iter().any(|p| Rc::ptr_eq(p, player)) {
            continue;
        }
        advanced.push(player.clone());
        advance_animation_player(&mut player.borrow_mut(), dt);
    }
}
