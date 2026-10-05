import { SYNTHETIC_REFERENCE_DATA } from './reference-data.mjs';

export const STATE_SCHEMA_VERSION = 3;

export const WORKLOAD_STATUSES = [
  'New',
  'Awaiting prioritisation',
  'Planned',
  'In progress',
  'Blocked',
  'Done',
  'Rejected'
];

export const DATA_REQUEST_STATUSES = [
  'Submitted',
  'Information required',
  'Architecture review',
  'Approved',
  'Implemented',
  'Closed',
  'Rejected'
];

export const HUMAN_APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'];
export const ARCHITECTURE_STATUSES = ['Not required', 'Pending', 'Validated', 'Rejected'];
export const GOVERNED_DATA_STATUSES = ['Approved', 'Implemented', 'Closed'];
export const FREQUENCIES = ['Real-time', 'Daily', 'Weekly', 'Monthly', 'Ad hoc'];
export const INTERFACE_TYPES = ['API', 'File', 'Database / view', 'Event / message', 'Manual', 'Unknown / to define'];
export const CRITICALITIES = ['Low', 'Medium', 'High', 'Critical'];

const REQUEST_INPUT_FIELDS = [
  'received',
  'requester',
  'sourceApplication',
  'consumerApplication',
  'dataElement',
  'expectedDefinition',
  'useCaseDescription',
  'frequency',
  'interfaceType',
  'criticality'
];

const GOVERNED_FIELDS = [
  'requester',
  'sourceApplication',
  'consumerApplication',
  'dataElement',
  'expectedDefinition',
  'useCaseDescription',
  'frequency',
  'interfaceType',
  'criticality'
];

const SELF_DECLARED_CONTROL_FIELDS = [
  'goldenSourceApplication',
  'authoritativeSource',
  'newFlow',
  'flowChanged',
  'newConsumer'
];

const MAX_SERIALISED_STATE_LENGTH = 2 * 1024 * 1024;
const MIN_USE_CASE_LENGTH = 20;

const DATA_STRING_FIELDS = [
  'id',
  'received',
  'requester',
  'sourceApplication',
  'consumerApplication',
  'dataElement',
  'expectedDefinition',
  'useCaseDescription',
  'frequency',
  'interfaceType',
  'criticality',
  'humanApprovalStatus',
  'humanApprovalMethod',
  'humanApprover',
  'humanDecisionAt',
  'humanApprovedAt',
  'humanApprovalComment',
  'humanReferenceSignature',
  'architectureStatus',
  'architectureReviewer',
  'architectureDecisionAt',
  'architectureComment',
  'architectureReferenceSignature',
  'status',
  'businessPurpose',
  'businessValidation'
];

function asText(value) {
  return value == null ? '' : String(value).trim();
}

function normalise(value) {
  return asText(value).replace(/\s+/g, ' ').toLocaleLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertDecisionActor(actor, label) {
  if (!asText(actor)) throw new Error(label + ' name is required.');
}

function pickRequestInput(input) {
  return Object.fromEntries(REQUEST_INPUT_FIELDS.map((field) => [field, input?.[field] ?? '']));
}

function preserveAdvancedLifecycle(previousStatus, derivedStatus) {
  if (derivedStatus === 'Approved' && ['Implemented', 'Closed'].includes(previousStatus)) {
    return previousStatus;
  }
  return derivedStatus;
}

function catalogueAuthority(dataElement, referenceData) {
  return (referenceData.dataAuthorities || []).find(
    (entry) => normalise(entry.dataElement) === normalise(dataElement)
  );
}

function catalogueFlow(request, referenceData) {
  return (referenceData.knownFlows || []).find((flow) =>
    normalise(flow.sourceApplication) === normalise(request.sourceApplication) &&
    normalise(flow.consumerApplication) === normalise(request.consumerApplication) &&
    normalise(flow.dataElement) === normalise(request.dataElement)
  );
}

export function createId(prefix, now = new Date(), sequence = 1) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return prefix + '-' + y + m + d + '-' + String(sequence).padStart(3, '0');
}

export function resolveReferenceFacts(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const authority = catalogueAuthority(request.dataElement, referenceData);
  const flow = catalogueFlow(request, referenceData);
  const knownConsumer = (referenceData.knownApplications || []).some(
    (application) => normalise(application) === normalise(request.consumerApplication)
  );
  const hasFlowIdentity = Boolean(
    asText(request.sourceApplication) && asText(request.consumerApplication) && asText(request.dataElement)
  );

  return {
    referenceVersion: asText(referenceData.version) || 'unversioned-reference',
    goldenSourceApplication: authority ? asText(authority.goldenSourceApplication) : '',
    authorityResolved: Boolean(authority),
    newConsumer: Boolean(asText(request.consumerApplication)) && !knownConsumer,
    newFlow: hasFlowIdentity && !flow,
    flowChanged: Boolean(
      flow && asText(request.interfaceType) && normalise(flow.interfaceType) !== normalise(request.interfaceType)
    )
  };
}

export function referenceFactsSignature(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const facts = resolveReferenceFacts(request, referenceData);
  return JSON.stringify([
    facts.referenceVersion,
    normalise(facts.goldenSourceApplication),
    facts.authorityResolved,
    facts.newConsumer,
    facts.newFlow,
    facts.flowChanged
  ]);
}

export function needsArchitectureReview(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const facts = resolveReferenceFacts(request, referenceData);
  return Boolean(
    facts.newFlow ||
    facts.flowChanged ||
    facts.newConsumer ||
    request.interfaceType === 'Unknown / to define' ||
    request.criticality === 'Critical'
  );
}

export function missingDataRequestFields(request) {
  const useCaseDescription = request.useCaseDescription ?? request.businessPurpose;
  const required = [
    [request.received, 'Received date'],
    [request.requester, 'Requester / team'],
    [request.sourceApplication, 'Application exposing the data'],
    [request.consumerApplication, 'Consuming application'],
    [request.dataElement, 'Requested data'],
    [request.expectedDefinition, 'Expected business definition'],
    [useCaseDescription, 'Use case description'],
    [request.frequency, 'Frequency'],
    [request.interfaceType, 'Expected interface'],
    [request.criticality, 'Criticality']
  ];
  const missing = required.filter(([value]) => !asText(value)).map(([, label]) => label);
  if (asText(useCaseDescription) && asText(useCaseDescription).length < MIN_USE_CASE_LENGTH) {
    missing.push('Use case description must contain at least ' + MIN_USE_CASE_LENGTH + ' characters');
  }
  return missing;
}

export function invalidControlledValues(request) {
  const invalid = [];
  if (asText(request.frequency) && !FREQUENCIES.includes(request.frequency)) invalid.push('Frequency');
  if (asText(request.interfaceType) && !INTERFACE_TYPES.includes(request.interfaceType)) invalid.push('Expected interface');
  if (asText(request.criticality) && !CRITICALITIES.includes(request.criticality)) invalid.push('Criticality');
  return invalid;
}

export function goldenSourcePolicy(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const sourceApplication = asText(request.sourceApplication);
  const facts = resolveReferenceFacts(request, referenceData);

  if (!facts.authorityResolved) {
    return {
      resolved: false,
      eligible: false,
      apiPublicationAllowed: false,
      goldenSourceApplication: '',
      reason:
        'Approval is blocked: the authoritative reference catalogue has no golden-source record for ' +
        (asText(request.dataElement) || 'this data element') + '.'
    };
  }

  if (normalise(sourceApplication) !== normalise(facts.goldenSourceApplication)) {
    return {
      resolved: true,
      eligible: false,
      apiPublicationAllowed: false,
      goldenSourceApplication: facts.goldenSourceApplication,
      reason:
        'Consumption is refused: ' + sourceApplication +
        ' stores or exposes the data but is not its golden source. Request the data from ' +
        facts.goldenSourceApplication + '.'
    };
  }

  return {
    resolved: true,
    eligible: true,
    apiPublicationAllowed: request.interfaceType === 'API',
    goldenSourceApplication: facts.goldenSourceApplication,
    reason: request.interfaceType === 'API'
      ? 'API publication is eligible because the authoritative reference catalogue identifies the exposing application as golden source.'
      : 'Consumption is eligible because the authoritative reference catalogue identifies the exposing application as golden source.'
  };
}

export function governedContentSignature(request) {
  return JSON.stringify(GOVERNED_FIELDS.map((field) => asText(request[field])));
}

export function isHumanApprovalCurrent(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  return Boolean(
    request.humanApprovalStatus === 'Approved' &&
    request.humanApprovalMethod === 'Human' &&
    asText(request.humanApprover) &&
    asText(request.humanDecisionAt ?? request.humanApprovedAt) &&
    Number(request.humanDecisionVersion ?? request.humanApprovalVersion) === Number(request.version) &&
    asText(request.humanReferenceSignature) === referenceFactsSignature(request, referenceData)
  );
}

export function isArchitectureValidationCurrent(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (request.architectureStatus === 'Rejected') return false;
  if (!needsArchitectureReview(request, referenceData)) return request.architectureStatus === 'Not required';
  return Boolean(
    request.architectureStatus === 'Validated' &&
    asText(request.architectureReviewer) &&
    asText(request.architectureDecisionAt) &&
    Number(request.architectureDecisionVersion) === Number(request.version) &&
    asText(request.architectureReferenceSignature) === referenceFactsSignature(request, referenceData)
  );
}

export function canApproveDataRequest(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const missing = missingDataRequestFields(request);
  if (missing.length) {
    return { ok: false, reason: 'Missing or insufficient information: ' + missing.join(', ') };
  }

  const invalid = invalidControlledValues(request);
  if (invalid.length) {
    return { ok: false, reason: 'Invalid controlled value: ' + invalid.join(', ') };
  }

  const sourcePolicy = goldenSourcePolicy(request, referenceData);
  if (!sourcePolicy.eligible) return { ok: false, reason: sourcePolicy.reason };

  if (request.humanApprovalStatus === 'Rejected') {
    return { ok: false, reason: 'Human data-consumption approval was rejected.' };
  }
  if (!isHumanApprovalCurrent(request, referenceData)) {
    return {
      ok: false,
      reason: 'A current, named and dated human approval bound to the current reference facts is required.'
    };
  }

  if (request.architectureStatus === 'Rejected') {
    return { ok: false, reason: 'Architecture rejected this data flow.' };
  }
  if (needsArchitectureReview(request, referenceData) && !isArchitectureValidationCurrent(request, referenceData)) {
    return { ok: false, reason: 'Current architecture validation is required before approval.' };
  }

  return { ok: true, reason: '' };
}

export function deriveDataRequestStatus(request, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (missingDataRequestFields(request).length || invalidControlledValues(request).length) {
    return 'Information required';
  }
  const policy = goldenSourcePolicy(request, referenceData);
  if (!policy.resolved) return 'Information required';
  if (!policy.eligible) return 'Rejected';
  if (request.humanApprovalStatus === 'Rejected' || request.architectureStatus === 'Rejected') {
    return 'Rejected';
  }
  if (!isHumanApprovalCurrent(request, referenceData)) return 'Submitted';
  if (needsArchitectureReview(request, referenceData) && !isArchitectureValidationCurrent(request, referenceData)) {
    return 'Architecture review';
  }
  return 'Approved';
}

export function initialiseDataRequest(input, id, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const request = {
    ...pickRequestInput(input),
    id,
    version: 1,
    humanApprovalStatus: 'Pending',
    humanApprovalMethod: '',
    humanApprover: '',
    humanDecisionAt: '',
    humanApprovalComment: '',
    humanDecisionVersion: null,
    humanReferenceSignature: '',
    architectureStatus: needsArchitectureReview(input, referenceData) ? 'Pending' : 'Not required',
    architectureReviewer: '',
    architectureDecisionAt: '',
    architectureComment: '',
    architectureDecisionVersion: null,
    architectureReferenceSignature: '',
    status: 'Submitted'
  };
  request.status = deriveDataRequestStatus(request, referenceData);
  return request;
}

export function updateDataRequest(existing, changes, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const before = governedContentSignature(existing);
  const request = { ...existing, ...pickRequestInput({ ...existing, ...changes }), id: existing.id };
  for (const field of SELF_DECLARED_CONTROL_FIELDS) delete request[field];
  const changed = before !== governedContentSignature(request);

  if (changed) {
    request.version = Number(existing.version || 1) + 1;
    request.humanApprovalStatus = 'Pending';
    request.humanApprovalMethod = '';
    request.humanApprover = '';
    request.humanDecisionAt = '';
    request.humanApprovalComment = '';
    request.humanDecisionVersion = null;
    request.humanReferenceSignature = '';
    request.architectureStatus = needsArchitectureReview(request, referenceData) ? 'Pending' : 'Not required';
    request.architectureReviewer = '';
    request.architectureDecisionAt = '';
    request.architectureComment = '';
    request.architectureDecisionVersion = null;
    request.architectureReferenceSignature = '';
  }

  request.status = preserveAdvancedLifecycle(existing.status, deriveDataRequestStatus(request, referenceData));
  return request;
}

export function applyHumanDecision(request, decision, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (!['Approved', 'Rejected'].includes(decision.status)) {
    throw new Error('Human decision must be Approved or Rejected.');
  }
  assertDecisionActor(decision.actor, 'Human approver');

  if (decision.status === 'Approved') {
    const missing = missingDataRequestFields(request);
    if (missing.length) throw new Error('Complete the request before human approval: ' + missing.join(', '));
    const invalid = invalidControlledValues(request);
    if (invalid.length) throw new Error('Correct controlled values before human approval: ' + invalid.join(', '));
    const sourcePolicy = goldenSourcePolicy(request, referenceData);
    if (!sourcePolicy.eligible) throw new Error(sourcePolicy.reason);
  }

  const updated = {
    ...request,
    humanApprovalStatus: decision.status,
    humanApprovalMethod: 'Human',
    humanApprover: asText(decision.actor),
    humanDecisionAt: decision.at || new Date().toISOString(),
    humanApprovalComment: asText(decision.comment),
    humanDecisionVersion: Number(request.version),
    humanReferenceSignature: referenceFactsSignature(request, referenceData)
  };
  updated.status = preserveAdvancedLifecycle(request.status, deriveDataRequestStatus(updated, referenceData));
  return updated;
}

export function applyArchitectureDecision(request, decision, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (!needsArchitectureReview(request, referenceData)) {
    throw new Error('Architecture review is not required for this request.');
  }
  if (!['Validated', 'Rejected'].includes(decision.status)) {
    throw new Error('Architecture decision must be Validated or Rejected.');
  }
  assertDecisionActor(decision.actor, 'Architecture reviewer');

  const updated = {
    ...request,
    architectureStatus: decision.status,
    architectureReviewer: asText(decision.actor),
    architectureDecisionAt: decision.at || new Date().toISOString(),
    architectureComment: asText(decision.comment),
    architectureDecisionVersion: Number(request.version),
    architectureReferenceSignature: referenceFactsSignature(request, referenceData)
  };
  updated.status = preserveAdvancedLifecycle(request.status, deriveDataRequestStatus(updated, referenceData));
  return updated;
}

export function transitionDataRequest(request, targetStatus, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (!['Implemented', 'Closed'].includes(targetStatus)) {
    throw new Error('Unsupported lifecycle transition.');
  }
  const control = canApproveDataRequest(request, referenceData);
  if (!control.ok) throw new Error(control.reason);
  if (targetStatus === 'Implemented' && request.status !== 'Approved') {
    throw new Error('Only an approved request can be marked Implemented.');
  }
  if (targetStatus === 'Closed' && request.status !== 'Implemented') {
    throw new Error('Only an implemented request can be closed.');
  }
  return { ...request, status: targetStatus };
}

export function workloadSummary(items) {
  const open = items.filter((item) => !['Done', 'Rejected'].includes(item.status));
  return {
    total: items.length,
    open: open.length,
    inProgress: items.filter((item) => item.status === 'In progress').length,
    awaitingPriority: items.filter((item) => item.status === 'Awaiting prioritisation').length,
    blocked: items.filter((item) => item.status === 'Blocked').length
  };
}

export function dataRequestSummary(items, referenceData = SYNTHETIC_REFERENCE_DATA) {
  const open = items.filter((item) => !['Closed', 'Rejected'].includes(item.status));
  return {
    total: items.length,
    open: open.length,
    informationRequired: items.filter((item) => item.status === 'Information required').length,
    architectureReview: open.filter(
      (item) => needsArchitectureReview(item, referenceData) && !isArchitectureValidationCurrent(item, referenceData)
    ).length,
    approved: items.filter(
      (item) => GOVERNED_DATA_STATUSES.includes(item.status) && canApproveDataRequest(item, referenceData).ok
    ).length,
    policyRejected: items.filter(
      (item) => item.status === 'Rejected' && goldenSourcePolicy(item, referenceData).resolved &&
        !goldenSourcePolicy(item, referenceData).eligible
    ).length
  };
}

export function approvedFlows(requests, referenceData = SYNTHETIC_REFERENCE_DATA) {
  return requests
    .filter(
      (request) => GOVERNED_DATA_STATUSES.includes(request.status) &&
        canApproveDataRequest(request, referenceData).ok
    )
    .map((request) => {
      const policy = goldenSourcePolicy(request, referenceData);
      return {
        id: request.id,
        sourceApplication: request.sourceApplication,
        consumerApplication: request.consumerApplication,
        dataElement: request.dataElement,
        useCaseDescription: request.useCaseDescription ?? request.businessPurpose,
        interfaceType: request.interfaceType,
        frequency: request.frequency,
        goldenSourceApplication: policy.goldenSourceApplication,
        humanApprover: request.humanApprover,
        humanDecisionAt: request.humanDecisionAt ?? request.humanApprovedAt,
        architectureStatus: request.architectureStatus,
        status: request.status
      };
    });
}

export function nextSequence(existing, prefix, date = new Date()) {
  const dateStem = createId(prefix, date, 1).replace(/\d{3}$/, '');
  const numbers = existing
    .map((item) => asText(item.id))
    .filter((id) => id.startsWith(dateStem))
    .map((id) => Number(id.slice(dateStem.length)))
    .filter((value) => Number.isInteger(value) && value > 0);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function normaliseImportedDataRequest(raw, migrateLegacy, referenceData) {
  const input = pickRequestInput({
    ...raw,
    useCaseDescription: raw.useCaseDescription ?? raw.businessPurpose ?? ''
  });
  const base = {
    ...input,
    id: raw.id,
    version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1
  };

  if (migrateLegacy) {
    return {
      ...base,
      humanApprovalStatus: 'Pending',
      humanApprovalMethod: '',
      humanApprover: '',
      humanDecisionAt: '',
      humanApprovalComment: '',
      humanDecisionVersion: null,
      humanReferenceSignature: '',
      architectureStatus: needsArchitectureReview(base, referenceData) ? 'Pending' : 'Not required',
      architectureReviewer: '',
      architectureDecisionAt: '',
      architectureComment: '',
      architectureDecisionVersion: null,
      architectureReferenceSignature: '',
      status: deriveDataRequestStatus({
        ...base,
        humanApprovalStatus: 'Pending',
        humanApprovalMethod: '',
        humanApprover: '',
        humanDecisionAt: '',
        humanDecisionVersion: null,
        humanReferenceSignature: '',
        architectureStatus: needsArchitectureReview(base, referenceData) ? 'Pending' : 'Not required',
        architectureReviewer: '',
        architectureDecisionAt: '',
        architectureDecisionVersion: null,
        architectureReferenceSignature: ''
      }, referenceData)
    };
  }

  return {
    ...base,
    humanApprovalStatus: raw.humanApprovalStatus ?? 'Pending',
    humanApprovalMethod: raw.humanApprovalMethod ?? '',
    humanApprover: raw.humanApprover ?? '',
    humanDecisionAt: raw.humanDecisionAt ?? raw.humanApprovedAt ?? '',
    humanApprovalComment: raw.humanApprovalComment ?? '',
    humanDecisionVersion: raw.humanDecisionVersion ?? raw.humanApprovalVersion ?? null,
    humanReferenceSignature: raw.humanReferenceSignature ?? '',
    architectureStatus: raw.architectureStatus ?? (needsArchitectureReview(base, referenceData) ? 'Pending' : 'Not required'),
    architectureReviewer: raw.architectureReviewer ?? '',
    architectureDecisionAt: raw.architectureDecisionAt ?? '',
    architectureComment: raw.architectureComment ?? '',
    architectureDecisionVersion: raw.architectureDecisionVersion ?? null,
    architectureReferenceSignature: raw.architectureReferenceSignature ?? '',
    status: raw.status ?? 'Submitted'
  };
}

export function validateImportedState(candidate, referenceData = SYNTHETIC_REFERENCE_DATA) {
  if (!isPlainObject(candidate)) throw new Error('Backup must contain a JSON object.');
  if (JSON.stringify(candidate).length > MAX_SERIALISED_STATE_LENGTH) {
    throw new Error('Backup exceeds the 2 MB safety limit.');
  }
  if (!Array.isArray(candidate.workload) || !Array.isArray(candidate.dataRequests)) {
    throw new Error('Backup must contain workload and dataRequests arrays.');
  }
  if (candidate.workload.length > 5000 || candidate.dataRequests.length > 5000) {
    throw new Error('Backup exceeds the 5,000-record safety limit.');
  }

  const migrateLegacy = Number(candidate.schemaVersion || 0) < STATE_SCHEMA_VERSION;

  candidate.workload.forEach((item, index) => {
    if (!isPlainObject(item)) throw new Error('Invalid workload record at index ' + index + '.');
    if (!asText(item.id)) throw new Error('Workload record at index ' + index + ' has no ID.');
    if (item.status && !WORKLOAD_STATUSES.includes(item.status)) {
      throw new Error('Invalid workload status for ' + item.id + '.');
    }
  });

  const dataRequests = candidate.dataRequests.map((raw, index) => {
    if (!isPlainObject(raw)) throw new Error('Invalid data request at index ' + index + '.');

    if (!migrateLegacy) {
      for (const field of SELF_DECLARED_CONTROL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(raw, field)) {
          throw new Error('Self-declared governance field ' + field + ' is not allowed for current backups.');
        }
      }
    }

    for (const field of DATA_STRING_FIELDS) {
      if (raw[field] != null && typeof raw[field] !== 'string') {
        throw new Error('Field ' + field + ' must be text at data request index ' + index + '.');
      }
    }
    for (const field of ['version', 'humanDecisionVersion', 'humanApprovalVersion', 'architectureDecisionVersion']) {
      if (raw[field] != null && (!Number.isInteger(raw[field]) || raw[field] < 1)) {
        throw new Error('Field ' + field + ' must be a positive integer at data request index ' + index + '.');
      }
    }

    const request = normaliseImportedDataRequest(raw, migrateLegacy, referenceData);
    if (!asText(request.id)) throw new Error('Data request at index ' + index + ' has no ID.');

    const invalid = invalidControlledValues(request);
    if (invalid.length) throw new Error('Invalid controlled value for ' + request.id + ': ' + invalid.join(', ') + '.');

    if (!DATA_REQUEST_STATUSES.includes(request.status)) {
      throw new Error('Invalid data request status for ' + request.id + '.');
    }
    if (!HUMAN_APPROVAL_STATUSES.includes(request.humanApprovalStatus)) {
      throw new Error('Invalid human approval status for ' + request.id + '.');
    }
    if (request.humanApprovalMethod && request.humanApprovalMethod !== 'Human') {
      throw new Error('Only human approval is supported for ' + request.id + '.');
    }
    if (request.humanApprovalStatus !== 'Pending' && (
      request.humanApprovalMethod !== 'Human' ||
      !asText(request.humanApprover) ||
      !asText(request.humanDecisionAt) ||
      Number(request.humanDecisionVersion) !== Number(request.version) ||
      asText(request.humanReferenceSignature) !== referenceFactsSignature(request, referenceData)
    )) {
      throw new Error('Human decision evidence is incomplete, stale or bound to old reference facts for ' + request.id + '.');
    }
    if (!ARCHITECTURE_STATUSES.includes(request.architectureStatus)) {
      throw new Error('Invalid architecture status for ' + request.id + '.');
    }

    const architectureRequired = needsArchitectureReview(request, referenceData);
    if (architectureRequired && request.architectureStatus === 'Not required') {
      throw new Error('Architecture review is required for ' + request.id + '.');
    }
    if (!architectureRequired && !['Not required', 'Rejected'].includes(request.architectureStatus)) {
      throw new Error('Architecture status is inconsistent with authoritative reference facts for ' + request.id + '.');
    }
    if (request.architectureStatus === 'Validated' && (
      !asText(request.architectureReviewer) ||
      !asText(request.architectureDecisionAt) ||
      Number(request.architectureDecisionVersion) !== Number(request.version) ||
      asText(request.architectureReferenceSignature) !== referenceFactsSignature(request, referenceData)
    )) {
      throw new Error('Architecture decision evidence is incomplete, stale or bound to old reference facts for ' + request.id + '.');
    }

    if (GOVERNED_DATA_STATUSES.includes(request.status)) {
      const control = canApproveDataRequest(request, referenceData);
      if (!control.ok) {
        throw new Error('Governed request ' + request.id + ' is invalid: ' + control.reason);
      }
    }
    return request;
  });

  const allIds = [...candidate.workload, ...dataRequests].map((item) => asText(item.id));
  if (new Set(allIds).size !== allIds.length) throw new Error('Backup contains duplicate IDs.');

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    workload: candidate.workload.map((item) => ({ ...item })),
    dataRequests
  };
}
