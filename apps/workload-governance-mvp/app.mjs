import {
  STATE_SCHEMA_VERSION,
  WORKLOAD_STATUSES,
  createId,
  needsArchitectureReview,
  goldenSourcePolicy,
  canApproveDataRequest,
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
} from './domain.mjs';

const STORAGE_KEY = 'wg-mvp-v3';
const LEGACY_STORAGE_KEYS = ['wg-mvp-v2', 'wg-mvp-v1'];
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const seed = {
  schemaVersion: STATE_SCHEMA_VERSION,
  workload: [
    {
      id: 'DEM-DEMO-001',
      received: '2026-09-30',
      requester: 'Delivery team',
      title: 'Create calculation overview',
      application: 'Scoring Platform',
      effort: '0.5d',
      priority: 'P1',
      plannedStart: '2026-09-30',
      status: 'In progress',
      decision: 'Accepted'
    },
    {
      id: 'DEM-DEMO-002',
      received: '2026-09-30',
      requester: 'Downstream product team',
      title: 'Analyse newly discovered data dependency',
      application: 'Risk Data Service',
      effort: 'TBD',
      priority: 'Unprioritised',
      plannedStart: '2026-11-16',
      status: 'Awaiting prioritisation',
      decision: 'Earlier start requires reprioritisation'
    }
  ],
  dataRequests: [
    initialiseDataRequest(
      {
        received: '2026-09-30',
        requester: 'Reporting team',
        sourceApplication: 'Risk Data Service',
        consumerApplication: 'Reporting Hub',
        dataElement: 'Risk deterioration indicator',
        expectedDefinition: 'Indicator used to flag significant deterioration of risk.',
        useCaseDescription: 'Daily portfolio monitoring and exception handling.',
        frequency: 'Daily',
        interfaceType: 'API',
        criticality: 'High'
      },
      'DATA-DEMO-001'
    ),
    initialiseDataRequest(
      {
        received: '2026-09-30',
        requester: 'Analytics team',
        sourceApplication: 'Reporting Cache',
        consumerApplication: 'Analytics Workbench',
        dataElement: 'Customer risk segment',
        expectedDefinition: 'Current governed customer risk segment.',
        useCaseDescription: 'Exploratory portfolio segmentation for prioritised risk analysis.',
        frequency: 'Daily',
        interfaceType: 'API',
        criticality: 'High'
      },
      'DATA-DEMO-002'
    )
  ]
};

let loadWarning = '';
let state = loadState();

function cloneSeed() {
  return structuredClone(seed);
}

function loadState() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;
    try {
      const validated = validateImportedState(JSON.parse(stored));
      if (key !== STORAGE_KEY) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      }
      return validated;
    } catch (error) {
      loadWarning = 'Stored data could not be loaded: ' + error.message +
        ' The invalid backup was left untouched.';
      return cloneSeed();
    }
  }
  return cloneSeed();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function save() {
  try {
    persist();
    render();
  } catch (error) {
    window.alert('Save failed: ' + error.message);
  }
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function badge(value, tone = '') {
  return '<span class="badge ' + tone + '">' + esc(value || '-') + '</span>';
}

function tone(status) {
  if (['Done', 'Approved', 'Implemented', 'Closed', 'Validated'].includes(status)) return 'good';
  if (['Blocked', 'Rejected'].includes(status)) return 'bad';
  if (['Awaiting prioritisation', 'Information required', 'Pending', 'Architecture review'].includes(status)) {
    return 'warn';
  }
  return '';
}

function formFields(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setOptions(element, values) {
  element.innerHTML = values.map((value) => '<option>' + esc(value) + '</option>').join('');
}

function findDataRequest(id) {
  return state.dataRequests.find((request) => request.id === id);
}

function replaceDataRequest(updated) {
  state.dataRequests = state.dataRequests.map((request) =>
    request.id === updated.id ? updated : request
  );
}

function render() {
  const workload = workloadSummary(state.workload);
  const requests = dataRequestSummary(state.dataRequests);

  const warning = document.getElementById('loadWarning');
  warning.textContent = loadWarning;
  warning.hidden = !loadWarning;

  document.getElementById('cards').innerHTML = [
    ['Open workload', workload.open, workload.awaitingPriority + ' awaiting priority'],
    ['In progress', workload.inProgress, workload.blocked + ' blocked'],
    ['Open data requests', requests.open, requests.informationRequired + ' need information'],
    ['Architecture gates', requests.architectureReview, requests.approved + ' governed flows'],
    ['Golden-source refusals', requests.policyRejected, 'redirect to the authoritative source']
  ].map(([label, value, detail]) =>
    '<div class="card"><span class="muted">' + esc(label) + '</span><strong>' +
    esc(value) + '</strong><small>' + esc(detail) + '</small></div>'
  ).join('');

  const attention = [];
  state.workload
    .filter((item) => ['Blocked', 'Awaiting prioritisation'].includes(item.status))
    .forEach((item) => attention.push(item.id + ' — ' + item.title + ' — ' + item.status));

  state.dataRequests.forEach((request) => {
    const policy = goldenSourcePolicy(request);
    if (request.status === 'Information required') {
      attention.push(request.id + ' — ' + policy.reason);
    } else if (!policy.eligible) {
      attention.push(request.id + ' — ' + policy.reason);
    } else if (request.humanApprovalStatus === 'Pending') {
      attention.push(request.id + ' — waiting for a human data-consumption decision');
    } else if (needsArchitectureReview(request) && request.architectureStatus !== 'Validated') {
      attention.push(request.id + ' — architecture decision required');
    }
  });

  document.getElementById('attention').innerHTML =
    (attention.length ? attention : ['No items currently require attention.'])
      .map((item) => '<li>' + esc(item) + '</li>')
      .join('');

  renderWorkload();
  renderDataRequests();
  renderFlows();
}

function renderWorkload() {
  const query = document.getElementById('workSearch').value.toLowerCase();
  const items = state.workload.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  document.getElementById('workRows').innerHTML = items.map((item) =>
    '<tr><td><strong>' + esc(item.id) + '</strong><br><small>' + esc(item.received) +
    '</small></td><td><strong>' + esc(item.title) + '</strong><br><small>' +
    esc(item.requester) + ' — ' + esc(item.application) + '</small></td><td>' +
    badge(item.priority, item.priority === 'P1' ? 'bad' : '') + '</td><td>' +
    badge(item.status, tone(item.status)) + '</td><td>' + esc(item.plannedStart || '-') +
    '</td><td>' + esc(item.decision || '-') + '</td><td><button class="link" data-edit-work="' +
    esc(item.id) + '">Edit</button></td></tr>'
  ).join('') || '<tr><td colspan="7">No matching items.</td></tr>';
}

function renderDataRequests() {
  const query = document.getElementById('dataSearch').value.toLowerCase();
  const requests = state.dataRequests.filter((request) =>
    JSON.stringify(request).toLowerCase().includes(query)
  );

  document.getElementById('dataRows').innerHTML = requests.map((request) => {
    const policy = goldenSourcePolicy(request);
    const control = canApproveDataRequest(request);
    const architectureRequired = needsArchitectureReview(request);
    const lifecycleAction = request.status === 'Approved'
      ? '<button class="link" data-transition="Implemented" data-id="' + esc(request.id) + '">Mark implemented</button>'
      : request.status === 'Implemented'
        ? '<button class="link" data-transition="Closed" data-id="' + esc(request.id) + '">Close</button>'
        : '';
    const architectureAction = architectureRequired
      ? '<button class="link" data-architecture-decision="' + esc(request.id) + '">Architecture decision</button>'
      : '';
    const sourceBadge = policy.resolved
      ? (policy.eligible ? 'Golden source confirmed' : 'Refused')
      : 'Reference missing';

    return '<tr><td><strong>' + esc(request.id) + '</strong><br><small>v' +
      esc(request.version) + '</small></td><td><strong>' + esc(request.sourceApplication) +
      '</strong> → <strong>' + esc(request.consumerApplication) + '</strong><br><small>' +
      esc(request.dataElement) + '</small></td><td>' + esc(request.useCaseDescription) +
      '</td><td>' + badge(sourceBadge, policy.eligible ? 'good' : 'bad') +
      '<br><small>' + esc(policy.reason) + '</small></td><td>' +
      badge(request.humanApprovalStatus, tone(request.humanApprovalStatus)) +
      '<br><small>' + esc(request.humanApprover || 'No human decision') + '</small></td><td>' +
      badge(architectureRequired ? request.architectureStatus : 'Not required', tone(request.architectureStatus)) +
      '</td><td>' + badge(request.status, tone(request.status)) + '<br><small>' +
      esc(control.ok ? 'All approval controls satisfied' : control.reason) + '</small></td><td class="row-actions">' +
      '<button class="link" data-edit-data="' + esc(request.id) + '">Edit request</button>' +
      '<button class="link" data-human-decision="' + esc(request.id) + '">Human decision</button>' +
      architectureAction + lifecycleAction + '</td></tr>';
  }).join('') || '<tr><td colspan="8">No matching items.</td></tr>';
}

function renderFlows() {
  const flows = approvedFlows(state.dataRequests);
  document.getElementById('flowRows').innerHTML = flows.map((flow) =>
    '<tr><td>' + esc(flow.id) + '</td><td>' + esc(flow.sourceApplication) + '</td><td>' +
    esc(flow.consumerApplication) + '</td><td>' + esc(flow.dataElement) + '</td><td>' +
    esc(flow.goldenSourceApplication) + '</td><td>' + esc(flow.useCaseDescription) + '</td><td>' +
    esc(flow.interfaceType) + ' / ' + esc(flow.frequency) + '</td><td>' +
    esc(flow.humanApprover) + '<br><small>' + esc(flow.humanDecisionAt) + '</small></td><td>' +
    badge(flow.status, tone(flow.status)) + '</td></tr>'
  ).join('') || '<tr><td colspan="9">No controlled flows have been approved yet.</td></tr>';
}

function resetWorkForm() {
  const form = document.getElementById('workForm');
  form.reset();
  form.recordId.value = '';
  form.received.value = new Date().toISOString().slice(0, 10);
  form.status.value = 'New';
  form.priority.value = 'Unprioritised';
}

function resetDataForm() {
  const form = document.getElementById('dataForm');
  form.reset();
  form.recordId.value = '';
  form.received.value = new Date().toISOString().slice(0, 10);
  updatePolicyHint();
}

function fillForm(form, item) {
  for (const [key, value] of Object.entries(item)) {
    if (!form.elements[key]) continue;
    form.elements[key].value = value ?? '';
  }
}

function updatePolicyHint() {
  const request = formFields(document.getElementById('dataForm'));
  const policy = goldenSourcePolicy(request);
  const architecture = needsArchitectureReview(request);
  const hint = document.getElementById('policyHint');
  hint.textContent = policy.reason + ' ' +
    (architecture ? 'Architecture review is required.' : 'No automatic architecture review is required.');
  hint.className = policy.eligible ? 'policy good-text' : 'policy bad-text';
}

function openHumanDecision(id) {
  const request = findDataRequest(id);
  const form = document.getElementById('humanForm');
  form.reset();
  form.recordId.value = id;
  form.decision.value = request.humanApprovalStatus === 'Rejected' ? 'Rejected' : 'Approved';
  form.approver.value = request.humanApprover || '';
  form.comment.value = request.humanApprovalComment || '';
  document.getElementById('humanSummary').textContent =
    request.consumerApplication + ' requests ' + request.dataElement + ' from ' +
    request.sourceApplication + ' for: ' + request.useCaseDescription;
  const policy = goldenSourcePolicy(request);
  document.getElementById('humanPolicy').textContent = policy.reason;
  document.getElementById('humanPolicy').className = policy.eligible
    ? 'policy good-text'
    : 'policy bad-text';
  document.getElementById('humanDlg').showModal();
}

function openArchitectureDecision(id) {
  const request = findDataRequest(id);
  const form = document.getElementById('architectureForm');
  form.reset();
  form.recordId.value = id;
  form.decision.value = request.architectureStatus === 'Rejected' ? 'Rejected' : 'Validated';
  form.reviewer.value = request.architectureReviewer || '';
  form.comment.value = request.architectureComment || '';
  document.getElementById('architectureSummary').textContent =
    request.sourceApplication + ' → ' + request.consumerApplication + ' via ' +
    request.interfaceType + '; criticality: ' + request.criticality + '.';
  document.getElementById('architectureDlg').showModal();
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'workload-governance-v' + STATE_SCHEMA_VERSION + '-backup.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

setOptions(document.getElementById('workStatus'), WORKLOAD_STATUSES);

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('on', item === button));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('on', panel.id === button.dataset.tab));
  });
});

document.getElementById('newWork').addEventListener('click', () => {
  resetWorkForm();
  document.getElementById('workDlg').showModal();
});

document.getElementById('newData').addEventListener('click', () => {
  resetDataForm();
  document.getElementById('dataDlg').showModal();
});

document.getElementById('workSearch').addEventListener('input', renderWorkload);
document.getElementById('dataSearch').addEventListener('input', renderDataRequests);
document.getElementById('dataForm').addEventListener('input', updatePolicyHint);
document.getElementById('dataForm').addEventListener('change', updatePolicyHint);

document.body.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.close) document.getElementById(target.dataset.close).close();

  if (target.dataset.editWork) {
    const form = document.getElementById('workForm');
    resetWorkForm();
    fillForm(form, state.workload.find((item) => item.id === target.dataset.editWork));
    form.recordId.value = target.dataset.editWork;
    document.getElementById('workDlg').showModal();
  }

  if (target.dataset.editData) {
    const form = document.getElementById('dataForm');
    resetDataForm();
    fillForm(form, findDataRequest(target.dataset.editData));
    form.recordId.value = target.dataset.editData;
    updatePolicyHint();
    document.getElementById('dataDlg').showModal();
  }

  if (target.dataset.humanDecision) openHumanDecision(target.dataset.humanDecision);
  if (target.dataset.architectureDecision) openArchitectureDecision(target.dataset.architectureDecision);

  if (target.dataset.transition) {
    const request = findDataRequest(target.dataset.id);
    try {
      const updated = transitionDataRequest(request, target.dataset.transition);
      if (!window.confirm('Change ' + request.id + ' to ' + target.dataset.transition + '?')) return;
      replaceDataRequest(updated);
      save();
    } catch (error) {
      window.alert(error.message);
    }
  }
});

document.getElementById('workForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const item = formFields(form);
  const id = item.recordId;
  delete item.recordId;

  if (id) {
    item.id = id;
    state.workload = state.workload.map((existing) => existing.id === id ? item : existing);
  } else {
    item.id = createId('DEM', new Date(), nextSequence(state.workload, 'DEM'));
    state.workload.push(item);
  }
  save();
  document.getElementById('workDlg').close();
});

document.getElementById('dataForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formFields(form);
  const id = values.recordId;
  delete values.recordId;

  if (id) {
    replaceDataRequest(updateDataRequest(findDataRequest(id), values));
  } else {
    const newId = createId('DATA', new Date(), nextSequence(state.dataRequests, 'DATA'));
    state.dataRequests.push(initialiseDataRequest(values, newId));
  }
  save();
  document.getElementById('dataDlg').close();
});

document.getElementById('humanForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = formFields(event.currentTarget);
  try {
    const updated = applyHumanDecision(findDataRequest(values.recordId), {
      status: values.decision,
      actor: values.approver,
      comment: values.comment
    });
    replaceDataRequest(updated);
    save();
    document.getElementById('humanDlg').close();
  } catch (error) {
    window.alert(error.message);
  }
});

document.getElementById('architectureForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = formFields(event.currentTarget);
  try {
    const updated = applyArchitectureDecision(findDataRequest(values.recordId), {
      status: values.decision,
      actor: values.reviewer,
      comment: values.comment
    });
    replaceDataRequest(updated);
    save();
    document.getElementById('architectureDlg').close();
  } catch (error) {
    window.alert(error.message);
  }
});

document.getElementById('backup').addEventListener('click', downloadBackup);

document.getElementById('restore').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('File exceeds the 2 MB import limit.');
    const imported = validateImportedState(JSON.parse(await file.text()));
    const confirmed = window.confirm(
      'Validated backup: ' + imported.workload.length + ' workload records and ' +
      imported.dataRequests.length + ' data requests. Replace current local data?'
    );
    if (!confirmed) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    state = imported;
    loadWarning = '';
    render();
  } catch (error) {
    window.alert('Import failed without changing current data: ' + error.message);
  } finally {
    event.target.value = '';
  }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    state = validateImportedState(JSON.parse(event.newValue));
    loadWarning = 'Data was refreshed after a change in another browser tab.';
    render();
  } catch (error) {
    loadWarning = 'A change from another tab was ignored: ' + error.message;
    render();
  }
});

render();
