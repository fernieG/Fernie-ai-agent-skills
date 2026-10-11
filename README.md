# Fernie AI Agent Skills

Reusable skills and operating models for AI agents supporting product, transformation, analysis, and delivery work.

## Principles

- Keep skills generic and reusable.
- Keep company-, client-, project-, and application-specific knowledge in private repositories or private knowledge bases.
- Separate agent behaviour from source-of-truth documentation.
- Prefer traceable answers over unsupported inference.
- Preserve decisions, change history, and document versions.
- Never silently convert assumptions into approved requirements.
- **Automate reversible, low-impact local work; reserve consequential approvals for accountable humans.**

## Repository structure

    skills/
      business-analysis/SKILL.md
      program-management/
        SKILL.md
        assessor.mjs
        example-project.json
        tests/assessor.test.mjs
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

### Program Manager / Delivery Challenger — v0.1

`skills/program-management/SKILL.md`

Evidence-first program-management policy with bounded autonomy. It automatically prepares delivery diagnostics, risk/ownership findings, and local follow-up drafts, while reserving changes to baselines, budgets, scope, approvals and external commitments for accountable humans.

A dependency-free Node assessor and synthetic fixture are included. They are **not** an LLM agent or an integrated external action service.

Try it:

    node skills/program-management/assessor.mjs skills/program-management/example-project.json
    node --test skills/program-management/tests/assessor.test.mjs

See `skills/program-management/README.md` for the input contract and safety limits.

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
