#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpineDrawOrderMove {
    pub offset: i32,
    pub slot_index: i32,
}

pub fn resolve_spine_draw_ordering(
    moves: &[SpineDrawOrderMove],
    slot_count: i32,
) -> Option<Vec<f32>> {
    if slot_count <= 0 {
        return None;
    }
    let count = slot_count as usize;
    let mut occupants = vec![-1_i32; count];
    let mut moved = vec![false; count];
    for movement in moves {
        if movement.slot_index < 0 || movement.slot_index >= slot_count {
            return None;
        }
        let destination = movement.slot_index.checked_add(movement.offset)?;
        if destination < 0 || destination >= slot_count {
            return None;
        }
        let slot = movement.slot_index as usize;
        let position = destination as usize;
        if occupants[position] != -1 || moved[slot] {
            return None;
        }
        occupants[position] = movement.slot_index;
        moved[slot] = true;
    }
    let mut next = 0_usize;
    for position in 0..count {
        if occupants[position] != -1 {
            continue;
        }
        while next < count && moved[next] {
            next += 1;
        }
        if next >= count {
            return None;
        }
        occupants[position] = next as i32;
        next += 1;
    }
    let mut keys = vec![0.0; count];
    for (position, slot) in occupants.into_iter().enumerate() {
        keys[slot as usize] = position as f32;
    }
    return Some(keys);
}
