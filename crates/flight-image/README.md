# flight-image

Portable host-image resources, encoded image references, and their texture-source lifecycle.

The crate performs no native image, browser, renderer, or decoder work itself. Host operations and
source measurement arrive through explicit capabilities and caller-owned resolver state.
