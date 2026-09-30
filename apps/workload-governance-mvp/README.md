# Workload & Data Governance MVP

Generic browser prototype for two problems:

1. Demand and workload control: capture incoming requests, priorities, planned starts and explicit capacity decisions.
2. Data-consumption governance: one front door for teams that want to consume data from an application, with separate business/data-owner and architecture checks.

The prototype contains no organisation-specific terminology, real application names, real data, authentication, backend or LLM dependency.

## Features

- Workload backlog with priority, status, effort, planned start and decision/constraint.
- Data request intake with source, consumer, requested data, expected business definition, purpose, frequency, interface, criticality and authoritative source.
- Automatic architecture-review trigger for a new flow, changed flow, new consumer or undefined interface.
- Approval guard: Approved is blocked while required information, business validation or triggered architecture validation is missing.
- Dashboard and approved-flow / lineage view.
- Browser local storage plus JSON backup/import.
- Synthetic demo records only.
- Zero runtime dependencies.

## Run locally

Serve the folder with a simple HTTP server, for example:

    python3 -m http.server 8080

Then open http://localhost:8080.

## Tests

Requires Node.js 20 or newer:

    npm test

The tests cover ID generation, architecture-gate logic, mandatory fields, approval controls, summaries, lineage derivation and sequence handling.

## Important limitations

This is a prototype, not an enterprise control system. It does not provide authentication, role-based access control, server-side persistence, immutable audit logs, maker/checker separation, enterprise identity integration, encryption, data-classification enforcement, notifications, architecture repository integration or regulatory evidence retention.

Do not put confidential, personal, regulated or employer-sensitive information into a publicly hosted instance.

## Next increments

- Authenticated backend and role model: requester, application/data owner, architect, IT reviewer and administrator.
- Immutable decision history and comments.
- Configurable governance rules rather than hard-coded architecture triggers.
- SLA and ageing metrics, application catalogue and data catalogue.
- Provider-neutral LLM assistant. Mistral can be used internally and another provider elsewhere, but the model should never have approval authority.
