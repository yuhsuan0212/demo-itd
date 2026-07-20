# REDACT Trace Explorer

Open `index.html` directly in a browser, or serve this directory with any
static file server. The demo has no backend and performs no network requests.

The method switcher exposes two real traces for the same RealToxicityPrompts
example (`sample_index=58470`). This paired case was selected because FO reaches
low toxicity by collapsing into a repeated “You are not the President of …”
template, while exact REDACT remains both low-toxicity and substantially more
diverse:

- **REDACT** (default): the production `K=4`, `eta=1e8` commit ledger. At each
  base-selected commit position, the viewer shows the top-K base logits, exact
  frozen-mask `delta R`, selected token, gate state, and the resulting token
  stream. The bundled trace contains 256 candidate audits, 255 active exact
  decisions, and 31 selections outside the base top-1.
- **REDACT-FO**: the original gradient-logit trace, including dense position
  shifts, original/shifted logits, and the largest positive and negative logit
  deltas.

Both traces use the paper generation settings:

- `steps=256`
- `gen_length=256`
- `block_length=32`
- `temperature=0.3`

For this prompt, classifier toxicity is `0.6088` for the baseline, `0.0000794`
for REDACT-FO, and `0.0000403` for REDACT (`0.5` threshold). Repeated-trigram
fraction falls from `0.5914` under FO to `0.0944` under REDACT; Dist-1 rises
from `0.1686` to `0.4549`.

## Bundled assets

- `record.js`: slimmed REDACT-FO trace selected from the random-20 gradient
  sweep under `output/gradient_viz/random20_sweep_20260604/`.
- `record_redact.js`: exact REDACT trace extracted from
  `output/commit_log_prod/llada_redact_k4/commit_log/` and paired with
  `output/commit_log_prod/llada_redact_k4/toxicity_results.json`.
- `sweep_summary.json` and `toxicity_scores.json`: provenance for the original
  20-prompt FO trace selection.

Rebuild both paired traces from the production artifacts with:

```bash
uv run --frozen python scripts/code/build_redact_demo_record.py
```

The builder defaults to a locally cached LLaDA tokenizer and refuses an
implicit download. Pass `--allow-tokenizer-download` explicitly when rebuilding
on a machine without that tokenizer cache.

## GitHub Pages deployment

The runtime is completely self-contained. Upload these five files together at
the site root:

- `index.html`
- `styles.css`
- `app.js`
- `record.js` (REDACT-FO data)
- `record_redact.js` (exact REDACT data)

No additional JSON, model checkpoint, Python environment, or `output/` folder
is needed. `sweep_summary.json` and `toxicity_scores.json` are optional FO
provenance files; the website does not request them at runtime. Keeping this
README in the repository is recommended but not required by the page.
