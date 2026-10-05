# Governance decisions

## DG-001 — Human authorisation and golden-source sourcing

- **Date:** 2026-10-04
- **Status:** Accepted, amended by DG-002
- **Scope:** Data-consumption requests and API eligibility

### Context

An application may store data copied from another system without being the authoritative source for that data. Allowing a consumer to retrieve the copy as though it were authoritative would weaken source traceability and create conflicting distribution paths.

### Decision

1. Every request must describe its use case.
2. The application exposing data must be the authoritative golden source for that data.
3. An API is eligible for publication only for data for which the exposing application is the golden source.
4. If another application is the golden source, consumption from the local copy is refused and the requester is redirected to the golden source.
5. A named human data owner must approve or reject the consumer for the current request version.
6. Human approval cannot override the golden-source rule.
7. Architecture validation remains a separate decision when an architecture trigger applies.
8. Any governed request change invalidates prior human and architecture decisions.
9. Approval automation is out of scope until evidence, accountability, exception handling and control rules are explicitly defined and approved.

### BCBS 239 positioning

This sourcing rule supports BCBS 239-aligned traceability by directing consumers to an authoritative source. The prototype and this rule alone do not establish BCBS 239 compliance.

## DG-002 — Governance facts must not be requester self-declarations

- **Date:** 2026-10-05
- **Status:** Accepted
- **Scope:** Golden-source ownership, architecture triggers and decision validity

### Context

A control is ineffective if the requester can supply the fact that determines whether the control passes. Golden-source ownership, whether a consumer is already known, and whether a flow already exists or has changed must therefore come from a reference source independent from the data-consumption request.

### Decision

1. `goldenSourceApplication`, `newFlow`, `flowChanged` and `newConsumer` are not accepted as current request inputs or current-backup governance facts.
2. Golden-source ownership is resolved from a separate data-authority catalogue.
3. Known consumers are resolved from an application catalogue.
4. New or changed flows are derived from an architecture-flow registry and the requested interface.
5. Controlled request values such as interface, criticality and frequency must match strict enumerations; free-form variants cannot bypass exact trigger rules.
6. The requester/team is a governed field. Changing it invalidates prior decisions.
7. Human and architecture decisions are bound both to the request version and to a signature of the reference facts used for the decision. A reference-data change makes an old decision stale even when the request itself has not changed.
8. If the authoritative data catalogue has no golden-source record, approval is blocked rather than trusting a requester declaration.
9. Legacy backups may be migrated, but old approvals and old self-declared governance facts are not trusted during migration.

### Prototype implementation

The browser MVP uses `reference-data.mjs`, a synthetic read-only snapshot, solely to exercise the contract without introducing organisation-specific systems or data. Request forms cannot edit that reference snapshot.

### Enterprise dependency / known limitation

The synthetic snapshot is **not** authoritative evidence. An enterprise implementation must replace it with authenticated connections to upstream sources, for example:

- application/data catalogue for golden-source ownership and registered applications;
- architecture repository or flow registry for existing flows and interfaces;
- enterprise IAM for the identity and role of approvers and architecture reviewers.

Without those integrations, the prototype demonstrates deterministic control logic but cannot prove that the reference facts or human identities are enterprise-authoritative.

### Consequences

- The controlled-flow view re-evaluates controls and current reference facts; it does not trust lifecycle status alone.
- `Approved`, `Implemented` and `Closed` records remain valid only while request-bound decisions and reference-bound decisions remain current.
- Current backups cannot inject requester-controlled golden-source or architecture-trigger fields.
- A typed human name remains a local attestation until authentication/RBAC exists; maker/checker and regulatory evidence remain outside the prototype.
