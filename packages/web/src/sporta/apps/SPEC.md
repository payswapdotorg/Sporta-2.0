# SPEC — Connected Apps REAL Host

## Worker C (w12c) Implementation Specification

### 1. createAppsRealHost

**Purpose**: Create a REAL host for connected apps that projects over the frozen service layer.

**Signature**:
```typescript
createAppsRealHost(deps: { 
  environment: ApplicationEnvironmentService; 
  actionAudit: ApplicationActionService; 
  sessions: SessionService 
}): AppsRealHost
```

**Requirements**:
- Pure projection: NO state of its own
- `listAttachments()` projects REAL attachment + descriptor views over `listAttachmentsByScope` + descriptor reads
- Granted AND not-granted attachments visible, every field verbatim, honest `revokedAt` null vs timestamp
- `readAuditTrail(attachmentId)` maps attachment to REAL session(s) and reads REAL `ApplicationActionRecord`s
- Absent session = EMPTY audit (never an error)
- Unknown attachment = typed refusal (never a fabricated trail)

### 2. Revoke Write Implementation

**Purpose**: Implement revoke functionality over the REAL service path.

**Requirements**:
- `revoke(attachmentId)` rides `ApplicationEnvironmentService.revokeAttachment`
- Idempotent: re-revoke returns SAME record (same `revokedAt`), no double-write
- Mid-session safe-stop semantics surface VERBATIM (never softened)
- Failure typing honest: `{ ok: false, reason }` with verbatim reason, never silent no-op
- Exactly-one-write-path law preserved: NO grant/attach path in host

### 3. Test Implementation

**Purpose**: Create comprehensive tests for the connected apps REAL host.

**Tests**:
- Gate W12-13: Attachment/descriptor views over REAL service reads
- Gate W12-14: Audit reads over REAL ApplicationActionRecord with absent sessions = empty audit
- Gate W12-15: Revoke write over revokeAttachment with idempotent re-revoke and exactly one write path

### 4. Verification

**Purpose**: Ensure implementation meets all requirements.

**Verification Steps**:
- Architecture checks
- Surface checks
- TypeScript compilation
- New tests pass
- Existing tests still pass
- Linting passes
- File sizes < 400 lines