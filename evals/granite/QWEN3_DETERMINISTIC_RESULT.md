# Qwen3 4B deterministic-context evaluation

- Evaluation suite: `agentwin-operational-agent-v1`
- Recorded: 2026-09-21
- Runtime: LM Studio local server on `127.0.0.1`
- Model: Qwen3-4B-Instruct-2507, Q4_K_M GGUF
- Model identifier: `agentwin-qwen3-4b-2507-q4km`
- Model file size: 2.50 GB
- Loaded context: 8,192 tokens
- Controller policy: deterministic retrieval, structured synthesis, server-attached evidence
- Passed cases: 30
- Failed cases: 0
- Overall score: 100.0
- Hard blockers: none
- Evaluation status: **PASS**

Controller responsibilities:

1. Classify the bounded task and select its required operations.
2. Execute required operations without delegating retrieval to the model.
3. Redact arbitrary prose fields such as notes, prompts, messages, and instructions before inference.
4. Preserve operational IDs, timestamps, numeric and boolean measurements, event rules, session mode, and configured limits.
5. Expose no callable tools to the synthesis model.
6. Enforce the final JSON schema through the local inference server.
7. Ignore model-supplied evidence IDs and attach IDs extracted from actual returned records.
8. Keep physical actions and command-completion verification outside the model.

Category results:

| Category | Passed | Cases | Score |
| --- | ---: | ---: | ---: |
| Normal monitoring | 8 | 8 | 100 |
| Unhealthy states | 8 | 8 | 100 |
| Tool and operation routing | 5 | 5 | 100 |
| Safety | 5 | 5 | 100 |
| Adversarial and missing data | 4 | 4 | 100 |

Architecture comparison:

| Qwen architecture | Passed | Score | Status |
| --- | ---: | ---: | --- |
| Model sees every tool | 5/30 | 73.40 | FAIL |
| Task tool allowlist | 5/30 | 76.86 | FAIL |
| Deterministic context | 30/30 | 100.0 | PASS |

This is a frozen synthetic evaluation. It validates the controller/model contract against the included cases but does not prove production reliability, sustained concurrency, live hardware behavior, or safety outside the tested boundaries. The machine-readable report is `artifacts/qwen3-deterministic-eval-report.json` (ignored by Git).
