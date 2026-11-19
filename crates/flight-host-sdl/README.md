# flight-host-sdl

Opt-in SDL3 native host for Flight. The crate is a workspace member but is intentionally excluded
from the workspace default members so standard builds do not compile or link SDL.

The complete capability table, lifecycle contract, duplicated winit blocks, and platform limits
are documented with the finished implementation.
