using Fernie.AgentGraph;

var state = new GraphState();
state.Set("app.name", "MyCycle");
state.Set("app.repository", "fernieG/MyCycle");
state.Set("app.currentUi", "three-tabs");
state.Set("app.targetUi", "single-screen-no-tabs");
state.Set("app.storage", "local-only");
state.Set("app.backend", "none");

var intake = new DelegateNode("intake", (state, _) =>
{
    state.Set("delivery.intent", "release");
    return NodeResult.Next("assess", "Delivery request captured.");
});

var assess = new DelegateNode("assess-baseline", (state, _) =>
{
    var currentUi = state.Get("app.currentUi");
    var targetUi = state.Get("app.targetUi");

    if (!string.Equals(currentUi, targetUi, StringComparison.Ordinal))
    {
        state.AddFinding(
            $"Baseline mismatch: current UI is '{currentUi}', target UI is '{targetUi}'.");
        return NodeResult.Next("gap", "Target experience is not yet implemented.");
    }

    return NodeResult.Next("aligned", "Current implementation matches target UI.");
});

var privacy = new DelegateNode("privacy-guard", (state, _) =>
{
    var storage = state.Get("app.storage");
    var backend = state.Get("app.backend");

    if (!string.Equals(storage, "local-only", StringComparison.Ordinal) ||
        !string.Equals(backend, "none", StringComparison.Ordinal))
    {
        state.AddFinding("Privacy model changed: release requires explicit review.");
        return NodeResult.Next("blocked", "Local-only privacy constraint is not satisfied.");
    }

    return NodeResult.Next("safe", "Local-only privacy model is preserved.");
});

var remediation = new DelegateNode("plan-remediation", (state, _) =>
{
    state.AddWorkItem("Replace the three-tab shell with the approved single-screen/no-tabs experience.");
    state.AddWorkItem("Keep day editing, bleeding, symptoms and notes auto-save behavior on the selected date.");
    state.AddWorkItem("Keep explicit Undo and remove-day-data behavior; do not add cycle deletion.");
    state.AddWorkItem("Preserve local-only storage, encrypted backup/restore and offline PWA behavior.");
    state.AddWorkItem("Update automated release checks and perform final iPhone validation.");
    return NodeResult.Next("review", "A remediation plan was generated from the detected baseline gap.");
});

var releaseReady = new DelegateNode("release-ready", (state, _) =>
{
    state.AddWorkItem("Run release checks.");
    state.AddWorkItem("Perform final iPhone human validation.");
    state.AddWorkItem("Publish to main only after release gate approval.");
    return NodeResult.Next("review", "Release plan prepared.");
});

var gate = new HumanGateNode(
    id: "human-release-gate",
    approvalKey: "approval.release",
    reasonFactory: state =>
        state.Findings.Count > 0
            ? "Release paused: resolve detected baseline findings before approval."
            : "Release paused pending human approval.");

var graph = new GraphDefinition(intake)
    .AddNode(assess)
    .AddNode(privacy)
    .AddNode(remediation)
    .AddNode(releaseReady)
    .AddNode(gate)
    .AddEdge("intake", "assess", "assess-baseline")
    .AddEdge("assess-baseline", "gap", "plan-remediation")
    .AddEdge("assess-baseline", "aligned", "privacy-guard")
    .AddEdge("privacy-guard", "safe", "release-ready")
    .AddEdge("privacy-guard", "blocked", "human-release-gate")
    .AddEdge("plan-remediation", "review", "human-release-gate")
    .AddEdge("release-ready", "review", "human-release-gate");

var runner = new GraphRunner();
var result = await runner.RunAsync(graph, state);

Console.WriteLine($"MyCycle graph result: paused={result.IsPaused}, last={result.LastNodeId}");
Console.WriteLine();

Console.WriteLine("Trace:");
foreach (var entry in state.Trace)
{
    Console.WriteLine($"- {entry.NodeId} -> {entry.Outcome}: {entry.Message}");
}

Console.WriteLine();
Console.WriteLine("Findings:");
foreach (var finding in state.Findings)
{
    Console.WriteLine($"- {finding}");
}

Console.WriteLine();
Console.WriteLine("Work items:");
foreach (var workItem in state.WorkItems)
{
    Console.WriteLine($"- {workItem}");
}

Console.WriteLine();
Console.WriteLine($"Gate: {result.PauseReason}");

var expectedEdgeCaseDetected =
    result.IsPaused &&
    result.LastNodeId == "human-release-gate" &&
    state.Findings.Any(finding => finding.StartsWith("Baseline mismatch:", StringComparison.Ordinal));

return expectedEdgeCaseDetected ? 0 : 1;

file sealed class DelegateNode(
    string id,
    Func<GraphState, CancellationToken, NodeResult> execute) : IGraphNode
{
    public string Id { get; } = id;

    public ValueTask<NodeResult> ExecuteAsync(
        GraphState state,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return ValueTask.FromResult(execute(state, cancellationToken));
    }
}
