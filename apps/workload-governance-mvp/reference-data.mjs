// Synthetic stand-in for authoritative upstream catalogues.
// Requesters cannot edit these facts through the data-request form.
// Enterprise deployment must replace this module with authenticated data from
// the application/data catalogue and architecture repository.
export const SYNTHETIC_REFERENCE_DATA = Object.freeze({
  version: 'synthetic-reference-v1',
  dataAuthorities: Object.freeze([
    Object.freeze({
      dataElement: 'Risk deterioration indicator',
      goldenSourceApplication: 'Risk Data Service'
    }),
    Object.freeze({
      dataElement: 'Customer risk segment',
      goldenSourceApplication: 'Customer Master'
    })
  ]),
  knownApplications: Object.freeze([
    'Risk Data Service',
    'Reporting Hub',
    'Customer Master',
    'Reporting Cache',
    'Analytics Workbench'
  ]),
  knownFlows: Object.freeze([
    Object.freeze({
      sourceApplication: 'Risk Data Service',
      consumerApplication: 'Reporting Hub',
      dataElement: 'Risk deterioration indicator',
      interfaceType: 'File'
    })
  ])
});
