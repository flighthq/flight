/// Compositing blend mode. Mirrors Flash / OpenFL blend modes.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum BlendMode {
    Add,
    Alpha,
    Darken,
    Difference,
    Erase,
    Hardlight,
    Invert,
    Layer,
    Lighten,
    Multiply,
    Normal,
    Overlay,
    Screen,
    Shader,
    Subtract,
}
