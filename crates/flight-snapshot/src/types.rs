/// Which numeric leaf fields `interpolate_snapshots` may interpolate (TS `SnapshotSchema`), as
/// dot-separated paths from the state root; array elements use their numeric index, e.g.
/// `"players.0.health"`. A listed numeric leaf is lerped; every other numeric leaf snaps to the
/// destination. Passing no schema interpolates all numeric leaves.
pub type SnapshotSchema = Vec<String>;
