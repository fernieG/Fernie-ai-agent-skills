# Fernie Agent Graph — C# orchestration core

A small, typed, dependency-free graph engine for orchestrating agents and reusable skills.

## Why this exists

The orchestration layer should decide **what runs next and under which conditions**. AI agents can reason inside graph nodes, while deterministic C# owns routing, state transitions, safety limits and human approval gates.

The core intentionally has no AI SDK dependency. This keeps the graph cheap to run, easy to test and independent of any model provider. `AgentNode` constrains allowed outcomes and state mutations while `IAgentRuntime` is the adapter point for Microsoft Agent Framework / OpenAI later.

## Core concepts

- `GraphState`: shared state passed through the workflow.
- `IGraphNode`: one deterministic unit of work.\n- `AgentNode`: a constrained agentic node backed by an `IAgentRuntime`; model providers plug in behind this contract.
- `NodeResult`: typed routing outcome from a node.
- `GraphEdge`: route from `(node, outcome)` to the next node.
- `GraphRunner`: validates and executes the graph with a loop safety limit.
- `HumanGateNode`: pauses until an explicit approval flag exists.
- Trace: every executed node and routing outcome is recorded.

## MyCycle edge case

The first example deliberately models a real delivery problem:

- current repository UI: three tabs;
- intended target UI: one screen, no tabs;
- privacy constraint: health data remains local-only;
- release requires a human gate.

The graph detects the baseline mismatch, creates remediation work items, and pauses the release instead of incorrectly declaring MyCycle ready.

Run:

```bash
dotnet run --project orchestrator/examples/MyCycle.EdgeCase/MyCycle.EdgeCase.csproj
```

Expected result: exit code `0`, with the graph paused at `human-release-gate` and a `Baseline mismatch` finding.

## Next integration

The next layer will add agent-backed node adapters. The graph remains deterministic; an AI node returns a constrained outcome and structured state changes, while C# validates what transitions are allowed.
