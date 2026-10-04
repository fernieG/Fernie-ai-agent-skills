# Workload & Data Governance MVP

Generic browser prototype for two problems:

1. Demand and workload control: capture incoming requests, priorities, planned starts and explicit capacity decisions.
2. Data-consumption governance: one front door for teams that want to consume data from an application, with a deterministic golden-source policy, mandatory human approval and a separate architecture decision where required.

The prototype contains no organisation-specific terminology, real application names, real data, authentication, backend or LLM dependency.

The accepted governance decision is recorded in [`DECISIONS.md`](DECISIONS.md).

## Features

- Workload backlog with priority, status, effort, planned start and decision/constraint.
- Data request intake with exposing application, consumer, requested data, business definition, use case, frequency, interface, criticality and golden source.
- Golden-source guard: consumption is refused when the exposing application merely stores the data but is not its golden source.
- API-publication guard: an API is eligible only for data for which the exposing application is the golden source.
- Named and dated human data-owner approval. Approval automation is intentionally deferred until its rules are defined.
- Separate architecture decision for a new or changed flow, a new consumer, an undefined interface or critical data.
- Version-bound decisions: changing governed request data invalidates prior human and architecture decisions.
- Lifecycle guard: `Approved`, `Implemented` and `Closed` cannot bypass the same governance invariants.
- Dashboard and controlled-flow / lineage view.
- Browser local storage plus versioned JSON backup/import with type, enum, duplicate-ID, size and governed-state checks.
- Synthetic demo records only.
- Zero runtime dependencies.

## Run locally

Serve the folder with a simple HTTP server, for example:

    python3 -m http.server 8080

Then open http://localhost:8080.

## Tests

Requires Node.js 20 or newer:

    npm test

The tests cover golden-source and API-publication policy, mandatory use cases, human and architecture decisions, decision invalidation, lifecycle transitions, import validation, summaries, lineage derivation and sequence handling beyond 999 records.

## Governance rule implemented in this version

A consumer can be authorised only when all of the following are true:

1. the use case is described;
2. the application exposing the data is its golden source;
3. a named human data owner approves the current request version;
4. architecture validates the current version when an architecture trigger applies.

If the application stores a copy of data for which another application is the golden source, the request is refused and redirected to the declared golden source. A human approval cannot override this rule.

This is a BCBS 239-aligned sourcing rule, not a claim that the prototype itself is BCBS 239 compliant.

## Important limitations

This is a prototype, not an enterprise control system. A typed human name is a local attestation, not authenticated proof. The prototype does not provide authentication, role-based access control, server-side persistence, immutable audit logs, maker/checker enforcement, enterprise identity integration, encryption, notifications, architecture repository integration or regulatory evidence retention.

Do not put confidential, personal, regulated or employer-sensitive information into a publicly hosted instance.

## Next increments

- Authenticated backend and role model: requester, human application/data owner, architect, IT reviewer and administrator.
- Immutable decision history and comments.
- Configurable governance rules rather than hard-coded architecture triggers.
- SLA and ageing metrics, application catalogue and data catalogue.
- Define the evidence, accountability and exception rules required before considering any approval automation.
- Provider-neutral LLM assistant for analysis and recommendations only. A model has no approval authority in this version.
