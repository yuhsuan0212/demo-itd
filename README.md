# Gradient Logit Steering Trace Demo

Open `index.html` directly in a browser, or serve this directory with any static file server. The page uses `record.js`, so it does not need a backend or JSON fetch permissions.

This bundled trace uses the original generation length settings:

- `steps=256`
- `gen_length=256`
- `block_length=32`
- `temperature=0.4`

For a visible logit-shifting demo, the bundled trace uses `control.safety_margin=1.0`. A strict default `control.safety_margin=0.1` trace was also recorded under `output/gradient_viz/official_256_record_margin01_20260604-110137/`, but it produced no nonzero logit shifts for this prompt.
