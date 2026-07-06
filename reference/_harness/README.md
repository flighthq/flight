# OpenFL reference harness

Test-scoped bootstrap shared by the OpenFL reference samples. Not shipped, not part of any public API — it exists so each reference can be the OpenFL "Main" scene code, with the window/Stage bootstrap factored out, the way a real OpenFL project separates `project.xml` + the document class from the `Main` Sprite.

`createReferenceStage(width, height, color)` builds the OpenFL Stage + root Sprite and mounts it, and — critically — passes `allowHighDPI: true`. That is the JS equivalent of `<window allow-high-dpi="true"/>` in an OpenFL `project.xml`: without it OpenFL's `HTML5Window` keeps `scale = 1` and never sizes the canvas backing store by `devicePixelRatio`, so the reference renders at 1× and looks soft next to the DPI-correct Flight columns. A shipped OpenFL app almost always sets this, so enabling it makes the reference more faithful, not less.
