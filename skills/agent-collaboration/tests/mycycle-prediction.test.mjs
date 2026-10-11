import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMyCycleV4, runMyCycleDemo, syntheticMyCycleIssue
} from '../examples/mycycle-prediction.mjs';

test('PM asks validation, prediction and QA specialists to solve a forecast request', async () => {
  const result = await runMyCycleDemo();
  assert.equal(result.status, 'resolved_local');
  assert.deepEqual(result.trace.map(x => x.agent), [
    'project_manager', 'data_validation', 'prediction', 'qa_review'
  ]);
  const prediction = result.artifacts.find(x => x.id === 'ART-PREDICTION');
  assert.equal(prediction.content.date, '2025-05-04');
  assert.equal(prediction.content.startWindow, '2025-05-02');
  assert.equal(prediction.content.endWindow, '2025-05-06');
  assert.deepEqual([...prediction.content.daysObserved], [27, 30, 26]);
  assert.equal(result.verification.passed, true);
  assert.equal(result.externalActions, 0);
});

test('MyCycle logic with fewer than three intervals falls back to user setting', () => {
  const result = calculateMyCycleV4(['2025-01-14', '2025-02-10'], 29);
  assert.equal(result.cyclesUsed, 1);
  assert.equal(result.cycleLength, 29);
  assert.equal(result.date, '2025-03-11');
  assert.equal(result.confidence, 'Limited');
});

test('mismatching expected forecast remains unresolved after agents collaborate', async () => {
  const result = await runMyCycleDemo({
    expected: {
      date: '2025-05-05',
      startWindow: '2025-05-03',
      endWindow: '2025-05-07'
    }
  });
  assert.equal(result.status, 'unresolved');
  assert.ok(result.trace.some(x => x.agent === 'qa_review'));
});

test('when QA has no independent oracle, require human review', async () => {
  const result = await runMyCycleDemo({ expected: null });
  assert.equal(result.status, 'human_decision_required');
});

test('the same verified forecast cannot override a human approval gate', async () => {
  const result = await runMyCycleDemo({ requiresHumanApproval: true });
  assert.equal(result.status, 'ready_for_human');
});

test('unconfirmed or invalid dates cannot be silently made into evidence', async () => {
  const result = await runMyCycleDemo({
    confirmedStarts: ['2025-01-14', '2025-02-30', '2025-04-07']
  });
  assert.equal(result.status, 'unresolved');
  assert.match(result.reason, /invalid/);
});

test('synthetic fixture contains no current user health history', () => {
  assert.equal(syntheticMyCycleIssue.asOf, '2025-04-15');
  assert.ok(syntheticMyCycleIssue.confirmedStarts.every(s => s.startsWith('2025-')));
});

test('empty history cannot produce a forecast', () => {
  assert.throws(() => calculateMyCycleV4([], 28), /Missing or invalid/);
});
