export const STATE_SCHEMA_VERSION = 2;

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

const GOVERNED_FIELDS = [
  'sourceApplication',
  'consumerApplication',
  'dataElement',
  'expectedDefinition',
  'useCaseDescription',
  'frequency',
  'interfaceType',
  'criticality',
  'goldenSourceApplication',
  'newFlow',
  'flowChanged',
  'newConsumer'
];

const MAX_SERIALISED_STATE_LENGTH = 2 * 1024 * 1024;

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
  'goldenSourceApplication',
  'humanApprovalStatus',
  'humanApprovalMethod',
  'humanApprover',
  'humanDecisionAt',
  'humanApprovedAt',
  'humanApprovalComment',
  'architectureStatus',
  'architectureReviewer',
  'architectureDecisionAt',
  'architectureComment',
  'status',
  'businessPurpose',
  'authoritativeSource',
  'businessValidation'
];

function asText(value) {
  return value == null ? '' : String(value).trim();
}

function normaliseApplication(value) {
  return asText(value).replace(/\s+/g, ' ').toLocaleLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertDecisionActor(actor, label) {
  if (!asText(actor)) throw new Error(label + ' name is required.');
}

function preserveAdvancedLifecycle(previousStatus, derivedStatus) {
  if (derivedStatus === 'Approved' && ['Implemented', 'Closed'].includes(previousStatus)) {
    return previousStatus;
  }
  return derivedStatus;
}

export function createId(prefix, now = new Date(), sequence = 1) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return prefix + '-' + y + m + d + '-' + String(sequence).padStart(3, '0');
}

export function needsArchitectureReview(request) {
  return Boolean(
    request.newFlow === true ||
    request.flowChanged === true ||
    request.newConsumer === true ||
    request.interfaceType === 'Unknown / to define' ||
    request.criticality === 'Critical'
  );
}

export function missingDataRequestFields(request) {
  const useCaseDescription = request.useCaseDescription ?? request.businessPurpose;
  const goldenSourceApplication = request.goldenSourceApplication ?? request.authoritativeSource;
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
    [request.criticality, 'Criticality'],
    [goldenSourceApplication, 'Golden source application']
  ];
  return required.filter(([value]) => !asText(value)).map(([, label]) => label);
}

export function goldenSourcePolicy(request) {
  const sourceApplication = asText(request.sourceApplication);
  const goldenSourceApplication = asText(
    request.goldenSourceApplication ?? request.authoritativeSource
  );

  if (!goldenSourceApplication) {
    return {
      eligible: false,
      apiPublicationAllowed: false,
      reason: 'The golden source application must be identified.'
    };
  }

  if (normaliseApplication(sourceApplication) !== normaliseApplication(goldenSourceApplication)) {
    return {
      eligible: false,
      apiPublicationAllowed: false,
      reason:
        'Consumption is refused: ' + sourceApplication +
        ' stores the data but is not its golden source. Request the data from ' +
        goldenSourceApplication + '.'
    };
  }

  return {
    eligible: true,
    apiPublicationAllowed: request.interfaceType === 'API',
    reason: request.interfaceType === 'API'
      ? 'API publication is eligible because the exposing application is the golden source.'
      : 'Consumption is eligible because the exposing application is the golden source.'
  };
}

export function governedContentSignature(request) {
  return JSON.stringify(GOVERNED_FIELDS.map((field) => {
    const value = request[field];
    return typeof value === 'boolean' ? value : asText(value);
  }));
}

export function isHumanApprovalCurrent(request) {
  return Boolean(
    request.humanApprovalStatus === 'Approved' &&
    request.humanApprovalMethod === 'Human' &&
    asText(request.humanApprover) &&
    asText(request.humanDecisionAt ?? request.humanApprovedAt) &&
    Number(request.humanDecisionVersion ?? request.humanApprovalVersion) === Number(request.version)
  );
}

export function isArchitectureValidationCurrent(request) {
  if (request.architectureStatus === 'Rejected') return false;
  if (!needsArchitectureReview(request)) return request.architectureStatus === 'Not required';
  return Boolean(
    request.architectureStatus === 'Validated' &&
    asText(request.architectureReviewer) &&
    asText(request.architectureDecisionAt) &&
    Number(request.architectureDecisionVersion) === Number(request.version)
  );
}

export function canApproveDataRequest(request) {
  const missing = missingDataRequestFields(request);
  if (missing.length) {
    return { ok: false, reason: 'Missing required information: ' + missing.join(', ') };
  }

  const sourcePolicy = goldenSourcePolicy(request);
  if (!sourcePolicy.eligible) return { ok: false, reason: sourcePolicy.reason };

  if (request.humanApprovalStatus === 'Rejected') {
    return { ok: false, reason: 'Human data-consumption approval was rejected.' };
  }
  if (!isHumanApprovalCurrent(request)) {
    return {
      ok: false,
      reason: 'A current, named and dated human approval is required for this use case.'
    };
  }

  if (request.architectureStatus === 'Rejected') {
    return { ok: false, reason: 'Architecture rejected this data flow.' };
  }
  if (needsArchitectureReview(request) && !isArchitectureValidationCurrent(request)) {
    return { ok: false, reason: 'Current architecture validation is required before approval.' };
  }

  return { ok: true, reason: '' };
}

export function deriveDataRequestStatus(request) {
  if (missingDataRequestFields(request).length) return 'Information required';
  if (!goldenSourcePolicy(request).eligible) return 'Rejected';
  if (request.humanApprovalStatus === 'Rejected' || request.architectureStatus === 'Rejected') {
    return 'Rejected';
  }
  if (!isHumanApprovalCurrent(request)) return 'Submitted';
  if (needsArchitectureReview(request) && !isArchitectureValidationCurrent(request)) {
    return 'Architecture review';
  }
  return 'Approved';
}

export function initialiseDataRequest(input, id) {
  const request = {
    ...input,
    id,
    version: 1,
    humanApprovalStatus: 'Pending',
    humanApprovalMethod: '',
    humanApprover: '',
    humanDecisionAt: '',
    humanApprovalComment: '',
    humanDecisionVersion: null,
    architectureStatus: needsArchitectureReview(input) ? 'Pending' : 'Not required',
    architectureReviewer: '',
    architectureDecisionAt: '',
    architectureComment: '',
    architectureDecisionVersion: null,
    status: 'Submitted'
  };
  request.status = deriveDataRequestStatus(request);
  return request;
}

export function updateDataRequest(existing, changes) {
  const before = governedContentSignature(existing);
  const request = { ...existing, ...changes, id: existing.id };
  const changed = before !== governedContentSignature(request);

  if (changed) {
    request.version = Number(existing.version || 1) + 1;
    request.humanApprovalStatus = 'Pending';
    request.humanApprovalMethod = '';
    request.humanApprover = '';
    request.humanDecisionAt = '';
    request.humanApprovalComment = '';
    request.humanDecisionVersion = null;
    request.architectureStatus = needsArchitectureReview(request) ? 'Pending' : 'Not required';
    request.architectureReviewer = '';
    request.architectureDecisionAt = '';
    request.architectureComment = '';
    request.architectureDecisionVersion = null;
  }

  request.status = preserveAdvancedLifecycle(existing.status, deriveDataRequestStatus(request));
  return request;
}

export function applyHumanDecision(request, decision) {
  if (!['Approved', 'Rejected'].includes(decision.status)) {
    throw new Error('Human decision must be Approved or Rejected.');
  }
  assertDecisionActor(decision.actor, 'Human approver');

  if (decision.status === 'Approved') {
    const missing = missingDataRequestFields(request);
    if (missing.length) throw new Error('Complete the request before human approval: ' + missing.join(', '));
    const sourcePolicy = goldenSourcePolicy(request);
    if (!sourcePolicy.eligible) throw new Error(sourcePolicy.reason);
  }

  const updated = {
    ...request,
    humanApprovalStatus: decision.status,
    humanApprovalMethod: 'Human',
    humanApprover: asText(decision.actor),
    humanDecisionAt: decision.at || new Date().toISOString(),
    humanApprovalComment: asText(decision.comment),
    humanDecisionVersion: Number(request.version)
  };
  updated.status = preserveAdvancedLifecycle(request.status, deriveDataRequestStatus(updated));
  return updated;
}

export function applyArchitectureDecision(request, decision) {
  if (!needsArchitectureReview(request)) {
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
    architectureDecisionVersion: Number(request.version)
  };
  updated.status = preserveAdvancedLifecycle(request.status, deriveDataRequestStatus(updated));
  return updated;
}

export function transitionDataRequest(request, targetStatus) {
  if (!['Implemented', 'Closed'].includes(targetStatus)) {
    throw new Error('Unsupported lifecycle transition.');
  }
  const control = canApproveDataRequest(request);
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

export function dataRequestSummary(items) {
  const open = items.filter((item) => !['Closed', 'Rejected'].includes(item.status));
  return {
    total: items.length,
    open: open.length,
    informationRequired: items.filter((item) => item.status === 'Information required').length,
    architectureReview: open.filter(
      (item) => needsArchitectureReview(item) && !isArchitectureValidationCurrent(item)
    ).length,
    approved: items.filter(
      (item) => GOVERNED_DATA_STATUSES.includes(item.status) && canApproveDataRequest(item).ok
    ).length,
    policyRejected: items.filter(
      (item) => item.status === 'Rejected' && !goldenSourcePolicy(item).eligible
    ).length
  };
}

export function approvedFlows(requests) {
  return requests
    .filter(
      (request) =>
        GOVERNED_DATA_STATUSES.includes(request.status) && canApproveDataRequest(request).ok
    )
    .map((request) => ({
      id: request.id,
      sourceApplication: request.sourceApplication,
      consumerApplication: request.consumerApplication,
      dataElement: request.dataElement,
      useCaseDescription: request.useCaseDescription ?? request.businessPurpose,
      interfaceType: request.interfaceType,
      frequency: request.frequency,
      goldenSourceApplication:
        request.goldenSourceApplication ?? request.authoritativeSource,
      humanApprover: request.humanApprover,
      humanDecisionAt: request.humanDecisionAt ?? request.humanApprovedAt,
      architectureStatus: request.architectureStatus,
      status: request.status
    }));
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

function normaliseImportedDataRequest(raw) {
  const request = {
    ...raw,
    useCaseDescription: raw.useCaseDescription ?? raw.businessPurpose ?? '',
    goldenSourceApplication:
      raw.goldenSourceApplication ?? raw.authoritativeSource ?? '',
    version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1,
    humanApprovalStatus: HUMAN_APPROVAL_STATUSES.includes(raw.humanApprovalStatus)
      ? raw.humanApprovalStatus
      : raw.businessValidation === 'Rejected' ? 'Rejected' : 'Pending',
    humanApprovalMethod: raw.humanApprovalMethod ?? '',
    humanApprover: raw.humanApprover ?? '',
    humanDecisionAt: raw.humanDecisionAt ?? raw.humanApprovedAt ?? '',
    humanApprovalComment: raw.humanApprovalComment ?? '',
    humanDecisionVersion: raw.humanDecisionVersion ?? raw.humanApprovalVersion ?? null,
    architectureStatus: ARCHITECTURE_STATUSES.includes(raw.architectureStatus)
      ? raw.architectureStatus
      : needsArchitectureReview(raw) ? 'Pending' : 'Not required',
    architectureReviewer: raw.architectureReviewer ?? '',
    architectureDecisionAt: raw.architectureDecisionAt ?? '',
    architectureComment: raw.architectureComment ?? '',
    architectureDecisionVersion: raw.architectureDecisionVersion ?? null
  };
  delete request.businessPurpose;
  delete request.authoritativeSource;
  delete request.businessValidation;
  delete request.humanApprovedAt;
  delete request.humanApprovalVersion;
  return request;
}

export function validateImportedState(candidate) {
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

  candidate.workload.forEach((item, index) => {
    if (!isPlainObject(item)) throw new Error('Invalid workload record at index ' + index + '.');
    if (!asText(item.id)) throw new Error('Workload record at index ' + index + ' has no ID.');
    if (item.status && !WORKLOAD_STATUSES.includes(item.status)) {
      throw new Error('Invalid workload status for ' + item.id + '.');
    }
  });

  const dataRequests = candidate.dataRequests.map((raw, index) => {
    if (!isPlainObject(raw)) throw new Error('Invalid data request at index ' + index + '.');
    for (const field of DATA_STRING_FIELDS) {
      if (raw[field] != null && typeof raw[field] !== 'string') {
        throw new Error('Field ' + field + ' must be text at data request index ' + index + '.');
      }
    }
    for (const field of ['newFlow', 'flowChanged', 'newConsumer']) {
      if (raw[field] != null && typeof raw[field] !== 'boolean') {
        throw new Error('Field ' + field + ' must be a boolean at data request index ' + index + '.');
      }
    }
    for (const field of ['version', 'humanDecisionVersion', 'humanApprovalVersion', 'architectureDecisionVersion']) {
      if (raw[field] != null && (!Number.isInteger(raw[field]) || raw[field] < 1)) {
        throw new Error('Field ' + field + ' must be a positive integer at data request index ' + index + '.');
      }
    }

    const request = normaliseImportedDataRequest(raw);
    if (!asText(request.id)) throw new Error('Data request at index ' + index + ' has no ID.');
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
      Number(request.humanDecisionVersion) !== Number(request.version)
    )) {
      throw new Error('Human decision evidence is incomplete or stale for ' + request.id + '.');
    }
    if (!ARCHITECTURE_STATUSES.includes(request.architectureStatus)) {
      throw new Error('Invalid architecture status for ' + request.id + '.');
    }
    if (GOVERNED_DATA_STATUSES.includes(request.status)) {
      const control = canApproveDataRequest(request);
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
