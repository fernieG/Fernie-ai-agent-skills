# Fernie AI Agent Skills

Reusable skills and operating models for AI agents supporting product, transformation, analysis, and delivery work.

## Principles

- Keep skills generic and reusable.
- Keep company-, client-, project-, and application-specific knowledge in private repositories or private knowledge bases.
- Separate agent behaviour from source-of-truth documentation.
- Prefer traceable answers over unsupported inference.
- Preserve decisions, change history, and document versions.
- Never silently convert assumptions into approved requirements.

## Repository structure

```text
skills/
  business-analysis/
    SKILL.md
apps/
  workload-governance-mvp/
    README.md
templates/
  decision-log.md
  change-log.md
  traceability-matrix.md
  requirement-record.md
```

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

## Versioning

Skills use semantic versions:

- `0.x`: evolving draft skill
- `1.0.0`: first stable baseline
- patch: clarification with no intended behavioural change
- minor: new backward-compatible capability
- major: material change to agent behaviour or output contract

Each skill should carry its own version and changelog section.

## Experimental applications

### Workload & Data Governance MVP

`apps/workload-governance-mvp/`

A dependency-free browser prototype for workload intake and governed data-consumption requests. It is an application, not an agent skill: no LLM or autonomous approval is used. Human data-owner approval remains mandatory. Golden-source ownership and architecture-trigger facts are resolved from a separate reference-data contract rather than requester self-declarations; the MVP uses a synthetic snapshot that must be replaced by authoritative upstream catalogues/repositories for enterprise use.
