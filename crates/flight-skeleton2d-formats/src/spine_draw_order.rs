#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpineDrawOrderMove {
    pub offset: i32,
    pub slot_index: i32,
}

/// Writes the per-slot sort keys, returning false for the source null result and leaving out empty.
// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned sort-key output clears/fills retained capacity; bool preserves the source nullable result separately
pub fn resolve_spine_draw_ordering(
    out: &mut Vec<f32>,
    moves: &[SpineDrawOrderMove],
    slot_count: i32,
) -> bool {
    out.clear();
    if slot_count <= 0 {
        return false;
    }
    let count = slot_count as usize;
    let mut occupants = vec![-1_i32; count];
    let mut moved = vec![false; count];
    for movement in moves {
        if movement.slot_index < 0 || movement.slot_index >= slot_count {
            return false;
        }
        let Some(destination) = movement.slot_index.checked_add(movement.offset) else {
            return false;
        };
        if destination < 0 || destination >= slot_count {
            return false;
        }
        let slot = movement.slot_index as usize;
        let position = destination as usize;
        if occupants[position] != -1 || moved[slot] {
            return false;
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
            return false;
        }
        occupants[position] = next as i32;
        next += 1;
    }
    out.resize(count, 0.0);
    for (position, slot) in occupants.into_iter().enumerate() {
        out[slot as usize] = position as f32;
    }
    return true;
}
