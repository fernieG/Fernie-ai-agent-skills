/**
 * Minimal, provider-neutral agent-to-agent resolution coordinator.
 * Work happens in memory. No LLM calls, network, persistence, or side effects.
 * Real agents and authoritative evidence adapters are future integrations.
 */
const VALID_STATUSES = new Set(['handoff', 'complete', 'needs_human', 'unresolved']);

function fail(message) { throw new Error('Resolution contract: ' + message); }
function ok(value, message) { if (!value) fail(message); }
function copy(value) { return structuredClone(value); }

function normalizeAgentOutput(output, who, evidenceIds, seenArtifacts) {
  ok(output && typeof output === 'object' && !Array.isArray(output),
    who + ' must return an object');
  ok(VALID_STATUSES.has(output.status), who + ' returned an unsupported status');
  ok(typeof output.reason === 'string' && output.reason.trim(),
    who + ' must explain its proposed outcome');

  if (output.artifact !== undefined) {
    const a = output.artifact;
    ok(a && typeof a === 'object' && !Array.isArray(a),
      'artifact must be an object');
    ok(typeof a.id === 'string' && /^[A-Za-z0-9_-]+$/.test(a.id) &&
      !seenArtifacts.has(a.id), 'artifact must have a new stable ID');
    ok(typeof a.type === 'string' && a.type.length > 0, 'artifact type required');
    ok(a.content && typeof a.content === 'object', 'artifact content required');
    ok(Array.isArray(a.evidenceIds) && a.evidenceIds.length > 0,
      'artifact needs evidence links');
    for (const id of a.evidenceIds) {
      ok(typeof id === 'string' && evidenceIds.has(id),
        'artifact ' + a.id + ' cites unknown source ' + id);
    }
  }
  if (output.status === 'handoff') {
    ok(typeof output.nextAgent === 'string' && output.nextAgent.trim(),
      who + ' must name the receiving agent');
  } else {
    ok(output.nextAgent === undefined,
      who + ' cannot delegate from a terminal outcome');
  }
  return output;
}

export async function resolveIssue({
  issue, agents, verify, maxSteps = 8, maxAgentVisits = 2
}) {
  ok(issue && typeof issue === 'object' && !Array.isArray(issue),
    'issue object required');
  ok(typeof issue.id === 'string' && issue.id.trim(), 'issue ID required');
  ok(typeof issue.objective === 'string' && issue.objective.trim(),
    'the solvable objective must be explicit');
  ok(Array.isArray(issue.sourceIds) && issue.sourceIds.length > 0 &&
    issue.sourceIds.every(s => typeof s === 'string' && s.trim()),
    'at least one validated source ID required');
  ok(typeof issue.startAgent === 'string' && issue.startAgent.trim(),
    'first agent must be explicit');
  ok(agents && typeof agents === 'object', 'agents registry required');
  ok(Number.isInteger(maxSteps) && maxSteps > 0 && maxSteps <= 100,
    'maxSteps must be a bounded positive integer');
  ok(Number.isInteger(maxAgentVisits) && maxAgentVisits > 0 && maxAgentVisits <= 20,
    'maxAgentVisits must be a bounded positive integer');

  const evidenceIds = new Set(issue.sourceIds);
  const artifacts = [];
  const trace = [];
  const counts = new Map();
  const pristineIssue = copy(issue);
  let current = issue.startAgent;

  function done(status, reason, verification = null) {
    return {
      protocol: 'agent-to-agent-resolution-v0.1',
      issueId: issue.id,
      objective: issue.objective,
      status, reason,
      artifacts: copy(artifacts),
      trace: copy(trace),
      verification,
      externalActions: 0,
      changesToApprovedBaseline: 0
    };
  }

  // Only an independent verifier can close a local objective.
  for (let step = 1; step <= maxSteps; step++) {
    const runAgent = agents[current];
    if (typeof runAgent !== 'function') {
      trace.push({ step, agent: current, event: 'unavailable' });
      return done('unresolved', 'No registered specialist for ' + current);
    }
    const visits = (counts.get(current) ?? 0) + 1;
    if (visits > maxAgentVisits) {
      trace.push({ step, agent: current, event: 'loop_guard' });
      return done('unresolved', 'Repeated delegation detected for ' + current);
    }
    counts.set(current, visits);

    let output;
    try {
      // Agent receives an isolated snapshot: no shared mutable state.
      const request = {
        issue: copy(pristineIssue),
        artifacts: copy(artifacts),
        trace: copy(trace)
      };
      output = await runAgent(request);
      output = normalizeAgentOutput(output, current,
        evidenceIds, new Set(artifacts.map(a => a.id)));
    } catch (error) {
      trace.push({ step, agent: current, event: 'contract_or_execution_error' });
      return done('unresolved', 'Specialist could not complete a valid step: ' +
        String(error?.message ?? error));
    }

    if (output.artifact) {
      artifacts.push({ ...copy(output.artifact), producedBy: current });
      evidenceIds.add(output.artifact.id);
    }
    trace.push({
      step,
      agent: current,
      event: output.status,
      reason: output.reason,
      artifactId: output.artifact?.id ?? null,
      nextAgent: output.nextAgent ?? null
    });
    if (output.status === 'handoff') {
      // Agents choose the best specialist; coordinator guarantees bounded routing.
      current = output.nextAgent;
      continue;
    }
    if (output.status === 'needs_human') {
      return done('human_decision_required', output.reason);
    }
    if (output.status === 'unresolved') {
      return done('unresolved', output.reason);
    }
    if (typeof verify !== 'function') {
      return done('unresolved',
        'No independent acceptance verifier; agent completion is not evidence of resolution');
    }
    let check;
    try {
      check = await verify({
        issue: copy(pristineIssue),
        artifacts: copy(artifacts),
        trace: copy(trace)
      });
    } catch (error) {
      return done('unresolved', 'Independent verification failed to execute: ' +
        String(error?.message ?? error));
    }
    if (!check || check.passed !== true ||
      typeof check.reason !== 'string' || !check.reason.trim()) {
      return done('unresolved', 'Acceptance verification did not pass',
        check && typeof check === 'object' ? copy(check) : null);
    }
    // No protected decision can be inferred from output of a specialist.
    if (issue.requiresHumanApproval !== false || issue.localOnly !== true) {
      return done('ready_for_human', 'Solution verified but authority/local-only scope not established',
        copy(check));
    }
    return done('resolved_local', 'Objective resolved as an in-memory artifact and independently verified',
      copy(check));
  }
  return done('unresolved', 'Maximum specialist steps exceeded; stop rather than loop indefinitely');
}
