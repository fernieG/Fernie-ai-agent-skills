export const WORKLOAD_STATUSES = ['New','Awaiting prioritisation','Planned','In progress','Blocked','Done','Rejected'];
export const DATA_REQUEST_STATUSES = ['Submitted','Information required','Business validated','Architecture review','IT review','Approved','Implemented','Closed','Rejected'];

export function createId(prefix, now = new Date(), sequence = 1) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return prefix + '-' + y + m + d + '-' + String(sequence).padStart(3, '0');
}

export function needsArchitectureReview(request) {
  return Boolean(request.newFlow === true || request.flowChanged === true || request.newConsumer === true || request.interfaceType === 'Unknown / to define');
}

export function missingDataRequestFields(request) {
  const required = [
    ['requester','Requester / team'],['sourceApplication','Source application'],['consumerApplication','Consuming application'],
    ['dataElement','Requested data'],['expectedDefinition','Expected business definition'],['businessPurpose','Business purpose'],
    ['frequency','Frequency'],['interfaceType','Expected interface'],['criticality','Criticality']
  ];
  return required.filter(function(pair){ return !String(request[pair[0]] || '').trim(); }).map(function(pair){ return pair[1]; });
}

export function canApproveDataRequest(request) {
  const missing = missingDataRequestFields(request);
  if (missing.length) return {ok:false, reason:'Missing required information: ' + missing.join(', ')};
  if (needsArchitectureReview(request) && request.architectureStatus !== 'Validated') return {ok:false, reason:'Architecture validation is required before approval.'};
  if (request.businessValidation !== 'Validated') return {ok:false, reason:'Business/data-owner validation is required before approval.'};
  return {ok:true, reason:''};
}

export function workloadSummary(items) {
  const open = items.filter(function(i){ return !['Done','Rejected'].includes(i.status); });
  return {total:items.length, open:open.length, inProgress:items.filter(function(i){return i.status === 'In progress';}).length,
    awaitingPriority:items.filter(function(i){return i.status === 'Awaiting prioritisation';}).length,
    blocked:items.filter(function(i){return i.status === 'Blocked';}).length};
}

export function dataRequestSummary(items) {
  const open = items.filter(function(i){ return !['Closed','Rejected'].includes(i.status); });
  return {total:items.length, open:open.length,
    informationRequired:items.filter(function(i){return i.status === 'Information required';}).length,
    architectureReview:items.filter(function(i){return needsArchitectureReview(i) && i.architectureStatus !== 'Validated';}).length,
    approved:items.filter(function(i){return ['Approved','Implemented','Closed'].includes(i.status);}).length};
}

export function approvedFlows(requests) {
  return requests.filter(function(r){return ['Approved','Implemented','Closed'].includes(r.status);}).map(function(r){return {
    id:r.id, sourceApplication:r.sourceApplication, consumerApplication:r.consumerApplication, dataElement:r.dataElement,
    businessPurpose:r.businessPurpose, interfaceType:r.interfaceType, frequency:r.frequency,
    authoritativeSource:r.authoritativeSource || r.sourceApplication, architectureStatus:r.architectureStatus, status:r.status
  };});
}

export function nextSequence(existing, prefix, date = new Date()) {
  const stem = createId(prefix, date, 1).slice(0, -3);
  const numbers = existing.map(function(x){return String(x.id || '');}).filter(function(id){return id.startsWith(stem);})
    .map(function(id){return Number(id.slice(-3));}).filter(Number.isFinite);
  return numbers.length ? Math.max.apply(null, numbers) + 1 : 1;
}
