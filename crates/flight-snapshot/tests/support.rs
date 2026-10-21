use flight_snapshot::contract::*;

/// `{ y }` nested state.
#[derive(Clone, Debug, PartialEq)]
pub struct Nested {
    pub y: f32,
}

/// `{ x, nested: { y }, items: number[] }`, the shape most source tests use.
#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub x: f32,
    pub nested: Nested,
    pub items: Vec<f32>,
}

pub fn state(x: f32, y: f32, items: &[f32]) -> State {
    return State {
        x,
        nested: Nested { y },
        items: items.to_vec(),
    };
}

/// `{ pos: { x, y }, hp }` / `{ x, y, name }` style interpolation state.
#[derive(Clone, Debug, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Body {
    pub pos: Point,
    pub hp: f32,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Player {
    pub health: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Roster {
    pub players: Vec<Player>,
}

pub fn guards() -> SnapshotGuardState {
    return create_snapshot_guard_state();
}

impl SnapshotInterpolate for Point {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(&mut out.x, &a.x, &b.x, interpolation, path, "x");
        interpolate_snapshot_field(&mut out.y, &a.y, &b.y, interpolation, path, "y");
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

impl SnapshotInterpolate for Body {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(&mut out.pos, &a.pos, &b.pos, interpolation, path, "pos");
        interpolate_snapshot_field(&mut out.hp, &a.hp, &b.hp, interpolation, path, "hp");
        interpolate_snapshot_field(&mut out.name, &a.name, &b.name, interpolation, path, "name");
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

impl SnapshotInterpolate for Player {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(
            &mut out.health,
            &a.health,
            &b.health,
            interpolation,
            path,
            "health",
        );
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

impl SnapshotInterpolate for Roster {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(
            &mut out.players,
            &a.players,
            &b.players,
            interpolation,
            path,
            "players",
        );
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}
