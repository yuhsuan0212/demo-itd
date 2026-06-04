# Gradient Logit Steering Trace Demo

Open `index.html` directly in a browser, or serve this directory with any static file server. The page uses `record.js`, so it does not need a backend or JSON fetch permissions.

This bundled trace was selected from a random-20 prompt sweep. It uses the current original generation length settings:

- `steps=256`
- `gen_length=256`
- `block_length=32`
- `temperature=0.3`

The selected public demo trace is `sample_index=91230` from `seq08` of the sweep. It has nonzero logit shifting across all 8 generation blocks, with 255 shifted steps out of 256 and `max_abs_shift=44.564`.

For a visible logit-shifting demo, the bundled trace uses `control.safety_margin=1.0`. The full unslimmed source trace is under `output/gradient_viz/random20_sweep_20260604/records_margin1_20260604-113431/`. The sweep summary is also bundled as `sweep_summary.json`.
