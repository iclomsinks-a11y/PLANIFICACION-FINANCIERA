/**
 * Firestore Security Rules — Dirty Dozen Verification Matrix
 * Documented adversarial assertions matching firestore.rules invariants.
 */

export const DIRTY_DOZEN_SECURITY_CASES = [
  {
    id: 1,
    name: 'Unauthenticated read denied',
    path: '/users/userA/supuestos/sup-1',
    auth: null,
    expected: 'DENY',
  },
  {
    id: 2,
    name: 'Unverified email write denied',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: false } },
    expected: 'DENY',
  },
  {
    id: 3,
    name: 'Cross-user read denied (IDOR)',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userB', token: { email_verified: true } },
    expected: 'DENY',
  },
  {
    id: 4,
    name: 'Cross-user write denied (IDOR)',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userB', token: { email_verified: true } },
    expected: 'DENY',
  },
  {
    id: 5,
    name: 'Owner spoofing in payload denied',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    payloadOverride: { ownerUid: 'userB' },
    expected: 'DENY',
  },
  {
    id: 6,
    name: 'Client-forged updatedAt timestamp denied (must equal request.time)',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    payloadOverride: { updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'DENY',
  },
  {
    id: 7,
    name: 'Invalid document ID path traversal rejected',
    path: '/users/userA/supuestos/..%2Fadmin',
    auth: { uid: 'userA', token: { email_verified: true } },
    expected: 'DENY',
  },
  {
    id: 8,
    name: 'Extra undeclared field injection denied (hasOnly)',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    payloadOverride: { role: 'superadmin' },
    expected: 'DENY',
  },
  {
    id: 9,
    name: 'Immutable ownerUid mutation on update denied',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    expected: 'DENY',
  },
  {
    id: 10,
    name: 'Empty supuesto name rejected',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    payloadOverride: { nombre: '' },
    expected: 'DENY',
  },
  {
    id: 11,
    name: 'Non-map state payload rejected',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    payloadOverride: { state: '{"serialized":true}' },
    expected: 'DENY',
  },
  {
    id: 12,
    name: 'Verified owner valid CRUD allowed',
    path: '/users/userA/supuestos/sup-1',
    auth: { uid: 'userA', token: { email_verified: true } },
    expected: 'ALLOW',
  },
] as const;
