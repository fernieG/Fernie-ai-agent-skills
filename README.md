# Fernie AI Agent Skills

**An autonomous, outcome-driven delivery organisation made of collaborating AI agents.** The Program Manager owns problems end to end: specialists ask one another for the missing expertise, produce actual solutions, independently verify results and involve humans only when accountable judgment or authorisation is genuinely needed.

**Mission:** Solve problems, don't just report, assign, or escalate them. A handoff, meeting, recommendation, or green status report is not evidence that an issue was fixed.

Reusable, provider-neutral AI skills and operating contracts for product, transformation, analysis and software delivery. Real model-backed specialist agents and authorised external execution remain future integrations.

## Principles

- Keep skills generic and reusable.
- Keep company-, client-, project-, and application-specific knowledge in private repositories or private knowledge bases.
- Separate agent behaviour from source-of-truth documentation.
- Prefer traceable answers over unsupported inference.
- Preserve decisions, change history, and document versions.
- Never silently convert assumptions into approved requirements.
- **Automate reversible, low-impact local work; reserve consequential approvals for accountable humans.**
- **Every agent owns a deliverable, and may ask another specialist agent for help without routing through a human.**
- **The PM owns verified resolution, not the number of actions or meetings.**

## Repository structure

    skills/
      business-analysis/SKILL.md
      program-management/
        SKILL.md
        assessor.mjs
        example-project.json
        tests/assessor.test.mjs
      agent-collaboration/
        SKILL.md
        coordinator.mjs
        examples/demo.mjs
        examples/mycycle-prediction.mjs
        tests/
    templates/
      decision-log.md
      change-log.md
      traceability-matrix.md
      requirement-record.md
      project-decision-rights.md

## Available skills

### Senior Business Analyst / MOA

`skills/business-analysis/SKILL.md`

A reusable operating model for an AI Business Analyst / MOA agent that can:

- interrogate requirements;
- identify and explain business rules;
- challenge ambiguity and missing cases;
- detect contradictions;
- maintain source traceability;
- analyse impacts;
- derive acceptance criteria and functional tests;
- progressively maintain functional documentation;
- preserve decision, change, and version history;
- identify accountability gaps.

The skill is intentionally domain-neutral. Application-specific specifications, data dictionaries, examples, internal processes, and business rules should be supplied separately as private context.

### Program Manager / Delivery Challenger — v0.2 policy, v0.1 assessor

`skills/program-management/SKILL.md`

An evidence-first PM that **coordinates specialists to solve blockers rather than merely reporting them**. It automatically prepares delivery diagnostics and source-linked follow-ups, attempts permitted local solutions, demands independent acceptance evidence, and reserves changes to baselines, budgets, scope, approvals and external commitments for accountable humans.

A dependency-free Node assessor and synthetic fixture are included. They are **not** an LLM agent or an integrated external action service.

Try it:

    node skills/program-management/assessor.mjs skills/program-management/example-project.json
    node --test skills/program-management/tests/assessor.test.mjs

See `skills/program-management/README.md` for the input contract and safety limits.


### Agent-to-Agent Resolution — v0.1 experimental

`skills/agent-collaboration/SKILL.md`

The PM asks a specialist for a concrete deliverable; that specialist can request another specialist directly. The coordinator validates source-linked artifacts, prevents endless ping-pong, and rejects unverified completion claims.

**Proofs of concept (synthetic data only):**

    node skills/agent-collaboration/examples/demo.mjs
    node skills/agent-collaboration/examples/mycycle-prediction.mjs
    node --test skills/agent-collaboration/tests/*.test.mjs

The MyCycle scenario demonstrates PM → data validation → prediction → QA, returning a calendar-only next-period estimate and independently checked result. It does not access anyone's private history or run model-backed agents. No client/medical data is committed here.

## Experimental work in separate pull requests

The C# Agent Graph Orchestrator (PR #1) and browser-based Workload & Data Governance MVP (PR #2) have not been merged to main. They are not integrated into the Program Manager Skill in this release.

## Versioning

Skills use semantic versions:

- `0.x`: evolving draft skill
- `1.0.0`: first stable baseline
- patch: clarification with no intended behavioural change
- minor: new backward-compatible capability
- major: material change to agent behaviour or output contract

Each skill should carry its own version and changelog section.
