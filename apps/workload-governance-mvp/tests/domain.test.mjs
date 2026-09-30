import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createId,
  needsArchitectureReview,
  missingDataRequestFields,
  canApproveDataRequest,
  workloadSummary,
  dataRequestSummary,
  approvedFlows,
  nextSequence
} from '../domain.mjs';

const completeRequest = {
  requester: 'Team A',
  sourceApplication: 'Source',
  consumerApplication: 'Consumer',
  dataElement: 'Risk flag',
  expectedDefinition: 'Business definition',
  businessPurpose: 'Reporting',
  frequency: 'Daily',
  interfaceType: 'API',
  criticality: 'High',
  newFlow: true,
  newConsumer: true,
  flowChanged: false,
  architectureStatus: 'Validated',
  businessValidation: 'Validated',
  status: 'Approved'
};

test('createId builds stable date-based identifiers', () => {
  assert.equal(createId('DEM', new Date('2026-09-30T10:00:00Z'), 7), 'DEM-20260930-007');
});

test('architecture review is triggered by a new flow or unknown interface', () => {
  assert.equal(needsArchitectureReview({ newFlow: true }), true);
  assert.equal(needsArchitectureReview({ interfaceType: 'Unknown / to define' }), true);
  assert.equal(needsArchitectureReview({ newFlow: false, flowChanged: false, newConsumer: false, interfaceType: 'API' }), false);
});

test('missing fields are explicitly reported', () => {
  const missing = missingDataRequestFields({ requester: 'A' });
  assert.ok(missing.includes('Source application'));
  assert.ok(missing.includes('Requested data'));
});

test('approval is blocked without architecture validation when gate is triggered', () => {
  const result = canApproveDataRequest({ ...completeRequest, architectureStatus: 'Pending' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Architecture validation/);
});

test('approval is blocked without business validation', () => {
  const result = canApproveDataRequest({ ...completeRequest, newFlow: false, newConsumer: false, businessValidation: 'Pending' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Business\/data-owner validation/);
});

test('complete validated request can be approved', () => {
  assert.equal(canApproveDataRequest(completeRequest).ok, true);
});

test('workload summary separates open, blocked and awaiting prioritisation', () => {
  const summary = workloadSummary([
    { status: 'In progress' },
    { status: 'Awaiting prioritisation' },
    { status: 'Blocked' },
    { status: 'Done' }
  ]);
  assert.deepEqual(summary, { total: 4, open: 3, inProgress: 1, awaitingPriority: 1, blocked: 1 });
});

test('data request summary counts architecture reviews', () => {
  const summary = dataRequestSummary([
    { status: 'Submitted', newFlow: true, architectureStatus: 'Pending' },
    { status: 'Information required', newFlow: false, architectureStatus: 'Not assessed' },
    { status: 'Approved', newFlow: true, architectureStatus: 'Validated' }
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.open, 3);
  assert.equal(summary.informationRequired, 1);
  assert.equal(summary.architectureReview, 1);
  assert.equal(summary.approved, 1);
});

test('approved flows only include approved lifecycle states', () => {
  const flows = approvedFlows([
    { id: '1', status: 'Submitted' },
    { id: '2', status: 'Approved', sourceApplication: 'A', consumerApplication: 'B', dataElement: 'X' }
  ]);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].id, '2');
});

test('nextSequence increments IDs created on the same date', () => {
  const date = new Date('2026-09-30T10:00:00Z');
  assert.equal(nextSequence([{ id: 'DEM-20260930-001' }, { id: 'DEM-20260930-004' }], 'DEM', date), 5);
});
