# Security hardening record — IntegrityWatch Field

**Date:** 31-10-2026
**Scope:** findings from the security audit (this document maps each finding to its fix
and verification). Baseline before hardening: **526 tests**. After: **556 tests, 0 failures**.

---

## Findings → fixes

| ID | Finding (audit) | Fix implemented | Verification |
|---|---|---|---|
| **S1** | No authentication by default; lock optional and off | Lock remains optional by design (single-user device rule documented in `permissions.js`); with the lock **enabled**, access is now governed by the role matrix | `tests/security-guard.test.js`: lock enabled without session → writes denied |
| **S2** | Role not persisted: reload cleared restrictions | Persistent session in `meta` (`lock.session`: role, start, lastActivity, expires). `role(meta)` reads the session; views use the async role check | `tests/lock-session.test.js`: role survives reload via persisted session; expiry returns null |
| **S3** | Failed-attempt counter reset on reload | `verify()` rehydrates the persisted counter before incrementing; lockout timestamp kept | `tests/lock-session.test.js`: 4 fails + fresh module instance → 5th attempt locks |
| **S4** | Only 2 roles, enforcement only on deletes | Three roles (**operator / engineer / admin**) with a declared matrix and a single guard applied to **every write path** (points, readings, coupons, assets, events, PSVs, systems, line assets, inspections, sizing, RBI reprogram, NORSOK/CUI/MIC saves, ILI import, imports, exports, admin destructive actions) | `tests/security-guard.test.js` matrix completeness + reviewer-verified guarded write paths list |
| **S5** | Sync POST without authentication | Optional bearer token from `meta.syncToken` sent as `Authorization` header; never logged | `tests/syncQueue.test.js`: header present/absent cases |
| **S6** | CSP `connect-src` blocked real sync endpoints | Out of scope for the client CSP; documented: deploy the sync endpoint behind the same origin, or relax `connect-src` consciously (not done by default) | — |
| **S7** | JSON ingest bypassed `.iwf` checksum verification | Envelopes with `format: 'iwf'` now go through `parseCaseFileAsync` before import | `tests/audit-and-checksum.test.js` |
| **S8** | 32-bit FNV checksum forgeable | **V2 envelope** with SHA-256 (WebCrypto) over the canonical envelope (data + sector + exportedAt + app + signedBy); downgrade attack (stripping the SHA field) is rejected; legacy FNV kept for old files | `tests/audit-and-checksum.test.js`: V2 verifies, tamper → `E_CHECKSUM_SHA`, downgrade → `E_CHECKSUM_SHA` |
| **S9** | Import accepted arbitrary store names (`__proto__` crash) | Own-property guard + unknown store rejected with `E_UNKNOWN_STORE` | `tests/exportImport.test.js` |
| **S10** | No input size limits | CSV ≤ 2 MB / 20k rows, JSON ≤ 5 MB, WITSML ≤ 5 MB, with localized errors (`ingest.tooLarge`, `ingest.tooManyRows`) in 7 locales | i18n parity tests; limits enforced before parsing |
| **S11** | Non-constant-time hash comparison | `constantTimeEqual` in `lock.js` used for the PIN hash | implemented (INFO: length early-exit acceptable for fixed-length hashes) |
| **S12** | No authorship on records | `permissions.stamp(meta, rec, existing)` sets `createdBy/createdAt/updatedBy/updatedAt` on every save path; exported in the case file | Verified end-to-end: reading created under an admin session stores `createdBy: 'admin'` (`docs/security-entry-2026-10-31/evidence.json`) |
| **S13** | Service worker `skipWaiting` immediate activation | Kept (needed for field updates); the shell surfaces an "update available" state — accepted trade-off | — |
| **S14** | CSP lacked `object-src`/`frame-ancestors` | Flagged; not changed in this pass (no inline objects/frames in the app) | — |
| **S15** | Clear-all did not reset the lock (forgot-PIN recovery) | Intentional: data wipe must not silently drop the security state. Recovery = clear site data in the browser | Documented here |

### Additional fixes found during review

- `MIN_PIN_LENGTH = 6` enforced inside `enable()`/`changePin()` (was only a view check).
- `ITERATIONS` raised to **600,000**.
- Fail-closed guard: if security modules fail to load, writes are denied (read stays allowed).
- `ACTIONS` registry completed (`recAcknowledge`).
- Sync endpoint validation: `https:` anywhere, `http:` only for loopback (`127.0.0.1`, `[::1]`); insecure endpoints are rejected and marked `E_INSECURE_ENDPOINT`; userinfo redacted in logs.
- `parseCaseFileAsync` used by every import path; legacy `parseCaseFile` kept synchronous for old tests.
- Removed the unused `line-ribbon` component and the vendor experiment; `tools/measure-symbols.py` retired.

---

## Defects (non-security) fixed in the same pass

| Defect | Fix |
|---|---|
| Case file stamped `app: '1.0.0'` | `APP_VERSION` constant = product version (1.1.0) |
| Case file exported hardcoded `sector: 'midstream'` | Now records the actual actor and drops the bogus sector default |
| `apm.js` mojibake (Windows-1252 re-encode: `â€”`, `Î²`, `Î·`) | File restored to clean UTF-8; 17 literals repaired |
| Numeric separators (ES2021) in ingest limits | Plain literals |

---

## End-to-end verification

`tools/qa/run_security_entry_tests.py` — with the lock **enabled as admin**:

1. Point, reading, asset, event, PSV, system and line asset created through the real forms
   (8 forms saved). Every record stamped `createdBy: 'admin'`.
2. Case-file export produced a **V2 envelope**: `checksumAlgo: SHA-256`, `signedBy: admin`,
   `app: 1.1.0`.
3. Session expiry simulated → `role()` returns `null` (the operator/engineer gates close).
4. 7 captures in `docs/security-entry-2026-10-31/` + `evidence.json`.

Suite totals: **556 tests, 0 failures** (`npm test`).

---

## Residual risks (accepted, documented)

1. Client-side enforcement can be bypassed by a user with devtools on their own device.
   True enforcement requires the sync server to validate sessions and signatures.
2. Bearer token is stored in `meta` (IndexedDB) in clear text — same threat model as the
   rest of the local data; acceptable for a single-operator device, not for shared kiosks.
3. Unkeyed checksums (SHA-256 without a secret) prove **corruption-free**, not authenticity.
   Authenticity requires the sync server or a future signing key.
4. Git history was not scanned for secrets in this pass; run `gitleaks detect` on a fresh
   clone as part of release checks.
