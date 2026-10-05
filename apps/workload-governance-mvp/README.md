# Workload & Data Governance MVP

Generic browser prototype for two problems:

1. Demand and workload control: capture incoming requests, priorities, planned starts and explicit capacity decisions.
2. Data-consumption governance: one front door for teams that want to consume data from an application, with independent reference-data, human-approval and architecture controls.

The prototype contains no organisation-specific terminology, real application names, real data, authentication, backend or LLM dependency.

The accepted governance decisions are recorded in [`DECISIONS.md`](DECISIONS.md).

## Features

- Workload backlog with priority, status, effort, planned start and decision/constraint.
- Data request intake with requester, exposing application, consumer, requested data, business definition, use case, frequency, interface and criticality.
- Golden-source guard based on a separate reference-data contract rather than a requester-entered golden-source field.
- API-publication guard: an API is eligible only when the authoritative reference identifies the exposing application as golden source.
- Architecture triggers derived from reference facts: known applications, existing flows and registered interfaces, plus controlled interface/criticality values.
- Named and dated human data-owner approval. Approval automation is intentionally deferred until its rules are defined.
- Version-bound and reference-bound decisions: changing governed request data or the reference facts invalidates prior decisions.
- Lifecycle guard: `Approved`, `Implemented` and `Closed` cannot bypass the same governance invariants.
- Dashboard and controlled-flow / lineage view.
- Browser local storage plus versioned JSON backup/import with type, enum, duplicate-ID, size, governed-state and self-declared-control checks.
- Legacy backup migration that does not trust previous self-declared control facts or approvals.
- Synthetic demo records and a synthetic reference snapshot only.
- Zero runtime dependencies.

## Non-self-declared governance facts

The request form does **not** ask the requester to declare:

- the golden-source application;
- whether the consumer is already known;
- whether a flow is new;
- whether an existing flow has changed.

Those facts are resolved through a separate reference-data contract. In this MVP, [`reference-data.mjs`](reference-data.mjs) is a synthetic read-only stand-in so that the control logic can be demonstrated without organisation-specific integrations.

If the reference catalogue cannot resolve a golden source, the request is blocked in `Information required`; the requester cannot make an application authoritative by typing the same application into another field.

## Run locally

Serve the folder with a simple HTTP server, for example:

    python3 -m http.server 8080

Then open http://localhost:8080.

## Tests

Requires Node.js 20 or newer:

    npm test

The tests cover authoritative golden-source resolution, attempts to forge self-declared source ownership and architecture triggers, strict controlled values, meaningful use-case input, requester changes, human and architecture decisions, reference-data invalidation, lifecycle transitions, import validation, legacy migration, summaries, lineage derivation and sequence handling beyond 999 records.

## Governance rule implemented in this version

A consumer can be authorised only when all of the following are true:

1. the use case is present and substantive;
2. an independent reference source identifies the application exposing the data as its golden source;
3. a named human data owner approves the current request version against the current reference facts;
4. architecture validates the current version against the current reference facts when a derived architecture trigger applies.

A human approval cannot override the golden-source rule. `Approved`, `Implemented` and `Closed` all re-evaluate the same controls rather than trusting lifecycle status alone.

This is a BCBS 239-aligned sourcing and traceability rule, not a claim that the prototype itself is BCBS 239 compliant.

## Important limitations and upstream dependencies

This remains a browser-local prototype, not an enterprise control system. The following weaknesses are intentionally left explicit because solving them correctly requires authoritative upstream integrations rather than more requester-entered fields:

- **Golden-source authority:** `reference-data.mjs` is synthetic. Production must obtain golden-source ownership from an authoritative application/data catalogue.
- **Application existence and consumer status:** the synthetic application list must be replaced by a governed application catalogue or equivalent inventory.
- **Existing-flow and interface facts:** the synthetic flow list must be replaced by an architecture repository, API catalogue, integration registry or equivalent authoritative source.
- **Human identity and role:** a typed human name is only a local attestation. Production requires enterprise authentication/IAM and RBAC to prove who approved and whether that person had authority.
- **Maker/checker:** distinct authenticated identities and role rules are required before separation of duties can be enforced reliably.
- **Audit evidence:** there is no server-side persistence, immutable journal, signed evidence, evidence-retention policy or regulatory archive.
- **Reference freshness:** the prototype binds decisions to the current local reference signature, but only an upstream integration can guarantee that the underlying catalogue facts are current and authoritative.

The prototype also does not provide encryption, notifications or architecture-repository integration. Do not put confidential, personal, regulated or employer-sensitive information into a publicly hosted instance.

## Next increments

- Replace the synthetic reference snapshot with provider-specific adapters to authoritative application/data catalogues and architecture repositories.
- Add authenticated backend and role model: requester, human application/data owner, architect, IT reviewer and administrator.
- Add immutable decision history, comments and evidence retention.
- Add maker/checker enforcement only after authenticated identity and role sources are available.
- Add SLA and ageing metrics.
- Define the evidence, accountability and exception rules required before considering any approval automation.
- Provider-neutral LLM assistant for analysis and recommendations only. A model has no approval authority in this version.
