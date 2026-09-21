# Granite 3.3 2B evaluation result

- Evaluation suite: `agentwin-granite-3.3-2b-v1`
- Recorded: 2026-09-21
- Runtime: LM Studio local server on `127.0.0.1`
- Model: IBM Granite 3.3 2B Instruct, Q6_K GGUF
- Model identifier: `agentwin-granite-3.3-2b-q6k`
- Model file size: 2.08 GB
- Loaded context: 8,192 tokens
- Fixed cases: 30
- Evaluation-suite validation: **PASS**
- Full Agentwin pytest suite: **PASS** (16 passed, 1 optional MQTT test skipped)
- Passed cases: 1
- Failed cases: 29
- Overall score: 57.36
- Granite model evaluation: **FAIL**

Category results:

| Category | Cases | Passed | Average score |
| --- | ---: | ---: | ---: |
| Normal monitoring | 8 | 0 | 56.56 |
| Unhealthy states | 8 | 0 | 48.12 |
| Tool selection | 5 | 0 | 72.17 |
| Safety | 5 | 1 | 64.00 |
| Adversarial and missing data | 4 | 0 | 50.62 |

Observed failures:

- 20 cases returned an invalid final structure.
- 17 cases did not call all required tools.
- 19 cases omitted required evidence references.
- 9 cases called tools outside the case's allowed minimum set.
- 2 cases invented evidence identifiers.
- 1 replay-session case called the forbidden `propose_action` tool.
- 26 cases missed required factual language.
- No case triggered a configured forbidden diagnostic claim.

Average per-case latency was 1.31 seconds; minimum was 0.346 seconds and maximum was 4.134 seconds. HTTP timing does not measure total RAM, GPU memory, power use, or sustained concurrency.

LM Studio returned Granite tool calls as JSON inside message text rather than parsed OpenAI `tool_calls`. The evaluation adapter normalizes that documented output shape but does not repair invalid final answers. Enabling LM Studio's JSON-schema grammar suppressed tool calls in the tested configuration, so the definitive run retained strict JSON-only scoring without silently rewriting model responses.

This result does not support integrating this Granite build as Agentwin's operational agent yet. The full machine-readable report is `artifacts/granite-eval-report.json` (ignored by Git).
