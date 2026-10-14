namespace Fernie.AgentGraph;

public sealed record AgentRequest(
    string AgentName,
    string Instructions,
    IReadOnlyList<string> Skills,
    IReadOnlyDictionary<string, string> State);

public sealed record AgentResponse(
    string Outcome,
    string? Message = null,
    IReadOnlyDictionary<string, string>? StateUpdates = null,
    IReadOnlyList<string>? Findings = null,
    IReadOnlyList<string>? WorkItems = null);

public interface IAgentRuntime
{
    ValueTask<AgentResponse> RunAsync(
        AgentRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class AgentNode : IGraphNode
{
    private readonly IAgentRuntime _runtime;
    private readonly string _instructions;
    private readonly IReadOnlyList<string> _skills;
    private readonly HashSet<string> _allowedOutcomes;

    public AgentNode(
        string id,
        string agentName,
        string instructions,
        IEnumerable<string> skills,
        IEnumerable<string> allowedOutcomes,
        IAgentRuntime runtime)
    {
        Id = string.IsNullOrWhiteSpace(id)
            ? throw new ArgumentException("Node id is required.", nameof(id))
            : id;
        AgentName = string.IsNullOrWhiteSpace(agentName)
            ? throw new ArgumentException("Agent name is required.", nameof(agentName))
            : agentName;
        _instructions = instructions ?? string.Empty;
        _skills = skills?.ToArray() ?? [];
        _allowedOutcomes = new HashSet<string>(
            allowedOutcomes ?? throw new ArgumentNullException(nameof(allowedOutcomes)),
            StringComparer.Ordinal);

        if (_allowedOutcomes.Count == 0)
        {
            throw new ArgumentException("At least one allowed outcome is required.", nameof(allowedOutcomes));
        }

        _runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
    }

    public string Id { get; }
    public string AgentName { get; }

    public async ValueTask<NodeResult> ExecuteAsync(
        GraphState state,
        CancellationToken cancellationToken = default)
    {
        var response = await _runtime.RunAsync(
            new AgentRequest(
                AgentName,
                _instructions,
                _skills,
                state.Values),
            cancellationToken);

        if (!_allowedOutcomes.Contains(response.Outcome))
        {
            throw new InvalidOperationException(
                $"Agent '{AgentName}' returned disallowed outcome '{response.Outcome}'.");
        }

        if (response.StateUpdates is not null)
        {
            foreach (var update in response.StateUpdates)
            {
                state.Set(update.Key, update.Value);
            }
        }

        if (response.Findings is not null)
        {
            foreach (var finding in response.Findings)
            {
                state.AddFinding(finding);
            }
        }

        if (response.WorkItems is not null)
        {
            foreach (var workItem in response.WorkItems)
            {
                state.AddWorkItem(workItem);
            }
        }

        return NodeResult.Next(response.Outcome, response.Message);
    }
}
