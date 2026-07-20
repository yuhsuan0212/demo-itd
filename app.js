(() => {
  "use strict";

  const records = {
    redact: window.REDACT_TRACE_RECORD,
    fo: window.GRADIENT_LOGITS_RECORD,
  };

  const modeCopy = {
    redact: {
      kicker: "Headline method · commit-time control",
      title: "Choose safely inside the model’s shortlist.",
      description:
        "REDACT waits until the base sampler chooses a commit position, scores " +
        "that position’s top-K tokens with exact frozen-mask risk, then re-picks. " +
        "Commitment timing and the rest of the vocabulary stay untouched.",
      flow: ["base commit", "top-K shortlist", "exact frozen-mask ΔR", "safe re-pick"],
      lensTitle: "Exact intervention",
      lensBody:
        "One candidate batch evaluates the true risk change at the token that is about to become irreversible. No backward pass is used.",
      formula: "score(v) = o(v) − η · w(ρ) · ΔR(v)\nthen Gumbel-max inside top-K",
      eventLabel: "Jump to a commit",
      chartTitle: "Risk signal across decoding",
      chartDescription: "Separate lanes preserve the scale of base risk and realized safety gain.",
      mapTitle: "Commit intervention map",
      mapDescription: "One exact candidate audit at each base-selected commit position.",
    },
    fo: {
      kicker: "First-order surrogate · dense steering",
      title: "Push the logits along a risk gradient.",
      description:
        "REDACT-FO differentiates the risk head through the frozen backbone and " +
        "shifts logits at every masked position. It is cheaper per position, but " +
        "the Taylor direction is only a first-order proxy for the true candidate " +
        "risk change.",
      flow: ["frozen state", "risk backward", "dense logit shift", "base commitment"],
      lensTitle: "First-order surrogate",
      lensBody:
        "A single backward pass transfers the feature-space risk gradient to token logits. The same shifted logits affect token choice and confidence.",
      formula:
        "õᵢ(v) = oᵢ(v) − η · w(ρ) · ⟨∇ₑR, e(v) − e(xᵢ)⟩",
      eventLabel: "Jump to a recorded shift",
      chartTitle: "Risk and shift magnitude",
      chartDescription: "Each lane uses its own maximum so both signals remain visible.",
      mapTitle: "Dense logit-shift map",
      mapDescription: "Shift magnitude over every recorded masked position and decode step.",
    },
  };

  const el = Object.fromEntries(
    [
      "headerMeta",
      "methodKicker",
      "methodTitle",
      "methodDescription",
      "mechanismFlow",
      "thresholdValue",
      "baselineScore",
      "foScore",
      "foQuality",
      "redactScore",
      "redactQuality",
      "stepSlider",
      "stepValue",
      "prevStep",
      "nextStep",
      "playSteps",
      "eventSelect",
      "eventSelectLabel",
      "primaryMetricLabel",
      "primaryMetricValue",
      "rhoValue",
      "secondaryMetricLabel",
      "secondaryMetricValue",
      "stepStatus",
      "lensTitle",
      "lensBody",
      "methodFormula",
      "generationSummary",
      "promptText",
      "tokenStream",
      "tokenLegend",
      "finalGeneration",
      "chartTitle",
      "chartDescription",
      "metricChart",
      "mapTitle",
      "mapDescription",
      "activityMap",
      "mapStatus",
      "commitTitle",
      "commitBadges",
      "selectedToken",
      "selectedPosition",
      "selectedSourceLabel",
      "selectedSource",
      "selectedMeasureLabel",
      "selectedMeasure",
      "detailPickerWrap",
      "detailPickerLabel",
      "detailPicker",
      "primaryTableTitle",
      "primaryTableDescription",
      "primaryTable",
      "secondaryTableTitle",
      "secondaryTableDescription",
      "secondaryDetail",
      "generationConfig",
      "controlConfig",
      "recordConfig",
    ].map((id) => [id, document.getElementById(id)])
  );

  const state = {
    method: location.hash.toLowerCase() === "#fo" ? "fo" : "redact",
    record: null,
    steps: [],
    generatedTokens: [],
    eventIndexes: [],
    step: 1,
    selectedDetailKey: null,
    timer: null,
  };

  init();

  function init() {
    if (!records.redact || !records.fo) {
      document.body.innerHTML =
        '<main class="page"><div class="empty-state">Both REDACT trace files are required.</div></main>';
      return;
    }

    for (const button of document.querySelectorAll("[data-method]")) {
      button.addEventListener("click", () => setMethod(button.dataset.method));
    }
    el.stepSlider.addEventListener("input", () => setStep(Number(el.stepSlider.value)));
    el.prevStep.addEventListener("click", () => setStep(state.step - 1));
    el.nextStep.addEventListener("click", () => setStep(state.step + 1));
    el.playSteps.addEventListener("click", togglePlayback);
    el.eventSelect.addEventListener("change", () => {
      if (el.eventSelect.value !== "") setStep(Number(el.eventSelect.value));
    });
    el.metricChart.addEventListener("click", (event) => jumpFromHorizontalEvent(event, el.metricChart));
    el.activityMap.addEventListener("click", (event) => jumpFromHorizontalEvent(event, el.activityMap));
    window.addEventListener("hashchange", () => {
      const method = location.hash.toLowerCase() === "#fo" ? "fo" : "redact";
      if (method !== state.method) setMethod(method, false);
    });
    document.addEventListener("keydown", (event) => {
      if (/^(INPUT|SELECT|BUTTON|TEXTAREA)$/.test(event.target.tagName)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStep(state.step - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setStep(state.step + 1);
      }
    });

    renderOutcomes();
    setMethod(state.method, false);
  }

  function setMethod(method, updateHash = true) {
    if (!records[method]) return;
    stopPlayback();
    state.method = method;
    state.record = records[method];
    state.steps = state.record.steps || [];
    state.generatedTokens = buildGeneratedTokens(method, state.steps);
    state.eventIndexes = getEventIndexes(method, state.steps);
    state.selectedDetailKey = null;
    document.body.dataset.method = method;
    if (updateHash) history.replaceState(null, "", `#${method}`);

    for (const button of document.querySelectorAll("[data-method]")) {
      const active = button.dataset.method === method;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const card of document.querySelectorAll("[data-score]")) {
      card.classList.toggle("selected", card.dataset.score === method);
    }

    renderModeCopy();
    renderHeader();
    renderEventSelect();
    renderMetadata();
    renderMetricChart();
    renderActivityMap();
    setStep(clamp(state.step, 0, state.steps.length - 1));
  }

  function renderModeCopy() {
    const copy = modeCopy[state.method];
    el.methodKicker.textContent = copy.kicker;
    el.methodTitle.textContent = copy.title;
    el.methodDescription.textContent = copy.description;
    el.lensTitle.textContent = copy.lensTitle;
    el.lensBody.textContent = copy.lensBody;
    el.methodFormula.textContent = copy.formula;
    el.eventSelectLabel.textContent = copy.eventLabel;
    el.chartTitle.textContent = copy.chartTitle;
    el.chartDescription.textContent = copy.chartDescription;
    el.mapTitle.textContent = copy.mapTitle;
    el.mapDescription.textContent = copy.mapDescription;
    el.mechanismFlow.innerHTML = copy.flow
      .map(
        (node, index) =>
          `${index ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}` +
          `<span class="flow-node${index === 2 ? " emphasis" : ""}">${escapeHtml(node)}</span>`
      )
      .join("");
  }

  function renderHeader() {
    const methodLabel = state.method === "redact" ? "exact ΔR" : "first-order";
    el.headerMeta.innerHTML = [
      `sample ${state.record.sample_index}`,
      `${state.steps.length} steps`,
      methodLabel,
    ]
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join("");
  }

  function renderOutcomes() {
    const outcomes = records.redact.outcomes || {
      baseline_toxicity: records.fo.demo_selection?.baseline_toxicity,
      fo_toxicity: records.fo.demo_selection?.gradient_toxicity,
      redact_toxicity: null,
      toxic_threshold: records.fo.demo_selection?.toxic_threshold,
    };
    el.baselineScore.textContent = formatPercent(outcomes.baseline_toxicity);
    el.foScore.textContent = formatPercent(outcomes.fo_toxicity);
    el.redactScore.textContent = formatPercent(outcomes.redact_toxicity);
    el.foQuality.textContent = `repeat-3 ${formatPercent(
      outcomes.fo_degeneracy?.repeated_3gram_fraction
    )}`;
    el.redactQuality.textContent = `repeat-3 ${formatPercent(
      outcomes.redact_degeneracy?.repeated_3gram_fraction
    )}`;
    el.thresholdValue.textContent = formatNum(outcomes.toxic_threshold);
  }

  function getEventIndexes(method, steps) {
    return steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) =>
        method === "redact"
          ? (step.commits || []).length > 0
          : (step.focused_positions || []).length > 0 || Number(step.max_abs_shift || 0) > 0
      )
      .map(({ index }) => index);
  }

  function renderEventSelect() {
    const options = ['<option value="">Current step</option>'];
    for (const index of state.eventIndexes) {
      const step = state.steps[index];
      if (state.method === "redact") {
        const commit = (step.commits || [])[0];
        options.push(
          `<option value="${index}">${escapeHtml(
            `s${padStep(index)} · pos ${commit.response_position} · ` +
              `${visibleToken(commit.committed_token_text)} · ` +
              `ΔR ${formatSigned(commit.committed_delta_r)}`
          )}</option>`
        );
      } else {
        options.push(
          `<option value="${index}">${escapeHtml(
            `s${padStep(index)} · risk ${formatNum(step.risk_loss)} · |shift| ${formatNum(step.max_abs_shift)}`
          )}</option>`
        );
      }
    }
    el.eventSelect.innerHTML = options.join("");
  }

  function setStep(stepIndex, preferredDetailKey = null) {
    if (!state.steps.length) return;
    state.step = clamp(Math.round(stepIndex), 0, state.steps.length - 1);
    const step = state.steps[state.step];
    el.stepSlider.max = String(state.steps.length - 1);
    el.stepSlider.value = String(state.step);
    el.stepValue.textContent = padStep(state.step);
    el.prevStep.disabled = state.step === 0;
    el.nextStep.disabled = state.step === state.steps.length - 1;
    el.eventSelect.value = state.eventIndexes.includes(state.step) ? String(state.step) : "";

    if (state.method === "redact") {
      const commits = step.commits || [];
      state.selectedDetailKey =
        preferredDetailKey || commitKey(commits[0]) || state.selectedDetailKey;
      renderRedactStep(step);
    } else {
      const details = getFoDetails(step);
      const transferred = details.find((detail) => detail.transferred);
      state.selectedDetailKey =
        preferredDetailKey || detailKey(transferred || details[0]) || state.selectedDetailKey;
      renderFoStep(step);
    }
    renderTokenStream(step);
    updateCursors();
  }

  function renderRedactStep(step) {
    const commits = step.commits || [];
    const commit =
      commits.find((item) => commitKey(item) === state.selectedDetailKey) || commits[0];
    el.primaryMetricLabel.textContent = "Base state risk";
    el.primaryMetricValue.textContent = formatNum(step.base_state_risk);
    el.rhoValue.textContent = `${formatNum(step.rho)} / ${formatNum(step.weight)}`;
    el.secondaryMetricLabel.textContent = "Chosen exact ΔR";
    el.secondaryMetricValue.textContent = commit ? formatSigned(commit.committed_delta_r) : "n/a";
    el.stepStatus.innerHTML = [
      chip(`${commits.length} commit${commits.length === 1 ? "" : "s"}`),
      chip(commit?.gate_active ? "gate active" : commit?.gate_reason || "no audit", commit?.gate_active ? "accent" : ""),
      commit ? chip(`K=${commit.candidates.length}`) : "",
    ].join("");

    el.commitTitle.textContent = "Exact candidate audit";
    el.detailPickerLabel.textContent = "Commits this step";
    el.primaryTableTitle.textContent = "Top-K candidate audit";
    el.primaryTableDescription.textContent = "Raw base preference versus exact frozen-mask risk.";
    el.secondaryTableTitle.textContent = "Decision readout";
    el.secondaryTableDescription.textContent = "Why the committed token survived the re-pick.";

    renderRedactCommitSummary(step, commit);
    renderCommitPicker(commits, commit);
    renderRedactCandidateTable(step, commit);
    renderRedactDecision(step, commit);
  }

  function renderRedactCommitSummary(step, commit) {
    if (!commit) {
      renderEmptyCommit("No commit was recorded at this step.");
      return;
    }
    const chosen = commit.candidates.find((candidate) => candidate.chosen);
    el.selectedToken.textContent = tokenLabel({
      token_id: commit.committed_token_id,
      token_text: commit.committed_token_text,
    });
    el.selectedPosition.textContent = `response ${commit.response_position}`;
    el.selectedSourceLabel.textContent = "Decision";
    el.selectedSource.textContent = commit.chosen_by === "redact" ? "exact re-pick" : "base / gated";
    el.selectedMeasureLabel.textContent = "Exact ΔR";
    el.selectedMeasure.textContent = formatSigned(commit.committed_delta_r);
    el.commitBadges.innerHTML = [
      chip(commit.gate_active ? "active" : commit.gate_reason, commit.gate_active ? "accent" : ""),
      chip(`base rank ${chosen?.base_rank ?? "?"}`, chosen?.base_rank > 1 ? "safe" : ""),
      chosen?.base_rank > 1 ? chip("re-ranked", "safe") : chip("top-1 retained"),
    ].join("");
  }

  function renderCommitPicker(commits, selected) {
    el.detailPickerWrap.hidden = commits.length <= 1;
    el.detailPicker.innerHTML = commits
      .map((commit) => {
        const active = commitKey(commit) === commitKey(selected) ? " active" : "";
        return `<button type="button" class="detail-button${active}" data-detail-key="${escapeAttr(
          commitKey(commit)
        )}">pos ${commit.response_position} · ${escapeHtml(visibleToken(commit.committed_token_text))}</button>`;
      })
      .join("");
    attachDetailPicker(commits, "redact");
  }

  function renderRedactCandidateTable(step, commit) {
    if (!commit) {
      el.primaryTable.innerHTML = emptyTable("No candidate audit at this step.");
      return;
    }
    const rows = commit.candidates
      .map(
        (candidate) => `<tr class="${candidate.chosen ? "chosen" : ""}">
          <td class="num">${candidate.base_rank}</td>
          <td><span class="token-label">${escapeHtml(tokenLabel(candidate))}</span></td>
          <td class="num">${formatPercent(candidate.base_probability)}</td>
          <td class="num">${formatNum(candidate.base_logit)}</td>
          <td class="num ${deltaClass(candidate.delta_r)}">${formatSigned(candidate.delta_r)}</td>
          <td class="num">${formatNum(candidate.risk_after)}</td>
          <td>${candidate.chosen ? '<span class="choice-tag">picked</span>' : ""}</td>
        </tr>`
      )
      .join("");
    el.primaryTable.innerHTML = `<thead><tr>
      <th class="num">Base rank</th><th>Token</th><th class="num">Base p</th>
      <th class="num">Logit</th><th class="num">Exact ΔR</th><th class="num">R after</th><th>Policy</th>
    </tr></thead><tbody>${rows}</tbody>`;
  }

  function renderRedactDecision(step, commit) {
    if (!commit) {
      el.secondaryDetail.innerHTML = '<div class="empty-state">No decision to inspect.</div>';
      return;
    }
    const chosen = commit.candidates.find((candidate) => candidate.chosen);
    const bestRisk = Math.min(...commit.candidates.map((candidate) => candidate.delta_r));
    const maxAbs = Math.max(
      ...commit.candidates.map((candidate) => Math.abs(candidate.delta_r)),
      1e-9
    );
    let explanation;
    if (!commit.gate_active) {
      explanation =
        `The ${escapeHtml(commit.gate_reason)} gate kept the base decision. ` +
        "Candidate risks were logged for the audit but did not intervene.";
    } else if (chosen.base_rank > 1) {
      explanation =
        `Exact scoring moved the commit away from the base top-1 to rank ${chosen.base_rank}. ` +
        `The selected token changes risk by ${formatSigned(chosen.delta_r)}.`;
    } else {
      explanation =
        "The base model’s top-ranked shortlist token also won the exact-risk " +
        "re-pick. REDACT evaluated alternatives without forcing a change.";
    }
    const bars = commit.candidates
      .map((candidate) => {
        const width = Math.max(3, (Math.abs(candidate.delta_r) / maxAbs) * 100);
        return `<div class="candidate-bar ${candidate.delta_r > 0 ? "positive" : ""} ${candidate.chosen ? "chosen" : ""}">
          <span class="bar-label">#${candidate.base_rank} ${escapeHtml(visibleToken(candidate.token_text))}</span>
          <span class="bar-track"><i style="width:${width.toFixed(2)}%"></i></span>
          <span class="${deltaClass(candidate.delta_r)}">${formatSigned(candidate.delta_r)}</span>
        </div>`;
      })
      .join("");
    el.secondaryDetail.innerHTML = `<div class="decision-panel">
      <p>${explanation}</p>
      <div class="candidate-bars">${bars}</div>
      <div class="decision-stat-grid">
        <div><span>Base risk</span><strong>${formatNum(step.base_state_risk)}</strong></div>
        <div><span>Chosen risk</span><strong>${formatNum(chosen.risk_after)}</strong></div>
        <div><span>Lowest ΔR</span><strong>${formatSigned(bestRisk)}</strong></div>
        <div><span>Schedule weight</span><strong>${formatNum(step.weight)}</strong></div>
      </div>
    </div>`;
  }

  function renderFoStep(step) {
    const details = getFoDetails(step);
    const detail =
      details.find((item) => detailKey(item) === state.selectedDetailKey) || details[0];
    const transferred = (step.transferred_positions || [])[0];
    el.primaryMetricLabel.textContent = "Risk loss";
    el.primaryMetricValue.textContent = formatNum(step.risk_loss);
    el.rhoValue.textContent = `${formatNum(step.rho)} / ${formatNum(step.weight)}`;
    el.secondaryMetricLabel.textContent = "Max |logit shift|";
    el.secondaryMetricValue.textContent = formatNum(step.max_abs_shift);
    el.stepStatus.innerHTML = [
      chip(`${(step.transferred_positions || []).length} revealed`),
      chip(`${(step.position_shift_summary || []).length} shifted positions`, "accent"),
      chip(step.is_grad_step ? "gradient step" : "reused gradient"),
    ].join("");

    el.commitTitle.textContent = "Gradient transfer detail";
    el.detailPickerWrap.hidden = false;
    el.detailPickerLabel.textContent = "Recorded positions";
    el.primaryTableTitle.textContent = "Original vs shifted logits";
    el.primaryTableDescription.textContent = "The visible slice of the full-vocabulary shift.";
    el.secondaryTableTitle.textContent = "Largest gradient deltas";
    el.secondaryTableDescription.textContent = "Tokens most promoted or suppressed at this position.";

    if (transferred) {
      el.selectedToken.textContent = tokenLabel(transferred);
      el.selectedPosition.textContent = `response ${transferred.response_position}`;
      el.selectedSourceLabel.textContent = "Commit confidence";
      el.selectedSource.textContent = formatNum(transferred.confidence);
    } else {
      el.selectedToken.textContent = "none";
      el.selectedPosition.textContent = "none";
      el.selectedSourceLabel.textContent = "Commit confidence";
      el.selectedSource.textContent = "n/a";
    }
    el.selectedMeasureLabel.textContent = "Position max |shift|";
    el.selectedMeasure.textContent = detail ? formatNum(detail.max_abs_shift) : "n/a";
    el.commitBadges.innerHTML = [
      chip(step.is_grad_step ? "backward pass" : "cached gradient", "accent"),
      detail?.transferred ? chip("committed here", "safe") : "",
      detail ? chip(`pos ${detail.response_position}`) : "",
    ].join("");

    renderFoDetailPicker(step, details, detail);
    renderFoLogitTable(detail);
    renderFoShiftDetail(step, detail);
  }

  function renderFoDetailPicker(step, details, selected) {
    if (!details.length) {
      el.detailPicker.innerHTML = '<span class="empty-state">No detailed position was recorded.</span>';
      return;
    }
    el.detailPicker.innerHTML = details
      .map((detail) => {
        const active = detailKey(detail) === detailKey(selected) ? " active" : "";
        const kind = detail.transferred ? "commit" : "largest shift";
        return `<button type="button" class="detail-button${active}" data-detail-key="${escapeAttr(
          detailKey(detail)
        )}">pos ${detail.response_position} · ${kind}</button>`;
      })
      .join("");
    attachDetailPicker(details, "fo");
  }

  function attachDetailPicker(items, method) {
    for (const button of el.detailPicker.querySelectorAll("button[data-detail-key]")) {
      button.addEventListener("click", () => {
        state.selectedDetailKey = button.dataset.detailKey;
        if (method === "redact") renderRedactStep(state.steps[state.step]);
        else renderFoStep(state.steps[state.step]);
      });
    }
  }

  function renderFoLogitTable(detail) {
    if (!detail) {
      el.primaryTable.innerHTML = emptyTable("No position detail at this step.");
      return;
    }
    const base = indexEntries(detail.top_base_logits || [], "logit");
    const shifted = indexEntries(detail.top_shifted_logits || [], "logit");
    const ids = unique([
      ...(detail.top_base_logits || []).map((item) => item.token_id),
      ...(detail.top_shifted_logits || []).map((item) => item.token_id),
    ]).slice(0, 30);
    const rows = ids
      .map((id) => {
        const baseItem = base.get(String(id));
        const shiftedItem = shifted.get(String(id));
        const item = baseItem?.entry || shiftedItem?.entry || { token_id: id, token_text: "" };
        const delta = baseItem && shiftedItem ? shiftedItem.value - baseItem.value : null;
        return `<tr>
          <td><span class="token-label">${escapeHtml(tokenLabel(item))}</span></td>
          <td class="num">${baseItem ? formatNum(baseItem.value) : ""}</td>
          <td class="num">${shiftedItem ? formatNum(shiftedItem.value) : ""}</td>
          <td class="num ${deltaClass(delta)}">${delta === null ? "" : formatSigned(delta)}</td>
        </tr>`;
      })
      .join("");
    el.primaryTable.innerHTML = `<thead><tr>
      <th>Token</th><th class="num">Original</th><th class="num">Shifted</th><th class="num">Delta</th>
    </tr></thead><tbody>${rows}</tbody>`;
  }

  function renderFoShiftDetail(step, detail) {
    if (!detail) {
      el.secondaryDetail.innerHTML = '<div class="empty-state">No position detail at this step.</div>';
      return;
    }
    const shifts = [
      ...(detail.top_positive_shift || []).slice(0, 8),
      ...(detail.top_negative_shift || []).slice(0, 8),
    ];
    const maxAbs = Math.max(...shifts.map((item) => Math.abs(item.shift)), 1e-9);
    const bars = shifts
      .map((item) => {
        const width = Math.max(3, (Math.abs(item.shift) / maxAbs) * 100);
        return `<div class="candidate-bar ${item.shift > 0 ? "positive" : ""}">
          <span class="bar-label">${escapeHtml(visibleToken(item.token_text))} #${item.token_id}</span>
          <span class="bar-track"><i style="width:${width.toFixed(2)}%"></i></span>
          <span class="${deltaClass(item.shift)}">${formatSigned(item.shift)}</span>
        </div>`;
      })
      .join("");
    el.secondaryDetail.innerHTML = `<div class="decision-panel">
      <p>This is a dense vocabulary-space intervention. A larger shift is not itself evidence that the candidate’s exact risk decreased.</p>
      <div class="candidate-bars">${bars}</div>
      <div class="decision-stat-grid">
        <div><span>Risk loss</span><strong>${formatNum(step.risk_loss)}</strong></div>
        <div><span>Mean |shift|</span><strong>${formatNum(detail.mean_abs_shift)}</strong></div>
        <div><span>Max |shift|</span><strong>${formatNum(detail.max_abs_shift)}</strong></div>
        <div><span>Gradient</span><strong>${step.is_grad_step ? "fresh" : "reused"}</strong></div>
      </div>
    </div>`;
  }

  function renderEmptyCommit(message) {
    el.selectedToken.textContent = "none";
    el.selectedPosition.textContent = "none";
    el.selectedSource.textContent = "none";
    el.selectedMeasure.textContent = "n/a";
    el.commitBadges.innerHTML = "";
    el.primaryTable.innerHTML = emptyTable(message);
    el.secondaryDetail.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderTokenStream(step) {
    const genLength = Number(state.record.generation_config.gen_length);
    const blockLength = Number(state.record.generation_config.block_length || genLength);
    const currentBlock = Number(step.block_index || 0);
    const visibleUntil = Math.min(genLength, (currentBlock + 1) * blockLength);
    const tokensByPosition = new Map(
      state.generatedTokens.map((token) => [String(token.response_position), token])
    );
    const currentPositions = new Set(
      state.method === "redact"
        ? (step.commits || []).map((commit) => String(commit.response_position))
        : (step.transferred_positions || []).map((item) => String(item.response_position))
    );
    const affectedPositions = new Set(
      state.method === "fo"
        ? (step.position_shift_summary || []).map((item) => String(item.response_position))
        : []
    );

    const buttons = [];
    for (let position = 0; position < visibleUntil; position += 1) {
      const token = tokensByPosition.get(String(position));
      const revealed = token && Number(token.step) <= state.step;
      const classes = [
        "token",
        revealed ? "" : "mask",
        revealed && Number(token.step) === state.step ? "current" : "",
        affectedPositions.has(String(position)) ? "affected" : "",
        revealed && token.reranked ? "reranked" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label = revealed ? visibleToken(token.token_text) : "·";
      const title = revealed
        ? `position ${position}, step ${token.step}, token ${token.token_id}`
        : `position ${position}, masked`;
      buttons.push(
        `<button type="button" class="${classes}" data-position="${position}" data-reveal-step="${
          revealed ? token.step : state.step
        }" title="${escapeAttr(title)}">${escapeHtml(label)}</button>`
      );
    }
    el.tokenStream.innerHTML = buttons.join("");
    for (const button of el.tokenStream.querySelectorAll("button.token")) {
      button.addEventListener("click", () => {
        const position = Number(button.dataset.position);
        const revealStep = Number(button.dataset.revealStep);
        const token = tokensByPosition.get(String(position));
        const key =
          state.method === "redact"
            ? token?.detail_key
            : token
              ? `0:${Number(state.record.prompt_token_length || inferPromptTokenLength(state.generatedTokens)) + position}`
              : null;
        setStep(revealStep, key);
      });
    }

    const revealedCount = state.generatedTokens.filter((token) => token.step <= state.step).length;
    const numBlocks = Math.ceil(genLength / blockLength);
    el.generationSummary.textContent = `Block ${currentBlock + 1}/${numBlocks} · ${revealedCount}/${genLength} response tokens revealed`;
    el.promptText.textContent = state.record.prompt || "";
    el.finalGeneration.textContent = state.record.generation || "";
    el.tokenLegend.innerHTML = [
      legendItem("#cfd5ce", "revealed"),
      legendItem("var(--accent)", state.method === "redact" ? "current commit" : "shifted now"),
      state.method === "redact" ? legendItem("var(--safe)", "re-ranked token") : "",
    ].join("");
  }

  function buildGeneratedTokens(method, steps) {
    const tokens = [];
    for (const step of steps) {
      if (method === "redact") {
        for (const commit of step.commits || []) {
          const chosen = commit.candidates.find((candidate) => candidate.chosen);
          tokens.push({
            response_position: Number(commit.response_position),
            absolute_position: Number(commit.absolute_position),
            token_id: Number(commit.committed_token_id),
            token_text: commit.committed_token_text,
            step: Number(step.step),
            reranked: Number(chosen?.base_rank || 1) > 1,
            detail_key: commitKey(commit),
          });
        }
      } else {
        for (const item of step.transferred_positions || []) {
          tokens.push({ ...item, step: Number(step.step), reranked: false });
        }
      }
    }
    return tokens.sort((a, b) => a.response_position - b.response_position);
  }

  function renderMetricChart() {
    const width = 960;
    const height = 240;
    const left = 56;
    const right = 18;
    const laneHeight = 70;
    const lanes =
      state.method === "redact"
        ? [
            {
              label: "base risk",
              values: state.steps.map((step) => Number(step.base_state_risk || 0)),
              color: "#143d31",
              fill: "rgba(20,61,49,0.10)",
            },
            {
              label: "risk reduction −ΔR",
              values: state.steps.map((step) =>
                Math.max(0, -Number(step.commits?.[0]?.committed_delta_r || 0))
              ),
              color: "#e5633f",
              fill: "rgba(229,99,63,0.11)",
            },
          ]
        : [
            {
              label: "risk loss",
              values: state.steps.map((step) => Number(step.risk_loss || 0)),
              color: "#143d31",
              fill: "rgba(20,61,49,0.10)",
            },
            {
              label: "max |logit shift|",
              values: state.steps.map((step) => Number(step.max_abs_shift || 0)),
              color: "#5d68d8",
              fill: "rgba(93,104,216,0.11)",
            },
          ];
    const topPositions = [31, 137];
    const x = (index) =>
      left + (index / Math.max(state.steps.length - 1, 1)) * (width - left - right);
    const parts = [
      `<rect width="${width}" height="${height}" rx="13" fill="#fff"/>`,
      `<line x1="${left}" y1="119" x2="${width - right}" y2="119" stroke="#e4e7e1"/>`,
    ];
    lanes.forEach((lane, laneIndex) => {
      const top = topPositions[laneIndex];
      const maximum = Math.max(...lane.values, 1e-9);
      const bottom = top + laneHeight;
      const y = (value) => bottom - (value / maximum) * laneHeight;
      const points = lane.values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`);
      const area = `M ${x(0).toFixed(2)} ${bottom} L ${points.join(" L ")} L ${x(
        lane.values.length - 1
      ).toFixed(2)} ${bottom} Z`;
      for (let grid = 0; grid <= 4; grid += 1) {
        const gx = left + (grid / 4) * (width - left - right);
        parts.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${bottom}" stroke="#eef0ec"/>`);
      }
      parts.push(
        `<path d="${area}" fill="${lane.fill}"/>`,
        `<polyline points="${points.join(" ")}" fill="none" stroke="${lane.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`,
        `<text x="12" y="${top + 12}" fill="${lane.color}" font-size="12" font-family="ui-monospace,monospace">${escapeHtml(
          lane.label
        )}</text>`,
        `<text x="12" y="${top + 29}" fill="#7b877f" font-size="12" font-family="ui-monospace,monospace">max ${escapeHtml(
          formatNum(maximum)
        )}</text>`
      );
    });
    parts.push(
      `<line id="chartCursor" x1="${left}" y1="20" x2="${left}" y2="218" stroke="#17211d" stroke-width="1" stroke-dasharray="4 4"/>`,
      `<text x="${left}" y="232" fill="#8a958f" font-size="12" font-family="ui-monospace,monospace">0</text>`,
      `<text x="${width - right - 23}" y="232" fill="#8a958f" font-size="12" font-family="ui-monospace,monospace">255</text>`
    );
    el.metricChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    el.metricChart.dataset.left = String(left);
    el.metricChart.dataset.right = String(right);
    el.metricChart.dataset.width = String(width);
    el.metricChart.innerHTML = parts.join("");
  }

  function renderActivityMap() {
    const canvas = el.activityMap;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const genLength = Number(state.record.generation_config.gen_length);
    const cellWidth = width / Math.max(state.steps.length, 1);
    const cellHeight = height / genLength;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    for (let block = 0; block < 8; block += 1) {
      const x = (block / 8) * width;
      ctx.fillStyle = block % 2 ? "rgba(20,61,49,0.018)" : "rgba(229,99,63,0.012)";
      ctx.fillRect(x, 0, width / 8, height);
      ctx.strokeStyle = "rgba(20,61,49,0.11)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (state.method === "redact") {
      const reductions = state.steps.flatMap((step) =>
        (step.commits || []).map((commit) => Math.max(0, -Number(commit.committed_delta_r || 0)))
      );
      const maxReduction = Math.max(...reductions, 1e-9);
      for (const step of state.steps) {
        for (const commit of step.commits || []) {
          const chosen = commit.candidates.find((candidate) => candidate.chosen);
          const reduction = Math.max(0, -Number(commit.committed_delta_r || 0));
          const reranked = Number(chosen?.base_rank || 1) > 1;
          const x = Number(step.step) * cellWidth;
          const y = height - (Number(commit.response_position) + 1) * cellHeight;
          if (reranked) ctx.fillStyle = "rgba(229,99,63,0.96)";
          else if (reduction > 0) {
            const alpha = 0.35 + 0.65 * (reduction / maxReduction);
            ctx.fillStyle = `rgba(19,113,93,${alpha.toFixed(3)})`;
          } else ctx.fillStyle = "rgba(164,174,166,0.48)";
          ctx.fillRect(
            x,
            y,
            Math.max(1.6, cellWidth + 0.2),
            Math.max(1.2, cellHeight + 0.35)
          );
        }
      }
      el.mapStatus.innerHTML = `<div class="legend">
        ${legendItem("#e5633f", "non-top-1 re-pick")}
        ${legendItem("#13715d", "measured risk reduction")}
        ${legendItem("#a4aea6", "audited / ΔR = 0")}
      </div><span>${records.redact.summary.non_top1_picks} non-top-1 picks · ` +
        `${records.redact.summary.exact_decisions} exact decisions</span>`;
    } else {
      const values = state.steps.flatMap((step) =>
        (step.position_shift_summary || []).map((item) => Number(item.max_abs_shift || 0))
      );
      const maximum = Math.max(...values, 1e-9);
      for (const step of state.steps) {
        for (const item of step.position_shift_summary || []) {
          const intensity = Math.sqrt(Number(item.max_abs_shift || 0) / maximum);
          const x = Number(step.step) * cellWidth;
          const y = height - (Number(item.response_position) + 1) * cellHeight;
          ctx.fillStyle = `rgba(93,104,216,${(0.08 + 0.92 * intensity).toFixed(3)})`;
          ctx.fillRect(x, y, Math.max(1.5, cellWidth + 0.2), Math.max(1.2, cellHeight + 0.35));
        }
      }
      el.mapStatus.innerHTML = `<div class="legend">
        ${legendItem("rgba(93,104,216,.2)", "small shift")}
        ${legendItem("#5d68d8", "large shift")}
      </div><span>max |shift| ${formatNum(maximum)}</span>`;
    }
  }

  function updateCursors() {
    const width = Number(el.metricChart.dataset.width || 960);
    const left = Number(el.metricChart.dataset.left || 56);
    const right = Number(el.metricChart.dataset.right || 18);
    const x = left + (state.step / Math.max(state.steps.length - 1, 1)) * (width - left - right);
    const cursor = el.metricChart.querySelector("#chartCursor");
    if (cursor) {
      cursor.setAttribute("x1", String(x));
      cursor.setAttribute("x2", String(x));
    }

    renderActivityMap();
    const canvas = el.activityMap;
    const ctx = canvas.getContext("2d");
    const mapX = (state.step / Math.max(state.steps.length - 1, 1)) * canvas.width;
    ctx.strokeStyle = "#17211d";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX, 0);
    ctx.lineTo(mapX, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function jumpFromHorizontalEvent(event, target) {
    const rect = target.getBoundingClientRect();
    const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setStep(Math.round(fraction * (state.steps.length - 1)));
  }

  function renderMetadata() {
    const generation = state.record.generation_config || {};
    const control = state.record.control_config || {};
    el.generationConfig.textContent = [
      `steps=${generation.steps}`,
      `gen=${generation.gen_length}`,
      `block=${generation.block_length}`,
      `temperature=${generation.temperature}`,
    ].join(" · ");
    el.controlConfig.textContent =
      state.method === "redact"
        ? [
            "method=redact",
            `K=${control.exact_dr_topk}`,
            `eta=${formatCompact(control.eta)}`,
            `head=${control.risk_model_type}`,
          ].join(" · ")
        : [
            "method=redact_fo",
            `eta=${formatCompact(control.eta)}`,
            `margin=${control.safety_margin}`,
            `grad_every_k=${control.grad_every_k}`,
          ].join(" · ");
    el.recordConfig.textContent = [
      `schema=${state.record.record_schema_version || "?"}`,
      state.record.record_kind,
      formatBytes(JSON.stringify(state.record).length),
    ].join(" · ");
  }

  function togglePlayback() {
    if (state.timer) {
      stopPlayback();
      return;
    }
    if (state.step >= state.steps.length - 1) setStep(0);
    el.playSteps.innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause';
    el.playSteps.setAttribute("aria-label", "Pause trace");
    state.timer = window.setInterval(() => {
      if (state.step >= state.steps.length - 1) stopPlayback();
      else setStep(state.step + 1);
    }, 110);
  }

  function stopPlayback() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    if (el.playSteps) {
      el.playSteps.innerHTML = '<span aria-hidden="true">▶</span> Play';
      el.playSteps.setAttribute("aria-label", "Play trace");
    }
  }

  function getFoDetails(step) {
    return (step.focused_positions || []).slice().sort((a, b) => {
      const transferDifference = Number(Boolean(b.transferred)) - Number(Boolean(a.transferred));
      return transferDifference || Number(b.max_abs_shift || 0) - Number(a.max_abs_shift || 0);
    });
  }

  function indexEntries(entries, valueKey) {
    const result = new Map();
    for (const entry of entries || []) {
      result.set(String(entry.token_id), { entry, value: Number(entry[valueKey]) });
    }
    return result;
  }

  function detailKey(detail) {
    if (!detail) return null;
    return `${detail.batch_index || 0}:${detail.absolute_position}`;
  }

  function commitKey(commit) {
    if (!commit) return null;
    return `${commit.commit_order || 0}:${commit.absolute_position}`;
  }

  function inferPromptTokenLength(tokens) {
    if (!tokens.length) return 0;
    return Number(tokens[0].absolute_position) - Number(tokens[0].response_position);
  }

  function tokenLabel(entry) {
    const text = visibleToken(entry?.token_text);
    const tokenId = entry?.token_id ?? "?";
    return `${text || "<empty>"} #${tokenId}`;
  }

  function visibleToken(value) {
    const text = String(value ?? "");
    if (text === "") return "∅";
    return text.replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/ /g, "␠");
  }

  function chip(text, variant = "") {
    return text
      ? `<span class="chip${variant ? ` ${variant}` : ""}">${escapeHtml(text)}</span>`
      : "";
  }

  function legendItem(color, text) {
    return `<span class="legend-item"><i style="background:${color}"></i>${escapeHtml(text)}</span>`;
  }

  function emptyTable(text) {
    return `<tbody><tr><td><div class="empty-state">${escapeHtml(text)}</div></td></tr></tbody>`;
  }

  function unique(values) {
    return [...new Set(values.map(String))];
  }

  function padStep(value) {
    return String(value).padStart(3, "0");
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function formatNum(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
    const number = Number(value);
    if (number === 0) return "0";
    if (Math.abs(number) >= 1000 || Math.abs(number) < 0.0001) return number.toExponential(2);
    if (Math.abs(number) >= 100) return number.toFixed(1);
    if (Math.abs(number) >= 10) return number.toFixed(2);
    if (Math.abs(number) >= 1) return number.toFixed(3);
    return number.toFixed(5);
  }

  function formatSigned(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
    const number = Number(value);
    return `${number > 0 ? "+" : ""}${formatNum(number)}`;
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
    const percent = Number(value) * 100;
    if (percent >= 10) return `${percent.toFixed(1)}%`;
    if (percent >= 1) return `${percent.toFixed(2)}%`;
    if (percent >= 0.01) return `${percent.toFixed(3)}%`;
    return `${percent.toFixed(4)}%`;
  }

  function formatCompact(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    if (number >= 1e6) return number.toExponential(0);
    return String(number);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function deltaClass(value) {
    if (value === null || value === undefined) return "";
    return Number(value) <= 0 ? "delta-good" : "delta-bad";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
