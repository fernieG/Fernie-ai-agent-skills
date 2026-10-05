import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_SCHEMA_VERSION,
  createId,
  resolveReferenceFacts,
  needsArchitectureReview,
  missingDataRequestFields,
  invalidControlledValues,
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

const referenceData = {
  version: 'test-reference-v1',
  dataAuthorities: [
    { dataElement: 'Risk flag', goldenSourceApplication: 'Golden Source App' }
  ],
  knownApplications: ['Golden Source App', 'Consumer App'],
  knownFlows: [
    {
      sourceApplication: 'Golden Source App',
      consumerApplication: 'Consumer App',
      dataElement: 'Risk flag',
      interfaceType: 'File'
    }
  ]
};

const validDetails = {
  received: '2026-10-05',
  requester: 'Team A',
  sourceApplication: 'Golden Source App',
  consumerApplication: 'Consumer App',
  dataElement: 'Risk flag',
  expectedDefinition: 'Indicator used to flag a material deterioration of risk.',
  useCaseDescription: 'Daily portfolio monitoring and exception handling.',
  frequency: 'Daily',
  interfaceType: 'API',
  criticality: 'High'
};

function makeApprovedRequest(id = 'DATA-20261005-001', refs = referenceData) {
  let request = initialiseDataRequest(validDetails, id, refs);
  request = applyArchitectureDecision(request, {
    status: 'Validated',
    actor: 'Architecture Reviewer',
    at: '2026-10-05T08:00:00Z',
    comment: 'Flow pattern validated.'
  }, refs);
  request = applyHumanDecision(request, {
    status: 'Approved',
    actor: 'Human Data Owner',
    at: '2026-10-05T08:05:00Z',
    comment: 'Use case authorised.'
  }, refs);
  return request;
}

test('createId builds stable date-based identifiers', () => {
  assert.equal(createId('DEM', new Date('2026-09-30T10:00:00Z'), 7), 'DEM-20260930-007');
});

test('golden source comes from reference data, not the request', () => {
  const request = { ...validDetails, goldenSourceApplication: 'Attacker Selected App' };
  const facts = resolveReferenceFacts(request, referenceData);
  assert.equal(facts.goldenSourceApplication, 'Golden Source App');
  assert.equal(goldenSourcePolicy(request, referenceData).eligible, true);
});

test('a requester cannot make a replica authoritative by self-declaration', () => {
  const request = {
    ...validDetails,
    sourceApplication: 'Replica App',
    goldenSourceApplication: 'Replica App'
  };
  const policy = goldenSourcePolicy(request, referenceData);
  assert.equal(policy.eligible, false);
  assert.equal(policy.goldenSourceApplication, 'Golden Source App');
  assert.match(policy.reason, /not its golden source/);
});

test('unknown data authority blocks approval instead of trusting a declaration', () => {
  const request = initialiseDataRequest({
    ...validDetails,
    dataElement: 'Unknown governed datum',
    goldenSourceApplication: 'Golden Source App'
  }, 'DATA-UNKNOWN', referenceData);
  const policy = goldenSourcePolicy(request, referenceData);
  assert.equal(policy.resolved, false);
  assert.equal(policy.eligible, false);
  assert.equal(request.status, 'Information required');
});

test('architecture triggers are derived from reference data rather than request checkboxes', () => {
  const request = {
    ...validDetails,
    newFlow: false,
    newConsumer: false,
    flowChanged: false
  };
  const facts = resolveReferenceFacts(request, referenceData);
  assert.equal(facts.newFlow, false);
  assert.equal(facts.newConsumer, false);
  assert.equal(facts.flowChanged, true);
  assert.equal(needsArchitectureReview(request, referenceData), true);
});

test('new consumer is detected from the application catalogue', () => {
  const request = { ...validDetails, consumerApplication: 'Unknown Consumer', interfaceType: 'File' };
  const facts = resolveReferenceFacts(request, referenceData);
  assert.equal(facts.newConsumer, true);
  assert.equal(needsArchitectureReview(request, referenceData), true);
});

test('new flow is detected from the architecture flow registry', () => {
  const refs = { ...referenceData, knownFlows: [] };
  assert.equal(resolveReferenceFacts(validDetails, refs).newFlow, true);
  assert.equal(needsArchitectureReview(validDetails, refs), true);
});

test('use case must be present and substantive', () => {
  const empty = missingDataRequestFields({ ...validDetails, useCaseDescription: '' });
  assert.ok(empty.includes('Use case description'));
  const trivial = missingDataRequestFields({ ...validDetails, useCaseDescription: 'x' });
  assert.ok(trivial.some((item) => item.includes('at least 20 characters')));
});

test('controlled enums reject values that could bypass exact trigger matching', () => {
  assert.deepEqual(invalidControlledValues({ ...validDetails, criticality: 'critical' }), ['Criticality']);
  assert.deepEqual(invalidControlledValues({ ...validDetails, interfaceType: 'api' }), ['Expected interface']);
});

test('a request cannot be approved without a named, dated human decision', () => {
  let request = initialiseDataRequest(validDetails, 'DATA-1', referenceData);
  request = applyArchitectureDecision(request, {
    status: 'Validated', actor: 'Architect', at: '2026-10-05T08:00:00Z'
  }, referenceData);
  const control = canApproveDataRequest(request, referenceData);
  assert.equal(control.ok, false);
  assert.match(control.reason, /human approval/);
});

test('human approval cannot override the authoritative golden-source policy', () => {
  const request = initialiseDataRequest({ ...validDetails, sourceApplication: 'Replica App' }, 'DATA-2', referenceData);
  assert.throws(
    () => applyHumanDecision(request, { status: 'Approved', actor: 'Data Owner' }, referenceData),
    /not its golden source/
  );
  assert.equal(deriveDataRequestStatus(request, referenceData), 'Rejected');
});

test('human approval waits for architecture when an authoritative trigger applies', () => {
  let request = initialiseDataRequest(validDetails, 'DATA-3', referenceData);
  request = applyHumanDecision(request, {
    status: 'Approved', actor: 'Data Owner', at: '2026-10-05T08:00:00Z'
  }, referenceData);
  assert.equal(request.status, 'Architecture review');
  assert.equal(canApproveDataRequest(request, referenceData).ok, false);
});

test('current human and architecture decisions produce an approved request', () => {
  const request = makeApprovedRequest();
  assert.equal(request.status, 'Approved');
  assert.equal(request.humanApprovalMethod, 'Human');
  assert.equal(canApproveDataRequest(request, referenceData).ok, true);
});

test('requester is governed and changing it invalidates prior decisions', () => {
  const approved = makeApprovedRequest();
  const updated = updateDataRequest(approved, { requester: 'Different Team' }, referenceData);
  assert.equal(updated.version, 2);
  assert.equal(updated.humanApprovalStatus, 'Pending');
  assert.notEqual(updated.status, 'Approved');
});

test('editing any governed business field invalidates both decisions', () => {
  const approved = makeApprovedRequest();
  const updated = updateDataRequest(approved, {
    useCaseDescription: 'A materially different use case for another process.'
  }, referenceData);
  assert.equal(updated.version, 2);
  assert.equal(updated.humanApprovalStatus, 'Pending');
  assert.equal(updated.architectureStatus, 'Pending');
  assert.equal(updated.humanReferenceSignature, '');
  assert.equal(updated.architectureReferenceSignature, '');
});

test('non-governed received-date edit does not invalidate current decisions', () => {
  const approved = makeApprovedRequest();
  const updated = updateDataRequest(approved, { received: '2026-10-06' }, referenceData);
  assert.equal(updated.version, 1);
  assert.equal(updated.status, 'Approved');
});

test('self-declared control fields are stripped from initialized and updated requests', () => {
  const request = initialiseDataRequest({
    ...validDetails,
    goldenSourceApplication: 'Fake',
    newFlow: false,
    flowChanged: false,
    newConsumer: false
  }, 'DATA-STRIP', referenceData);
  assert.equal('goldenSourceApplication' in request, false);
  assert.equal('newFlow' in request, false);
  const updated = updateDataRequest(request, {
    goldenSourceApplication: 'Still Fake', newFlow: false
  }, referenceData);
  assert.equal('goldenSourceApplication' in updated, false);
  assert.equal('newFlow' in updated, false);
});

test('reference-data changes invalidate decisions even when request version is unchanged', () => {
  const approved = makeApprovedRequest();
  const changedReferences = {
    ...referenceData,
    version: 'test-reference-v2',
    knownFlows: [{ ...referenceData.knownFlows[0], interfaceType: 'API' }]
  };
  assert.equal(approved.version, 1);
  assert.equal(canApproveDataRequest(approved, changedReferences).ok, false);
});

test('Implemented and Closed cannot bypass approval controls', () => {
  const submitted = initialiseDataRequest(validDetails, 'DATA-5', referenceData);
  assert.throws(() => transitionDataRequest(submitted, 'Implemented', referenceData), /human approval/);
  const approved = makeApprovedRequest('DATA-6');
  const implemented = transitionDataRequest(approved, 'Implemented', referenceData);
  assert.equal(implemented.status, 'Implemented');
  const closed = transitionDataRequest(implemented, 'Closed', referenceData);
  assert.equal(closed.status, 'Closed');
});

test('approved-flow view rechecks controls and authoritative reference facts', () => {
  const forged = {
    ...initialiseDataRequest(validDetails, 'DATA-FORGED', referenceData),
    status: 'Implemented'
  };
  assert.equal(approvedFlows([forged], referenceData).length, 0);
  const flows = approvedFlows([makeApprovedRequest('DATA-VALID')], referenceData);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].goldenSourceApplication, 'Golden Source App');
});

test('closed requests do not remain in architecture attention counter', () => {
  const implemented = transitionDataRequest(makeApprovedRequest(), 'Implemented', referenceData);
  const closed = transitionDataRequest(implemented, 'Closed', referenceData);
  assert.equal(dataRequestSummary([closed], referenceData).architectureReview, 0);
  assert.equal(dataRequestSummary([closed], referenceData).approved, 1);
});

test('workload summary separates open, blocked and awaiting prioritisation', () => {
  const summary = workloadSummary([
    { status: 'In progress' },
    { status: 'Awaiting prioritisation' },
    { status: 'Blocked' },
    { status: 'Done' }
  ]);
  assert.deepEqual(summary, {
    total: 4, open: 3, inProgress: 1, awaitingPriority: 1, blocked: 1
  });
});

test('nextSequence supports more than 999 records without a duplicate', () => {
  const date = new Date('2026-09-30T10:00:00Z');
  assert.equal(nextSequence([{ id: 'DEM-20260930-1000' }], 'DEM', date), 1001);
});

test('current JSON import rejects self-declared governance controls', () => {
  const approved = makeApprovedRequest('DATA-IMPORT');
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION,
      workload: [],
      dataRequests: [{ ...approved, goldenSourceApplication: 'Fake' }]
    }, referenceData),
    /Self-declared governance field/
  );
});

test('JSON import rejects forged governed states and invalid enums', () => {
  const forged = {
    ...initialiseDataRequest(validDetails, 'DATA-FORGED', referenceData),
    status: 'Implemented'
  };
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION, workload: [], dataRequests: [forged]
    }, referenceData),
    /Governed request DATA-FORGED is invalid/
  );
  const invalid = {
    ...initialiseDataRequest(validDetails, 'DATA-BAD-ENUM', referenceData),
    interfaceType: 'api'
  };
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION, workload: [], dataRequests: [invalid]
    }, referenceData),
    /Invalid controlled value/
  );
});

test('JSON import rejects automated, stale or reference-mismatched human decisions', () => {
  const approved = makeApprovedRequest('DATA-HUMAN');
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION,
      workload: [],
      dataRequests: [{ ...approved, status: 'Submitted', humanApprovalMethod: 'Automated' }]
    }, referenceData),
    /Only human approval is supported/
  );
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION,
      workload: [],
      dataRequests: [{ ...approved, status: 'Submitted', humanDecisionVersion: 99 }]
    }, referenceData),
    /incomplete, stale or bound to old reference facts/
  );
  assert.throws(
    () => validateImportedState({
      schemaVersion: STATE_SCHEMA_VERSION,
      workload: [],
      dataRequests: [{ ...approved, status: 'Submitted', humanReferenceSignature: 'forged' }]
    }, referenceData),
    /old reference facts/
  );
});

test('legacy backups are migrated without trusting old approvals or self-declared facts', () => {
  const legacy = {
    ...validDetails,
    id: 'DATA-LEGACY',
    version: 1,
    status: 'Approved',
    goldenSourceApplication: 'Golden Source App',
    newFlow: false,
    flowChanged: false,
    newConsumer: false,
    humanApprovalStatus: 'Approved',
    humanApprovalMethod: 'Human',
    humanApprover: 'Old Owner',
    humanDecisionAt: '2026-10-04T08:00:00Z',
    humanDecisionVersion: 1,
    architectureStatus: 'Validated',
    architectureReviewer: 'Old Architect',
    architectureDecisionAt: '2026-10-04T08:00:00Z',
    architectureDecisionVersion: 1
  };
  const state = validateImportedState({
    schemaVersion: 2, workload: [], dataRequests: [legacy]
  }, referenceData);
  assert.equal(state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(state.dataRequests[0].humanApprovalStatus, 'Pending');
  assert.equal(state.dataRequests[0].architectureStatus, 'Pending');
  assert.equal('goldenSourceApplication' in state.dataRequests[0], false);
  assert.notEqual(state.dataRequests[0].status, 'Approved');
});

test('coherent current approved request imports successfully', () => {
  const state = validateImportedState({
    schemaVersion: STATE_SCHEMA_VERSION,
    workload: [{ id: 'DEM-1', status: 'New' }],
    dataRequests: [makeApprovedRequest('DATA-APPROVED')]
  }, referenceData);
  assert.equal(state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(state.dataRequests[0].status, 'Approved');
});
