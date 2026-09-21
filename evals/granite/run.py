import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openai import OpenAI

from .cases import CASES
from .evaluator import ModelReply, SUITE_NAME, TOOL_NAMES, run_case, summarize

ANSWER_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "operational_answer",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "finding": {"type": "string"},
                "uncertainty": {"type": "string"},
                "next_step": {"type": "string"},
                "evidence_ids": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["finding", "uncertainty", "next_step", "evidence_ids"],
            "additionalProperties": False,
        },
    },
}


def text_tool_calls(content: str | None) -> list[dict[str, Any]]:
    """Normalize Granite's JSON-in-text tool calls when a server does not parse them."""
    if not content:
        return []
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        return []
    items = value if isinstance(value, list) else [value]
    if not items or not all(isinstance(item, dict) for item in items):
        return []
    calls = []
    for index, item in enumerate(items):
        name = item.get("name") or item.get("type")
        arguments = item.get("arguments")
        if name not in TOOL_NAMES or not isinstance(arguments, dict):
            return []
        calls.append({"id": f"granite-text-call-{index}", "name": name, "arguments": arguments})
    return calls


def completion_adapter(client: OpenAI, model: str):
    def complete(messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> ModelReply:
        first_tool_turn = not any(message.get("role") == "tool" for message in messages)
        options: dict[str, Any] = dict(
            model=model,
            messages=messages,
            temperature=0,
            max_tokens=500,
        )
        if tools:
            options.update(tools=tools, parallel_tool_calls=False, tool_choice="required" if first_tool_turn else "auto")
        else:
            options["response_format"] = ANSWER_RESPONSE_FORMAT
        response = client.chat.completions.create(**options)
        message = response.choices[0].message
        calls = []
        for call in message.tool_calls or []:
            try:
                arguments = json.loads(call.function.arguments)
            except json.JSONDecodeError:
                arguments = {"_invalid_json": call.function.arguments}
            calls.append({"id": call.id, "name": call.function.name, "arguments": arguments})
        if not calls:
            calls = text_tool_calls(message.content)
            for index, call in enumerate(calls):
                call["id"] = f"granite-text-call-{len(messages)}-{index}"
        return ModelReply(text=message.content, tool_calls=calls)

    return complete


def validate_cases() -> list[str]:
    errors: list[str] = []
    ids = [case.get("id") for case in CASES]
    if len(CASES) != 30:
        errors.append(f"expected 30 cases, found {len(CASES)}")
    if len(ids) != len(set(ids)):
        errors.append("case IDs are not unique")
    required = {"id", "category", "question", "tool_outputs", "expected"}
    for index, case in enumerate(CASES):
        missing = required - set(case)
        if missing:
            errors.append(f"case {index} is missing {sorted(missing)}")
        expected = case.get("expected", {})
        if not set(expected.get("required_tools", [])) <= set(case.get("tool_outputs", {})):
            errors.append(f"{case.get('id')} requires a tool without frozen output")
    return errors


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the fixed Agentwin Granite evaluation")
    parser.add_argument("--base-url", default=os.getenv("GRANITE_BASE_URL", "http://127.0.0.1:11434/v1"))
    parser.add_argument("--api-key", default=os.getenv("GRANITE_API_KEY", "local"))
    parser.add_argument("--model", default=os.getenv("GRANITE_MODEL", "granite3.3:2b"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/granite-eval-report.json"))
    parser.add_argument("--case", action="append", dest="case_ids", help="Run only a case ID; repeatable")
    parser.add_argument(
        "--tool-policy",
        choices=("all", "case-allowlist", "deterministic-context"),
        default="all",
        help="Expose every tool or only the task's controller allowlist",
    )
    parser.add_argument("--validate-only", action="store_true", help="Validate the frozen suite without calling a model")
    args = parser.parse_args()

    errors = validate_cases()
    if errors:
        report = {"suite": SUITE_NAME, "status": "INVALID", "errors": errors}
        write_report(args.output, report)
        print(json.dumps(report, indent=2))
        return 2

    selected = [case for case in CASES if not args.case_ids or case["id"] in args.case_ids]
    if args.case_ids and len(selected) != len(set(args.case_ids)):
        unknown = sorted(set(args.case_ids) - {case["id"] for case in selected})
        print(f"Unknown case IDs: {', '.join(unknown)}", file=sys.stderr)
        return 2

    if args.validate_only:
        report = {
            "suite": SUITE_NAME,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "NOT_RUN",
            "suite_validation": "PASS",
            "cases": len(selected),
            "model": args.model,
            "tool_policy": args.tool_policy,
            "reason": "Model inference was not requested; this result validates only the fixed cases and evaluator configuration.",
        }
        write_report(args.output, report)
        print(json.dumps(report, indent=2))
        return 0

    client = OpenAI(base_url=args.base_url, api_key=args.api_key, timeout=30, max_retries=0)
    complete = completion_adapter(client, args.model)
    results = []
    for index, case_data in enumerate(selected, 1):
        print(f"[{index}/{len(selected)}] {case_data['id']}", flush=True)
        results.append(run_case(
            case_data,
            complete,
            restrict_tools=args.tool_policy == "case-allowlist",
            deterministic_context=args.tool_policy == "deterministic-context",
        ))
    report = summarize(args.model, results)
    report["generated_at"] = datetime.now(timezone.utc).isoformat()
    report["base_url"] = args.base_url
    report["tool_policy"] = args.tool_policy
    write_report(args.output, report)
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
