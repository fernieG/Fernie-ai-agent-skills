import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeProject } from '../assessor.mjs';

const example = JSON.parse(readFileSync(
  new URL('../example-project.json', import.meta.url), 'utf8'
));
function fixture() {
  return structuredClone(example);
}

test('identifies overdue critical delivery, blockers and missing accountability', () => {
  const result = analyzeProject(fixture());
  assert.equal(result.status, 'RED');
  assert.ok(result.findings.some(f =>
    f.id === 'OVERDUE:T-API' && f.severity === 'critical'));
  assert.ok(result.findings.some(f => f.id === 'BLOCKED:T-REVIEW'));
  assert.ok(result.findings.some(f => f.id === 'UNOWNED:T-REVIEW'));
  assert.ok(result.findings.some(f => f.id === 'DEPENDENCY_AT_RISK:T-REVIEW'));
  assert.ok(result.findings.some(f => f.id === 'RISK_NO_MITIGATION:R-CAPACITY'));
  assert.deepEqual(result.findings.map(f => f.sourceIds.length > 0).every(Boolean), true);
});

test('automatically prepares reversible, evidence-linked local work only', () => {
  const p = fixture();
  const before = JSON.stringify(p);
  const report = analyzeProject(p);
  assert.equal(JSON.stringify(p), before, 'source records must not be mutated');
  assert.deepEqual(report.autoDecisions.map(d => d.id), ['D-FOLLOWUP']);
  assert.deepEqual(report.humanDecisions.map(d => d.id), ['D-BASELINE']);
  assert.equal(report.audit.externalActions, 0);
  assert.equal(report.audit.protectedDecisionsExecuted, 0);
  assert.ok(report.followUpDrafts.length > 0);
  assert.ok(report.followUpDrafts.every(d => d.state === 'drafted_local'));
  assert.ok(report.followUpDrafts.every(d => d.sourceIds.length));
});

test('protected changes require humans even with forged low-risk metadata', () => {
  const p = fixture();
  const decision = p.decisionRequests[1];
  Object.assign(decision, {
    impact: 'low', reversible: true, externalEffect: false,
    changesBaseline: false, protectedDomain: false, budgetDelta: 0
  });
  const result = analyzeProject(p);
  assert.equal(result.humanDecisions.find(d => d.id === decision.id).mode, 'HUMAN');
});

test('unknown decision kinds fail closed', () => {
  const p = fixture();
  p.decisionRequests[0].kind = 'silently_approve_a_change';
  const result = analyzeProject(p);
  assert.ok(result.humanDecisions.some(d => d.id === 'D-FOLLOWUP'));
  assert.ok(!result.autoDecisions.some(d => d.id === 'D-FOLLOWUP'));
});

test('omitted safety assertions fail closed', () => {
  const p = fixture();
  delete p.decisionRequests[0].externalEffect;
  assert.ok(analyzeProject(p).humanDecisions.some(d => d.id === 'D-FOLLOWUP'));
});

test('invalid calendar dates are rejected, never guessed', () => {
  const p = fixture();
  p.tasks[0].due = '2026-02-30';
  assert.throws(() => analyzeProject(p), /invalid due date/);
});

test('missing dependencies are rejected rather than ignored', () => {
  const p = fixture();
  p.tasks[0].dependsOn = ['T-MISSING'];
  assert.throws(() => analyzeProject(p), /unresolved dependency/);
});

test('dependency loops are rejected', () => {
  const p = fixture();
  p.tasks[0].dependsOn = ['T-API'];
  assert.throws(() => analyzeProject(p), /dependency cycle/);
});

test('false done certainty is flagged without inventing evidence', () => {
  const p = fixture();
  p.tasks[0].evidence = [];
  const result = analyzeProject(p);
  assert.ok(result.findings.some(f => f.id === 'UNVERIFIED_DONE:T-SCHEMA'));
});

test('a healthy and evidenced project can report GREEN', () => {
  const p = {
    name: 'Simple green project',
    asOf: '2026-10-11',
    milestones: [{
      id: 'M1', title: 'Finished milestone', owner: 'Owner',
      status: 'done', due: '2026-10-10', evidence: ['demo://proof']
    }],
    tasks: [],
    decisionRequests: [],
    risks: []
  };
  const report = analyzeProject(p);
  assert.equal(report.status, 'GREEN');
  assert.equal(report.findings.length, 0);
});

test('decision source references must exist', () => {
  const p = fixture();
  p.decisionRequests[0].sourceIds = ['ghost'];
  assert.throws(() => analyzeProject(p), /unresolved decision evidence/);
});

test('analysis date is explicit and not inferred from current clock', () => {
  const p = fixture();
  delete p.asOf;
  assert.throws(() => analyzeProject(p), /asOf/);
  assert.equal(analyzeProject(p, {asOf: '2026-10-11'}).asOf, '2026-10-11');
});
