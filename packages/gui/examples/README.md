# GUI compositions

`@flighthq/gui` exports behavior primitives, not pre-skinned widgets. These two common editor controls are compositions because they introduce no new interaction behavior.

## Color picker

Use three or four `SliderController`s for the color channels, a `TextInputController` for numeric or hex entry, and caller-drawn gradient nodes for the tracks. Listen to each slider's `onChange`, update the shared color value, and redraw the gradients in application code. The GUI package neither chooses a color model nor creates a gradient visual.

```ts
const red = createSliderController({ minimum: 0, maximum: 255, step: 1, track: redTrack, thumb: redThumb });
const green = createSliderController({ minimum: 0, maximum: 255, step: 1, track: greenTrack, thumb: greenThumb });
const blue = createSliderController({ minimum: 0, maximum: 255, step: 1, track: blueTrack, thumb: blueThumb });
const hex = createTextInputController({ textField: hexField });
```

## Property grid

Use the separate `layout` package to arrange caller-authored label nodes beside the controller suited to each value: `ToggleController` for booleans, `SliderController` or `TextInputController` for numbers, `ComboBoxController` for enumerations, and the color-picker composition above for colors. The grid owns no distinct input state, so it deliberately has no `PropertyGridController`.
