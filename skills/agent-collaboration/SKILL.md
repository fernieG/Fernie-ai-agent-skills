---
name: agent-to-agent-resolution
version: 0.1.0
description: A PM-led agent collaboration protocol: specialists delegate to the right specialist, deliver and verify solutions, and escalate only non-automatable decisions.
status: experimental
---

# Agent-to-Agent Resolution — PM-led

## Objective

**Solve the problem, not merely record or route it.** The Program Manager owns the outcome and coordinates specialists that can act on it. Specialists ask one another for *specific deliverables*, not opinions or meeting attendance. When one agent needs another agent's expertise, it hands off a structured request, automatically. Human intervention is the exception, not the workflow.

This is a companion to `../program-management/SKILL.md`. The published PM v0.1 remains unchanged. The workflow below requires an agent runtime to load the relevant skills and to register/expose available specialist agents. Linking a GitHub Markdown file by itself cannot create collaborating live agents.

## Runbook: close the solution loop

1. **PM defines the outcome:** produce a concrete, independently testable acceptance criterion and attach the source evidence/version. Identify which source is authoritative and what permissions are available. Never invent an approved requirement.
2. **PM chooses the best first specialist:** delegate work with a clear question, expected artifact and acceptance test. Do not ask the human to pick an agent.
3. **Specialist works, then asks another specialist as needed:** an analyst can ask architecture about feasibility; architecture can ask implementation about a concrete patch; testing can ask analysis for an expected outcome. Specialists must return actual artifacts/evidence or a narrow reason the task is impossible. Avoid circular requests and handoff theatre.
4. **PM enforces progress:** accumulate source-linked artifacts, reject vague answers, and bound attempts. If the first approach fails, try one supported alternative before escalating. Do not mask uncertain or blocked work as delivered.
5. **Verify outcome independently:** run a deterministic test, acceptance criteria, contract check or independent review. A specialist's claim of "done" is not proof. Record actual output and results.
6. **Close only what is demonstrably solved:** mark an in-memory documentation or test-coverage objective resolved locally when the artifact exists and passes its test. A production deployment, changed business rule, contractual milestone, or stakeholder approval cannot be declared resolved until authoritative confirmation.
7. **Ask a human only for an irreducible decision:** approved budget/scope/baseline, accountable ownership, data access, production release, legal/regulatory exceptions, unresolved value trade-offs or absent factual authority. Present the recommended option, supporting work already done, consequence of inaction and the exact decision required.

## Internal delegation contract

Each request between agents must carry:

- **Issue ID and objective:** what outcome needs to exist, not just a task title.
- **Evidence:** source IDs, version, facts and whether they are validated.
- **Requested specialist / capability:** choose the smallest suitable expert.
- **Concrete work product:** patch, test suite, reconciled requirement, analysis or solution options.
- **Acceptance criteria:** how the PM/independent verifier can determine completion.
- **Constraints:** permitted write scope, data access, security, deadlines, external-effect and budget restrictions.
- **Response:** artifact and its evidence IDs, a typed handoff to another specialist, a human decision request, or a precise unresolved blocker.

Never send internal confidential information to an agent not authorised for that information. Respect the user's source restrictions, and avoid sharing unnecessary data in agent-to-agent requests.

## Behavioral rule: collaboration is not a status meeting

**Bad:** PM detects a missing test; tells human "Testing team needs to write tests"; schedules another review; reports it as amber.

**Good:** PM delegates to the Business Analysis agent to anchor the rule; Business Analysis asks the Test agent to write boundary cases; Testing asks QA to review; PM verifies them and returns test artifacts. No human decision is necessary for a synthetic or already approved, local-only test artifact.

**Necessary human escalation:** if the only way to proceed changes an approved threshold, crosses a data-access restriction, spends money, changes delivery commitments or publishes to production, prepare a recommendation but do not make the protected decision.

## Autonomy / authority

- Default to automated reading, analysis, locally reversible drafting, test generation and permitted verification.
- Avoid humans for agent selection, intermediate information requests, internal retries, documentation structure and issue-triage labels.
- Do not treat "human in the loop" as mandatory for every step; it is a targeted control for *consequential* decisions.
- Avoid automation bias: no invented proofs, unsupported claims, silent scope changes, or hidden assumptions.
- Prevent endless ping-pong with bounded iterations and outcome checks.
- A genuinely blocked external dependency remains blocked, even if a perfect email or plan has been drafted.

## Executable proof-of-concept

`coordinator.mjs` implements a provider-neutral **in-memory** specialist handoff mechanism with bounded loops and an independent verification gate.

`examples/demo.mjs` demonstrates a PM asking BA for rule interpretation, BA asking Test Engineering for cases, Testing asking QA for review, and a deterministic independent verifier checking the real output. All facts are synthetic. This solves the **local missing-test-artifact objective**, not a real organisation's delivery issue.

Run:

    node skills/agent-collaboration/examples/demo.mjs
    node --test skills/agent-collaboration/tests/coordinator.test.mjs

Outputs have explicit statuses:

- `resolved_local`: a local-only concrete artifact exists and passes an independent acceptance check; no external mutation.
- `ready_for_human`: the proposal or artifact passes a test but requires a protected decision or its authority is unknown.
- `human_decision_required`: a specialist cannot proceed without an authorised decision.
- `unresolved`: a claim failed verification, evidence was invalid, a specialist was missing, an execution failed or bounded retries were exhausted.

The coordinator uses ordinary deterministic JS functions as mock agents and **does not** call an LLM, send requests, update GitHub or alter a project baseline. The existing C# orchestrator PR is a separate future integration. An actual multi-agent service must implement authenticated agent adapters, source-version controls, verified tool permissions, durable state and logging before it can safely perform real-world fixes.

## Future integration objective

Use the C# graph runner for state transitions and gates; plug provider-specific or LLM specialists into registered nodes. Add source-backed project adapters and deliberately scoped tools that can apply low-impact changes, then verify real downstream effects. Separate the roles of **proposal**, **execution**, **verification**, and **approval** in the audit trail.

## Version history

- 0.1.0 (2026-10-11): PM-led delegation policy, deterministic multi-specialist local demo, bounded loops and independent verification.
