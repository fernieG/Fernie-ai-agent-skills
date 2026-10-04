import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_SCHEMA_VERSION,
  createId,
  needsArchitectureReview,
  missingDataRequestFields,
  goldenSourcePolicy,
  canApproveDataRequest,
  deriveDataRequestStatus,
  initialiseDataRequest,
  updateDataRequest,
  applyHumanDecision,
  applyArchitectureDecision,
  transitionDataRequest,
  workloadSummary,
  dataRequestSummary,
  approvedFlows,
  nextSequence,
  validateImportedState
} from '../domain.mjs';

const validDetails = {
  received: '2026-10-04',
  requester: 'Team A',
  sourceApplication: 'Golden Source App',
  consumerApplication: 'Consumer App',
  dataElement: 'Risk flag',
  expectedDefinition: 'Indicator used to flag a material deterioration of risk.',
  useCaseDescription: 'Daily portfolio monitoring and exception handling.',
  frequency: 'Daily',
  interfaceType: 'API',
  criticality: 'High',
  goldenSourceApplication: 'Golden Source App',
  newFlow: true,
  newConsumer: true,
  flowChanged: false
};

function makeApprovedRequest(id = 'DATA-20261004-001') {
  let request = initialiseDataRequest(validDetails, id);
  request = applyArchitectureDecision(request, {
    status: 'Validated',
    actor: 'Architecture Reviewer',
    at: '2026-10-04T08:00:00Z',
    comment: 'Flow pattern validated.'
  });
  request = applyHumanDecision(request, {
    status: 'Approved',
    actor: 'Human Data Owner',
    at: '2026-10-04T08:05:00Z',
    comment: 'Use case authorised.'
  });
  return request;
}

test('createId builds stable date-based identifiers', () => {
  assert.equal(createId('DEM', new Date('2026-09-30T10:00:00Z'), 7), 'DEM-20260930-007');
});

test('architecture review is triggered by flow changes, unknown interfaces and critical data', () => {
  assert.equal(needsArchitectureReview({ newFlow: true }), true);
  assert.equal(needsArchitectureReview({ flowChanged: true }), true);
  assert.equal(needsArchitectureReview({ newConsumer: true }), true);
  assert.equal(needsArchitectureReview({ interfaceType: 'Unknown / to define' }), true);
  assert.equal(needsArchitectureReview({ criticality: 'Critical' }), true);
  assert.equal(
    needsArchitectureReview({
      newFlow: false,
      flowChanged: false,
      newConsumer: false,
      interfaceType: 'API',
      criticality: 'High'
    }),
    false
  );
});

test('use case and golden source are mandatory', () => {
  const missing = missingDataRequestFields({ ...validDetails, useCaseDescription: '', goldenSourceApplication: '' });
  assert.ok(missing.includes('Use case description'));
  assert.ok(missing.includes('Golden source application'));
});

test('golden-source policy allows an API only when the exposing application is authoritative', () => {
  const allowed = goldenSourcePolicy({ ...validDetails, sourceApplication: ' GOLDEN  SOURCE APP ' });
  assert.equal(allowed.eligible, true);
  assert.equal(allowed.apiPublicationAllowed, true);

  const refused = goldenSourcePolicy({
    ...validDetails,
    sourceApplication: 'Replica App',
    goldenSourceApplication: 'Golden Source App'
  });
  assert.equal(refused.eligible, false);
  assert.equal(refused.apiPublicationAllowed, false);
  assert.match(refused.reason, /not its golden source/);
});

test('a request cannot be approved without a named, dated human decision', () => {
  let request = initialiseDataRequest(validDetails, 'DATA-1');
  request = applyArchitectureDecision(request, {
    status: 'Validated',
    actor: 'Architect',
    at: '2026-10-04T08:00:00Z'
  });
  const control = canApproveDataRequest(request);
  assert.equal(control.ok, false);
  assert.match(control.reason, /human approval/);
});

test('human approval cannot override the golden-source policy', () => {
  const request = initialiseDataRequest(
    {
      ...validDetails,
      sourceApplication: 'Replica App',
      goldenSourceApplication: 'Golden Source App'
    },
    'DATA-2'
  );
  assert.throws(
    () => applyHumanDecision(request, { status: 'Approved', actor: 'Data Owner' }),
    /not its golden source/
  );
  assert.equal(deriveDataRequestStatus(request), 'Rejected');
});

test('human approval waits for architecture when an architecture gate is triggered', () => {
  let request = initialiseDataRequest(validDetails, 'DATA-3');
  request = applyHumanDecision(request, {
    status: 'Approved',
    actor: 'Data Owner',
    at: '2026-10-04T08:00:00Z'
  });
  assert.equal(request.status, 'Architecture review');
  assert.equal(canApproveDataRequest(request).ok, false);
});

test('current human and architecture decisions produce an approved request', () => {
  const request = makeApprovedRequest();
  assert.equal(request.status, 'Approved');
  assert.equal(request.humanApprovalMethod, 'Human');
  assert.equal(canApproveDataRequest(request).ok, true);
});

test('architecture rejection blocks approval even when no automatic gate is active', () => {
  const details = {
    ...validDetails,
    newFlow: false,
    newConsumer: false,
    flowChanged: false
  };
  let request = initialiseDataRequest(details, 'DATA-4');
  request = applyHumanDecision(request, {
    status: 'Approved',
    actor: 'Data Owner',
    at: '2026-10-04T08:00:00Z'
  });
  request = { ...request, architectureStatus: 'Rejected' };
  const control = canApproveDataRequest(request);
  assert.equal(control.ok, false);
  assert.match(control.reason, /Architecture rejected/);
});

test('editing governed information invalidates both decisions and increments the version', () => {
  const approved = makeApprovedRequest();
  const updated = updateDataRequest(approved, {
    useCaseDescription: 'A materially different use case.'
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.humanApprovalStatus, 'Pending');
  assert.equal(updated.humanDecisionVersion, null);
  assert.equal(updated.architectureStatus, 'Pending');
  assert.equal(updated.architectureDecisionVersion, null);
  assert.notEqual(updated.status, 'Approved');
});

test('non-governed edits do not invalidate current decisions', () => {
  const approved = makeApprovedRequest();
  const updated = updateDataRequest(approved, { requester: 'Renamed Team A' });
  assert.equal(updated.version, 1);
  assert.equal(updated.humanApprovalStatus, 'Approved');
  assert.equal(updated.architectureStatus, 'Validated');
  assert.equal(updated.status, 'Approved');
});

test('non-governed edits preserve an advanced implementation lifecycle state', () => {
  const implemented = transitionDataRequest(makeApprovedRequest(), 'Implemented');
  const updated = updateDataRequest(implemented, { requester: 'Renamed Team A' });
  assert.equal(updated.status, 'Implemented');
  assert.equal(canApproveDataRequest(updated).ok, true);
});

test('Implemented and Closed cannot be selected as shortcuts around approval', () => {
  const submitted = initialiseDataRequest(validDetails, 'DATA-5');
  assert.throws(() => transitionDataRequest(submitted, 'Implemented'), /human approval/);

  const approved = makeApprovedRequest('DATA-6');
  const implemented = transitionDataRequest(approved, 'Implemented');
  assert.equal(implemented.status, 'Implemented');
  const closed = transitionDataRequest(implemented, 'Closed');
  assert.equal(closed.status, 'Closed');
});

test('approved-flow view rechecks controls instead of trusting lifecycle status', () => {
  const forged = {
    ...initialiseDataRequest(validDetails, 'DATA-FORGED'),
    status: 'Implemented'
  };
  assert.equal(approvedFlows([forged]).length, 0);
  assert.equal(approvedFlows([makeApprovedRequest('DATA-VALID')]).length, 1);
});

test('closed requests do not remain in the architecture-attention counter', () => {
  const approved = makeApprovedRequest();
  const implemented = transitionDataRequest(approved, 'Implemented');
  const closed = transitionDataRequest(implemented, 'Closed');
  assert.equal(dataRequestSummary([closed]).architectureReview, 0);
  assert.equal(dataRequestSummary([closed]).approved, 1);
});

test('workload summary separates open, blocked and awaiting prioritisation', () => {
  const summary = workloadSummary([
    { status: 'In progress' },
    { status: 'Awaiting prioritisation' },
    { status: 'Blocked' },
    { status: 'Done' }
  ]);
  assert.deepEqual(summary, {
    total: 4,
    open: 3,
    inProgress: 1,
    awaitingPriority: 1,
    blocked: 1
  });
});

test('nextSequence supports more than 999 records without creating a duplicate', () => {
  const date = new Date('2026-09-30T10:00:00Z');
  assert.equal(nextSequence([{ id: 'DEM-20260930-1000' }], 'DEM', date), 1001);
});

test('JSON import rejects invalid records, string booleans and duplicate IDs', () => {
  assert.throws(
    () => validateImportedState({ workload: [], dataRequests: [null] }),
    /Invalid data request/
  );
  assert.throws(
    () => validateImportedState({
      workload: [],
      dataRequests: [{ id: 'DATA-1', status: 'Submitted', newFlow: 'true' }]
    }),
    /must be a boolean/
  );
  assert.throws(
    () => validateImportedState({
      workload: [{ id: 'DUPLICATE', status: 'New' }],
      dataRequests: [{ id: 'DUPLICATE', status: 'Submitted' }]
    }),
    /duplicate IDs/
  );
});

test('JSON import rejects forged governed states', () => {
  const forged = {
    ...initialiseDataRequest(validDetails, 'DATA-FORGED'),
    status: 'Implemented'
  };
  assert.throws(
    () => validateImportedState({ workload: [], dataRequests: [forged] }),
    /Governed request DATA-FORGED is invalid/
  );
});

test('JSON import rejects automated or stale human decisions', () => {
  const approved = makeApprovedRequest('DATA-HUMAN');
  assert.throws(
    () => validateImportedState({
      workload: [],
      dataRequests: [{ ...approved, status: 'Submitted', humanApprovalMethod: 'Automated' }]
    }),
    /Only human approval is supported/
  );
  assert.throws(
    () => validateImportedState({
      workload: [],
      dataRequests: [{ ...approved, status: 'Submitted', humanDecisionVersion: 99 }]
    }),
    /incomplete or stale/
  );
});

test('JSON import accepts a coherent approved request and assigns schema version 2', () => {
  const state = validateImportedState({
    workload: [{ id: 'DEM-1', status: 'New' }],
    dataRequests: [makeApprovedRequest('DATA-APPROVED')]
  });
  assert.equal(state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(state.dataRequests[0].status, 'Approved');
});

test('legacy business validation is not silently trusted as human approval', () => {
  const legacy = {
    ...validDetails,
    id: 'DATA-LEGACY',
    status: 'Submitted',
    businessPurpose: validDetails.useCaseDescription,
    authoritativeSource: validDetails.goldenSourceApplication,
    businessValidation: 'Validated',
    architectureStatus: 'Pending'
  };
  delete legacy.useCaseDescription;
  delete legacy.goldenSourceApplication;
  const state = validateImportedState({ workload: [], dataRequests: [legacy] });
  assert.equal(state.dataRequests[0].humanApprovalStatus, 'Pending');
  assert.equal(state.dataRequests[0].useCaseDescription, validDetails.useCaseDescription);
});
