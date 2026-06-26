// ---------------------------------------------------------------------------
// SceneAnimationPath
// ---------------------------------------------------------------------------

/// Which transform component an animation channel drives on a scene node.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SceneAnimationPath {
    Rotation,
    Scale,
    Translation,
}
