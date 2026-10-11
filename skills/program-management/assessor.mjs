import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This is a local, deterministic assessor. It never changes source records,
// sends messages, approves governance requests, or calls an AI provider.
const ALLOWED_STATUSES = new Set(['not_started', 'in_progress', 'blocked', 'done']);
const AUTO_KINDS = new Set([
  'draft_followup', 'triage_risk', 'draft_status', 'internal_priority'
]);
const HUMAN_KINDS = new Set([
  'change_budget', 'change_scope', 'change_baseline', 'assign_accountability',
  'approve_release', 'external_commitment', 'approve_requirement',
  'approve_data_access', 'override_control', 'delete_record'
]);
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + 'T00:00:00Z')) &&
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

function assert(condition, message) {
  if (!condition) throw new Error('Invalid project: ' + message);
}

function dateDelta(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') -
    Date.parse(b + 'T00:00:00Z')) / 86400000);
}

function validate(project, asOf) {
  assert(project && typeof project === 'object' && !Array.isArray(project),
    'expected an object');
  assert(typeof project.name === 'string' && project.name.trim(),
    'name is required');
  assert(validDate(asOf), 'asOf must be a real YYYY-MM-DD date');
  const milestones = project.milestones ?? [];
  const tasks = project.tasks ?? [];
  const risks = project.risks ?? [];
  const requests = project.decisionRequests ?? [];
  for (const [name, items] of Object.entries({ milestones, tasks, risks, decisionRequests: requests })) {
    assert(Array.isArray(items), name + ' must be an array');
  }
  const all = new Map();
  for (const [collection, items] of [['milestones', milestones], ['tasks', tasks],
      ['risks', risks], ['decisionRequests', requests]]) {
    for (const entry of items) {
      assert(entry && typeof entry === 'object' && !Array.isArray(entry),
        collection + ' entries must be objects');
      assert(typeof entry.id === 'string' && /^[A-Za-z0-9_-]+$/.test(entry.id),
        collection + ' entries need a stable alphanumeric id');
      assert(!all.has(entry.id), 'duplicate id ' + entry.id);
      all.set(entry.id, entry);
      if (collection === 'tasks' || collection === 'milestones') {
        assert(ALLOWED_STATUSES.has(entry.status),
          entry.id + ' has an unknown status');
        assert(entry.due == null || validDate(entry.due),
          entry.id + ' has an invalid due date');
        assert(entry.dependsOn == null || Array.isArray(entry.dependsOn),
          entry.id + ' dependsOn must be an array');
        assert(entry.priority == null || ['critical', 'high', 'normal', 'low'].includes(entry.priority),
          entry.id + ' has an invalid priority');
      }
      if (collection === 'risks') {
        assert(entry.status === 'open' || entry.status === 'closed',
          entry.id + ' has an unknown risk status');
        assert(entry.mitigationDue == null || validDate(entry.mitigationDue),
          entry.id + ' has an invalid mitigation date');
      }
      if (collection === 'decisionRequests') {
        assert(typeof entry.kind === 'string' && entry.kind.length > 0,
          entry.id + ' needs a decision kind');
        assert(Array.isArray(entry.sourceIds) && entry.sourceIds.length > 0,
          entry.id + ' needs sourceIds');
      }
    }
  }
  const deliverables = new Map([...milestones, ...tasks].map(item => [item.id, item]));
  for (const entry of deliverables.values()) {
    for (const id of entry.dependsOn ?? []) {
      assert(typeof id === 'string' && deliverables.has(id),
        entry.id + ' has unresolved dependency ' + id);
    }
  }
  for (const entry of requests) {
    for (const id of entry.sourceIds) {
      assert(typeof id === 'string' && all.has(id) && id !== entry.id,
        entry.id + ' has unresolved decision evidence ' + id);
    }
  }
  // A cyclic dependency makes a critical path unreliable; fail closed.
  const seen = new Set();
  const visiting = new Set();
  function visit(id) {
    if (seen.has(id)) return;
    assert(!visiting.has(id), 'dependency cycle at ' + id);
    visiting.add(id);
    for (const next of deliverables.get(id).dependsOn ?? []) visit(next);
    visiting.delete(id);
    seen.add(id);
  }
  for (const id of deliverables.keys()) visit(id);
  return { milestones, tasks, risks, requests, deliverables };
}

function classifyRequest(request) {
  const reasons = [];
  if (!AUTO_KINDS.has(request.kind)) {
    reasons.push(HUMAN_KINDS.has(request.kind) ?
      'reserved governance decision' : 'unknown decision kind: fail closed');
  }
  if (request.impact !== 'low') reasons.push('not explicitly low impact');
  if (request.reversible !== true) reasons.push('not explicitly reversible');
  if (request.externalEffect !== false) reasons.push('external effect not explicitly excluded');
  if (request.changesBaseline !== false) reasons.push('baseline change not explicitly excluded');
  if (request.protectedDomain !== false) reasons.push('protected-domain impact not explicitly excluded');
  if (request.budgetDelta !== 0) reasons.push('zero financial impact not confirmed');
  return {
    id: request.id,
    kind: request.kind,
    sourceIds: [...request.sourceIds],
    proposedAction: request.description ?? '',
    mode: reasons.length ? 'HUMAN' : 'AUTO_LOCAL',
    rationale: reasons.length ? reasons : ['bounded, reversible, local-only preparation'],
  };
}

export function analyzeProject(project, options = {}) {
  const asOf = options.asOf ?? project?.asOf;
  const { milestones, tasks, risks, requests, deliverables } = validate(project, asOf);
  const findings = [];
  function finding(code, severity, sourceId, evidence, proposedAction) {
    findings.push({
      id: code + ':' + sourceId,
      code, severity, sourceIds: [sourceId],
      evidence, proposedAction, approval: 'not required for local draft'
    });
  }
  for (const item of [...milestones, ...tasks]) {
    const isMilestone = milestones.includes(item);
    if (!item.owner || !String(item.owner).trim()) {
      finding('UNOWNED', 'high', item.id, 'No named accountable owner.',
        'Draft an owner-clarification request; do not assign an owner.');
    }
    if (!item.due) {
      finding('UNSCHEDULED', 'medium', item.id, 'No committed due date.',
        'Draft a due-date clarification; do not invent a deadline.');
    }
    if (item.due && item.due < asOf && item.status !== 'done') {
      const severity = isMilestone || item.priority === 'critical' ? 'critical' : 'high';
      finding('OVERDUE', severity, item.id,
        'Due ' + item.due + '; status ' + item.status + '; assessed ' + asOf + '.',
        'Flag overdue and draft recovery/impact request; preserve baseline.');
    }
    if (item.status === 'blocked') {
      finding('BLOCKED', isMilestone ? 'critical' : 'high', item.id,
        'Delivery status is blocked.', 'Draft dependency/decision escalation.');
    }
    if (item.status === 'done' &&
      (!Array.isArray(item.evidence) || item.evidence.length === 0)) {
      finding('UNVERIFIED_DONE', 'medium', item.id,
        'Marked done without supporting evidence reference.',
        'Request closure evidence; do not assert that delivery is verified.');
    }
    if (item.status !== 'done' && item.due &&
      dateDelta(item.due, asOf) <= 7) {
      const incomplete = (item.dependsOn ?? []).filter(
        id => deliverables.get(id).status !== 'done'
      );
      if (incomplete.length) {
        finding('DEPENDENCY_AT_RISK', 'high', item.id,
          'Due ' + item.due + '; unfinished dependencies: ' + incomplete.join(', ') + '.',
          'Draft dependency follow-up with owners and evidence.');
      }
    }
  }
  for (const risk of risks) {
    if (risk.status !== 'open') continue;
    if (!risk.owner || !String(risk.owner).trim()) {
      finding('RISK_UNOWNED', 'high', risk.id,
        'Open risk has no mitigation owner.', 'Draft mitigation-owner clarification.');
    }
    if (!risk.mitigation) {
      finding('RISK_NO_MITIGATION', 'high', risk.id,
        'Open risk has no mitigation recorded.', 'Draft mitigation proposal for review.');
    }
    if (risk.mitigationDue && risk.mitigationDue < asOf) {
      finding('RISK_OVERDUE', 'high', risk.id,
        'Risk mitigation due ' + risk.mitigationDue + ' has elapsed.',
        'Draft mitigation status follow-up.');
    }
  }
  findings.sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] || a.id.localeCompare(b.id));

  // Safe work is completed autonomously INSIDE THE GENERATED REPORT ONLY.
  // No change to records, authority, stakeholder communication, or budget.
  const followUpDrafts = findings.map(f => ({
    id: 'FOLLOWUP:' + f.id,
    priority: f.severity,
    sourceIds: f.sourceIds,
    action: f.proposedAction,
    rationale: f.evidence,
    state: 'drafted_local'
  }));
  const decisions = requests.map(classifyRequest);
  const autoDecisions = decisions.filter(d => d.mode === 'AUTO_LOCAL');
  const humanDecisions = decisions.filter(d => d.mode === 'HUMAN');
  const status = findings.some(f => f.severity === 'critical') ? 'RED' :
    findings.some(f => f.severity === 'high') ? 'AMBER' : 'GREEN';
  const counts = Object.fromEntries(['critical', 'high', 'medium', 'low']
    .map(s => [s, findings.filter(f => f.severity === s).length]));
  return {
    schemaVersion: '0.1.0',
    project: project.name,
    asOf,
    status,
    counts,
    findings,
    followUpDrafts,
    autoDecisions,
    humanDecisions,
    audit: {
      policy: 'program-manager-v0.1',
      asOf,
      mode: 'read-only evaluation; local suggestions and decisions only',
      generatedActions: followUpDrafts.length + autoDecisions.length,
      externalActions: 0,
      protectedDecisionsExecuted: 0
    }
  };
}

if (process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    assert(process.argv[2], 'usage: node assessor.mjs <project.json> [asOf]');
    const data = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
    const report = analyzeProject(data, { asOf: process.argv[3] ?? data.asOf });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exitCode = 1;
  }
}
