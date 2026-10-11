# Program Manager Skill v0.1

An evidence-first delivery challenger with **bounded operational autonomy**. This is a generic public prototype; it contains synthetic records only.

## What runs without asking a person

The assessor checks whether project records are structurally valid, flags overdue and blocked work, missing owners and dates, unfinished predecessor dependencies, unverified completion claims, and mitigation gaps. It automatically produces:

- derived RED / AMBER / GREEN status with explicit rule evidence;
- a sorted finding register with stable IDs;
- source-linked local follow-up drafts;
- a separated log of locally safe operational decisions versus consequential decisions requiring human approval.

For routine local work it doesn't need a user to choose a severity, template, ordering, or next diagnostic check.

## Run it

Requires Node 20 or higher; no packages or credentials needed.

    node skills/program-management/assessor.mjs skills/program-management/example-project.json

Optional explicit assessment date:

    node skills/program-management/assessor.mjs skills/program-management/example-project.json 2026-10-11

Save a report:

    node skills/program-management/assessor.mjs skills/program-management/example-project.json > report.json

Run automated tests:

    node --test skills/program-management/tests/assessor.test.mjs

The demo intentionally produces RED because a critical task is overdue; it prepares follow-ups without changing any project record.

## Input contract (v0.1)

The JSON root includes a project name and explicit as-of date. Collections may be empty.

| Field | Required | Notes |
| --- | --- | --- |
| name | yes | Name of the project |
| asOf | yes, unless passed via CLI | Real date in YYYY-MM-DD |
| milestones, tasks | optional arrays | Each requires unique id and one of not_started, in_progress, blocked, done |
| item.owner | optional | Missing owner is a finding, never auto-assigned |
| item.due | optional | YYYY-MM-DD; missing date is reported |
| item.dependsOn | optional array | All referenced IDs must be existing milestone/task IDs; cycles rejected |
| item.priority | optional | critical / high / normal / low |
| item.evidence | optional array | Needed to substantiate done status |
| risks | optional array | Each needs unique id and status open / closed; mitigation, owner, mitigationDue optional |
| decisionRequests | optional array | Each needs unique id, kind and sourceIds with existing source identifiers |

To qualify for an automatic **local-only** decision, all must hold:

- kind is draft_followup, triage_risk, draft_status or internal_priority;
- impact="low", reversible=true, externalEffect=false;
- changesBaseline=false, protectedDomain=false, budgetDelta=0;
- all sourceIds identify real project records.

Any missing assurance, unknown kind, or protected decision is queued for a human. The fields are a contract for classifying local proposals, *not* identity proof or authorization for external actions.

## Scope and limits

- Pure, read-only deterministic evaluation. No LLM, network calls, persistence, notifications, external issue creation, or automated message sending.
- No claim of a calculated critical path: the minimal input lacks effort, duration, calendar and resource constraints.
- The status indicator is an algorithmic diagnostic, not an approved status or a guaranteed forecast.
- Dates and owners are never invented. Structured source IDs supply traceability to records, not verification that the records are true.
- For confidential enterprise work, keep data in approved private systems; do not commit employer/client data to this public repository.

## Next increment

Connect this assessor as a deterministic node in the separate C# Agent Graph Orchestrator, add a source/versioned project adapter, then support optional explicitly authorized creation of internal tracking tasks. Keep human approval for changes to scope, baselines, budget, accountability, releases and protected controls.
