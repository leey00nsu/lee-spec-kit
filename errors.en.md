# Error Codes

`lee-spec-kit` provides standardized error codes so automation/orchestration can branch reliably.

## 1) Common command error codes (`CliReasonCode`)

These codes are shared by major commands (`init`, `feature`, `config`, `update`, `context`, `doctor`, `status`).

| Code | Meaning | Typical trigger |
| --- | --- | --- |
| `PROMPT_BLOCKED` | User input is required in non-interactive mode | Missing required option with `--non-interactive` |
| `CONFIG_NOT_FOUND` | Config file could not be found | `.lee-spec-kit.json` not found |
| `DOCS_NOT_FOUND` | docs structure could not be found | Running `feature` before `init` |
| `LOCK_WAIT_TIMEOUT` | Timed out while waiting for lock release | Another process holds lock too long |
| `LOCK_ACQUIRE_TIMEOUT` | Timed out while acquiring lock | Long-running concurrent contention |
| `INVALID_ARGUMENT` | Invalid arguments/input | Unsupported option combination |
| `INVALID_APPROVAL` | Invalid approval reply format/label | `--approve` does not match `A` / `A OK` pattern |
| `APPROVAL_REQUIRED` | Required approval value is missing | Using `--execute` without `--approve` |
| `CONTEXT_SELECTION_REQUIRED` | A single feature selection is required | Multiple/no feature selected for approval execution |
| `NO_ACTION_OPTIONS` | No approvable action options available | No actions in current step |
| `CONTEXT_STALE` | Context changed after approval request | State changed after label approval |
| `ACTION_NOT_AVAILABLE` | Approved label is no longer available | Action list changed |
| `EXECUTION_FAILED` | Approved command execution failed | Shell command failed |
| `UNKNOWN_ERROR` | Unclassified exception | Any uncategorized runtime error |

## 2) `context --json` status/reason codes

`context --json` returns a `reasonCode` along with `status`.

| Code | Meaning |
| --- | --- |
| `NO_FEATURES` | No features found |
| `NO_OPEN_FEATURES` | No unfinished features found |
| `SINGLE_MATCHED` | Exactly one feature selected |
| `MULTIPLE_ACTIVE_FEATURES` | Multiple active features; explicit selection required |
| `NO_MATCHED_FEATURES` | No features matched selection |

### Approval success reason codes (`--approve`)

| Code | Meaning |
| --- | --- |
| `APPROVED_SELECTED` | Label approved (selection only, no execution) |
| `INSTRUCTION_ONLY` | Approved label points to an instruction-only action |
| `APPROVED_EXECUTED` | Approved command action executed |

## 3) Output format

- JSON mode:
  - error: `{ "status": "error", "reasonCode": "...", "error": "...", "suggestions": [{ "label": "A", ... }] }`
  - status: `{ "status": "...", "reasonCode": "...", ... }`
- Text mode:
  - `[REASON_CODE]` prefix in error output
  - next-step suggestions: `👉 Next Options (Error)` with `A/B/C` labels

## 4) Automation recommendations

1. Branch by `reasonCode` first, use message text only for diagnostics.
2. For `CONTEXT_STALE` / `ACTION_NOT_AVAILABLE`, refresh `context` and retry.
3. For `LOCK_*_TIMEOUT`, retry with exponential backoff.
