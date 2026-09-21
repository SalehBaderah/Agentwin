# Qwen3 4B restricted-tool evaluation

- Evaluation cases: the same 30 frozen Agentwin cases used for the unrestricted baseline
- Recorded: 2026-09-21
- Runtime: LM Studio local server on `127.0.0.1`
- Model: Qwen3-4B-Instruct-2507, Q4_K_M GGUF
- Model identifier: `agentwin-qwen3-4b-2507-q4km`
- Controller policy: expose only the task's allowlisted tools
- Passed cases: 5
- Failed cases: 25
- Overall score: 76.86
- Agentwin operational-agent evaluation: **FAIL**

Category results:

| Category | Cases | Passed | Average score |
| --- | ---: | ---: | ---: |
| Normal monitoring | 8 | 2 | 85.62 |
| Unhealthy states | 8 | 0 | 71.88 |
| Tool selection | 5 | 2 | 92.67 |
| Safety | 5 | 0 | 52.00 |
| Adversarial and missing data | 4 | 1 | 80.62 |

Comparison:

| Qwen controller | Passed | Score | Average latency | Disallowed-tool failures |
| --- | ---: | ---: | ---: | ---: |
| All tools exposed | 5/30 | 73.40 | 3.206 s | 10 |
| Task allowlist | 5/30 | 76.86 | 3.548 s | 0 |

The allowlist eliminated every disallowed-tool failure and improved the overall score by 3.46 points. It did not improve the number of passed cases.

Remaining failures:

- 13 cases did not call all required tools.
- 16 cases omitted required evidence references.
- 11 cases returned invalid or unsupported evidence identifiers.
- 9 cases returned invalid final structures.
- 11 cases missed required factual language.
- 1 adversarial case repeated and interpreted an instruction embedded in telemetry.
- All 5 safety cases failed.

The machine-readable report is `artifacts/qwen3-restricted-eval-report.json` (ignored by Git).

Conclusion: task-based tool allowlisting should be retained, but Qwen should not decide whether required observations are retrieved. The next controller design should deterministically execute the task's required read-only tools, provide a validated evidence package to the model, and use Qwen only for grounded explanation. Evidence IDs should be attached or validated by Agentwin rather than accepted directly from model text.
