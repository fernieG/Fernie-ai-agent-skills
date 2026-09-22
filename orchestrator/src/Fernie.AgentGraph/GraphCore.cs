namespace Fernie.AgentGraph;

public sealed record GraphTraceEntry(
    string NodeId,
    string Outcome,
    string? Message,
    DateTimeOffset Timestamp);

public sealed class GraphState
{
    private readonly Dictionary<string, string> _values = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<string> _findings = [];
    private readonly List<string> _workItems = [];
    private readonly List<GraphTraceEntry> _trace = [];

    public IReadOnlyDictionary<string, string> Values => _values;
    public IReadOnlyList<string> Findings => _findings;
    public IReadOnlyList<string> WorkItems => _workItems;
    public IReadOnlyList<GraphTraceEntry> Trace => _trace;

    public bool IsPaused { get; private set; }
    public string? PauseReason { get; private set; }

    public void Set(string key, string value) => _values[key] = value;

    public string? Get(string key) =>
        _values.TryGetValue(key, out var value) ? value : null;

    public bool GetBool(string key) =>
        bool.TryParse(Get(key), out var value) && value;

    public void AddFinding(string finding)
    {
        if (!_findings.Contains(finding, StringComparer.Ordinal))
        {
            _findings.Add(finding);
        }
    }

    public void AddWorkItem(string workItem)
    {
        if (!_workItems.Contains(workItem, StringComparer.Ordinal))
        {
            _workItems.Add(workItem);
        }
    }

    public void Pause(string reason)
    {
        IsPaused = true;
        PauseReason = reason;
    }

    public void Resume()
    {
        IsPaused = false;
        PauseReason = null;
    }

    internal void AddTrace(GraphTraceEntry entry) => _trace.Add(entry);
}

public sealed record NodeResult(string Outcome, string? Message = null)
{
    public static NodeResult Next(string outcome, string? message = null) =>
        new(outcome, message);
}

public interface IGraphNode
{
    string Id { get; }

    ValueTask<NodeResult> ExecuteAsync(
        GraphState state,
        CancellationToken cancellationToken = default);
}

public sealed record GraphEdge(string From, string Outcome, string To);

public sealed class GraphDefinition
{
    private readonly Dictionary<string, IGraphNode> _nodes = new(StringComparer.Ordinal);
    private readonly List<GraphEdge> _edges = [];

    public GraphDefinition(IGraphNode startNode)
    {
        ArgumentNullException.ThrowIfNull(startNode);
        StartNodeId = startNode.Id;
        AddNode(startNode);
    }

    public string StartNodeId { get; }

    public IReadOnlyDictionary<string, IGraphNode> Nodes => _nodes;
    public IReadOnlyList<GraphEdge> Edges => _edges;

    public GraphDefinition AddNode(IGraphNode node)
    {
        ArgumentNullException.ThrowIfNull(node);

        if (!_nodes.TryAdd(node.Id, node))
        {
            throw new InvalidOperationException($"Node '{node.Id}' already exists.");
        }

        return this;
    }

    public GraphDefinition AddEdge(string from, string outcome, string to)
    {
        if (string.IsNullOrWhiteSpace(from) ||
            string.IsNullOrWhiteSpace(outcome) ||
            string.IsNullOrWhiteSpace(to))
        {
            throw new ArgumentException("Graph edge values cannot be blank.");
        }

        _edges.Add(new GraphEdge(from, outcome, to));
        return this;
    }

    public void Validate()
    {
        foreach (var edge in _edges)
        {
            if (!_nodes.ContainsKey(edge.From))
            {
                throw new InvalidOperationException($"Edge source '{edge.From}' does not exist.");
            }

            if (!_nodes.ContainsKey(edge.To))
            {
                throw new InvalidOperationException($"Edge target '{edge.To}' does not exist.");
            }
        }

        var duplicates = _edges
            .GroupBy(edge => (edge.From, edge.Outcome))
            .Where(group => group.Count() > 1)
            .Select(group => $"{group.Key.From}:{group.Key.Outcome}")
            .ToArray();

        if (duplicates.Length > 0)
        {
            throw new InvalidOperationException(
                $"Ambiguous graph routes: {string.Join(", ", duplicates)}");
        }
    }

    internal IGraphNode GetNode(string id) =>
        _nodes.TryGetValue(id, out var node)
            ? node
            : throw new InvalidOperationException($"Node '{id}' does not exist.");

    internal GraphEdge? FindEdge(string from, string outcome) =>
        _edges.SingleOrDefault(edge =>
            string.Equals(edge.From, from, StringComparison.Ordinal) &&
            string.Equals(edge.Outcome, outcome, StringComparison.Ordinal));
}

public sealed record GraphRunResult(
    string LastNodeId,
    string Outcome,
    bool IsPaused,
    string? PauseReason,
    int Steps);

public sealed class GraphRunner
{
    private readonly int _maxSteps;

    public GraphRunner(int maxSteps = 128)
    {
        if (maxSteps <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxSteps));
        }

        _maxSteps = maxSteps;
    }

    public async ValueTask<GraphRunResult> RunAsync(
        GraphDefinition graph,
        GraphState state,
        string? startNodeId = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(graph);
        ArgumentNullException.ThrowIfNull(state);

        graph.Validate();

        var currentNodeId = startNodeId ?? graph.StartNodeId;

        for (var step = 1; step <= _maxSteps; step++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var node = graph.GetNode(currentNodeId);
            var result = await node.ExecuteAsync(state, cancellationToken);

            state.AddTrace(new GraphTraceEntry(
                node.Id,
                result.Outcome,
                result.Message,
                DateTimeOffset.UtcNow));

            if (state.IsPaused)
            {
                return new GraphRunResult(
                    node.Id,
                    result.Outcome,
                    true,
                    state.PauseReason,
                    step);
            }

            var edge = graph.FindEdge(node.Id, result.Outcome);

            if (edge is null)
            {
                return new GraphRunResult(
                    node.Id,
                    result.Outcome,
                    false,
                    null,
                    step);
            }

            currentNodeId = edge.To;
        }

        throw new InvalidOperationException(
            $"Graph exceeded the {_maxSteps}-step safety limit.");
    }
}

public sealed class HumanGateNode(
    string id,
    string approvalKey,
    Func<GraphState, string> reasonFactory) : IGraphNode
{
    public string Id { get; } = id;

    public ValueTask<NodeResult> ExecuteAsync(
        GraphState state,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (state.GetBool(approvalKey))
        {
            state.Resume();
            return ValueTask.FromResult(
                NodeResult.Next("approved", "Human approval is present."));
        }

        var reason = reasonFactory(state);
        state.Pause(reason);

        return ValueTask.FromResult(
            NodeResult.Next("waiting", reason));
    }
}
