# Security Specification — Patrimonio & IRPF España

## 1. Access Control Model
- **Strict Per-User Isolation (Private Workspace)**: All persistent user workspaces and saved financial/tax `Supuestos` are stored exclusively under `/users/{userId}` and `/users/{userId}/supuestos/{supuestoId}`.
- **Authentication & Verification**:
  - `read`: Requires `request.auth != null && request.auth.uid == userId`.
  - `create` / `update` / `delete`: Requires `request.auth != null && request.auth.token.email_verified == true && request.auth.uid == userId`.
- **No Global Listing / No Cross-User Access**: Listing `/users` or reading/writing another UID's documents is denied (`allow read, write: if false;` catch-all).

## 2. Integrity & Validation Rules
- **Path-Data Binding**:
  - `/users/{userId}`: `data.uid == userId`.
  - `/users/{userId}/supuestos/{supuestoId}`: `data.id == supuestoId && data.ownerUid == userId`.
- **Immutable Ownership**: Updates cannot alter `uid` on `/users/{userId}` or `id` / `ownerUid` on `/users/{userId}/supuestos/{supuestoId}` via `affectedKeys().hasOnly(...)` + equality checks.
- **Temporal & Type Integrity**:
  - `updatedAt` must be `request.time` (`data.updatedAt is timestamp` and `request.resource.data.updatedAt == request.time` on writes).
  - `numero` and `nextSupuestoNumber` must be positive integers (`>= 1`).
  - `nombre` must be a non-empty string (`1..120` chars).
  - `state` must be a native Firestore `map` (no raw `JSON.stringify` blob).
  - `dismissedGmailIds` (when present) must be a `list` of at most 500 strings.
