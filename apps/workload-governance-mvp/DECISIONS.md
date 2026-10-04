# Governance decisions

## DG-001 — Human authorisation and golden-source sourcing

- **Date:** 2026-10-04
- **Status:** Accepted
- **Scope:** Data-consumption requests and API eligibility

### Context

An application may store data copied from another system without being the authoritative source for that data. Allowing a consumer to retrieve the copy as though it were authoritative would weaken source traceability and create conflicting distribution paths.

### Decision

1. Every request must describe its use case.
2. The application exposing data must be the declared golden source for that data.
3. An API is eligible for publication only for data for which the exposing application is the golden source.
4. If another application is the golden source, consumption from the local copy is refused and the requester is redirected to the golden source.
5. A named human data owner must approve or reject the consumer for the current request version.
6. Human approval cannot override the golden-source rule.
7. Architecture validation remains a separate decision when an architecture trigger applies.
8. Any governed change invalidates prior human and architecture decisions.
9. Approval automation is out of scope until evidence, accountability, exception handling and control rules are explicitly defined and approved.

### BCBS 239 positioning

This sourcing rule supports BCBS 239-aligned traceability by directing consumers to the declared authoritative source. The prototype and this rule alone do not establish BCBS 239 compliance.

### Consequences

- The controlled-flow view must re-evaluate these rules and must not trust a lifecycle status alone.
- `Approved`, `Implemented` and `Closed` records remain valid only while the bound human and architecture decisions are current.
- Imported backups cannot introduce automated, stale or incomplete human decisions.
- Until authentication and role-based access control exist, a recorded human name is a local prototype attestation rather than enterprise proof.
