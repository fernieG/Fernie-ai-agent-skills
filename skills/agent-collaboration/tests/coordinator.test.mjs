import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIssue } from '../coordinator.mjs';
import { demoIssue, makeDemoAgents, runDemo, verifyDemo } from '../examples/demo.mjs';

test('PM routes to specialists and actually produces a verified local artifact', async () => {
  const original = JSON.stringify(demoIssue);
  const out = await runDemo();
  assert.equal(out.status, 'resolved_local');
  assert.deepEqual(out.trace.map(t => t.agent), [
    'project_manager', 'business_analyst', 'test_engineer', 'quality_reviewer'
  ]);
  assert.ok(out.artifacts.some(a => a.id === 'ART-TESTS'));
  assert.equal(out.verification.passed, true);
  assert.equal(out.externalActions, 0);
  assert.equal(JSON.stringify(demoIssue), original);
});

test('agent saying complete is not enough: bad test expectations fail', async () => {
  const out = await runDemo({ agents: { corruptTests: true } });
  assert.equal(out.status, 'unresolved');
  assert.equal(out.verification.passed, false);
});

test('even verified solutions retain a human gate when required', async () => {
  const out = await runDemo({ issue: { requiresHumanApproval: true } });
  assert.equal(out.status, 'ready_for_human');
  assert.equal(out.verification.passed, true);
});

test('unknown local-only authority requires human approval', async () => {
  const out = await runDemo({ issue: { localOnly: undefined } });
  assert.equal(out.status, 'ready_for_human');
});

test('unknown receiving agent is unresolved instead of silently closed', async () => {
  const agents = makeDemoAgents();
  agents.project_manager = async () => ({
    status: 'handoff', reason: 'Ask unavailable specialist', nextAgent: 'architect'
  });
  const out = await resolveIssue({ issue: demoIssue, agents, verify: verifyDemo });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /No registered specialist/);
});

test('infinite delegation terminates with a loop guard', async () => {
  const agents = {
    project_manager: async () => ({
      status: 'handoff', reason: 'Back to BA', nextAgent: 'business_analyst'
    }),
    business_analyst: async () => ({
      status: 'handoff', reason: 'Back to PM', nextAgent: 'project_manager'
    })
  };
  const out = await resolveIssue({ issue: demoIssue, agents, verify: verifyDemo });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /Repeated delegation/);
  assert.ok(out.trace.length <= 5);
});

test('agents cannot manufacture source provenance', async () => {
  const agents = {
    project_manager: async () => ({
      status: 'complete',
      reason: 'Fake evidence',
      artifact: {
        id: 'A1', type: 'solution', evidenceIds: ['FABRICATED-REF'],
        content: { delivered: true }
      }
    })
  };
  const out = await resolveIssue({ issue: demoIssue, agents, verify: verifyDemo });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /unknown source/);
});

test('an early human escalation remains unresolved by automation', async () => {
  const agents = {
    project_manager: async () => ({
      status: 'needs_human', reason: 'Request changes approved budget'
    })
  };
  const out = await resolveIssue({ issue: demoIssue, agents, verify: verifyDemo });
  assert.equal(out.status, 'human_decision_required');
  assert.equal(out.verification, null);
});

test('a claimed completion without independent verifier remains unresolved', async () => {
  const out = await resolveIssue({
    issue: demoIssue,
    agents: makeDemoAgents()
  });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /independent acceptance verifier/);
});

test('a specialist error returns a contained unresolved result', async () => {
  const out = await resolveIssue({
    issue: demoIssue,
    agents: { project_manager: async () => { throw new Error('Temporary exception'); } },
    verify: verifyDemo
  });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /Temporary exception/);
});

test('max steps bounds a chain of unique agents', async () => {
  const agents = {
    project_manager: async () => ({
      status: 'handoff', reason: 'Next', nextAgent: 'business_analyst'
    }),
    business_analyst: async () => ({
      status: 'complete', reason: 'Done'
    })
  };
  const out = await resolveIssue({
    issue: demoIssue, agents, verify: verifyDemo, maxSteps: 1
  });
  assert.equal(out.status, 'unresolved');
  assert.match(out.reason, /Maximum specialist steps/);
});

test('agent cannot mutate original project record', async () => {
  const issue = structuredClone(demoIssue);
  const agents = {
    project_manager: async ({ issue: localIssue }) => {
      localIssue.rule.minOrderValue = -999;
      return { status: 'complete', reason: 'Local test only' };
    }
  };
  await resolveIssue({ issue, agents, verify: verifyDemo });
  assert.equal(issue.rule.minOrderValue, 50);
});

test('untrusted issue missing evidence fails validation', async () => {
  await assert.rejects(
    resolveIssue({ issue: { ...demoIssue, sourceIds: [] }, agents: makeDemoAgents(), verify: verifyDemo }),
    /validated source ID/
  );
});
