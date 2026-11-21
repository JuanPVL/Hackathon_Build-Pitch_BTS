/** Usuarios y documentos IC de prueba (solo base local). */
export const USERS = {
  controller: { id: '00000000-0000-4000-8000-000000000001', companyId: null, roleCode: 'GROUP_CONTROLLER' },
  auditor: { id: '00000000-0000-4000-8000-000000000002', companyId: null, roleCode: 'AUDITOR' },
  gt1Accountant: { id: '00000000-0000-4000-8000-000000000003', companyId: 'GT1', roleCode: 'COMPANY_ACCOUNTANT' },
  gt1Viewer: { id: '00000000-0000-4000-8000-000000000004', companyId: 'GT1', roleCode: 'COMPANY_VIEWER' },
  mx1Accountant: { id: '00000000-0000-4000-8000-000000000005', companyId: 'MX1', roleCode: 'COMPANY_ACCOUNTANT' },
  noGrant: { id: '00000000-0000-4000-8000-000000000006', companyId: null, roleCode: null },
} as const;

export type UserKey = keyof typeof USERS;

/** [id, emisor, receptor, estado final] — todos en PPTO_V1, versión 1. */
export const IC_DOCUMENTS: Array<[string, string, string, 'BORRADOR' | 'PENDIENTE_ACEPTACION']> = [
  ['T-GT1-MX1-ACCEPT', 'GT1', 'MX1', 'PENDIENTE_ACEPTACION'],
  ['T-US1-MX1-DISPUTE', 'US1', 'MX1', 'PENDIENTE_ACEPTACION'],
  ['T-US1-GT1-DRAFT', 'US1', 'GT1', 'BORRADOR'],
  ['T-MX1-GT1-TWICE', 'MX1', 'GT1', 'PENDIENTE_ACEPTACION'],
  ['T-US2-GT1-VIEWER', 'US2', 'GT1', 'PENDIENTE_ACEPTACION'],
];

export const SCENARIO = 'PPTO_V1';
