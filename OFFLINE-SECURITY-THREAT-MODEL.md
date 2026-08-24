# OFFLINE SECURITY THREAT MODEL — BIK Prestige Enterprise

> **Status: DESIGN ONLY — Not implemented**
> This document accompanies OFFLINE-ARCHITECTURE.md and identifies security threats
> specific to offline financial operations.

---

## 1. Scope

This threat model covers:
- Local storage of financial transaction data
- Offline authentication and session management
- Synchronization of offline transactions
- Device compromise scenarios
- Data at rest on mobile devices

It does NOT cover:
- Standard web application threats (covered in main SECURITY.md)
- Server-side infrastructure threats (covered separately)

---

## 2. Asset Classification

| Asset | Sensitivity | Offline Risk |
|-------|-------------|--------------|
| Customer names + IDs | Medium | PII exposure on device theft |
| Transaction amounts | High | Financial fraud if tampered |
| Account balances | High | Business integrity if modified |
| Collector assignments | Medium | Unauthorized collection if forged |
| Authentication tokens | Critical | Account takeover if stolen |
| Daily account figures | High | Financial manipulation |

---

## 3. Threat Agents

| Agent | Capability | Motivation |
|-------|-----------|------------|
| **Device thief** | Physical access to device | Financial fraud, identity theft |
| **Malicious user** | Normal app access, modified client | Double-claiming, balance manipulation |
| **Compromised device** | Malware/root access | Full data extraction |
| **Network attacker** | MITM on sync | Transaction replay, data interception |
| **Disgruntled collector** | Valid credentials, physical device | Theft, fraud, data destruction |

---

## 4. Threat Scenarios

### 4.1 Device Theft

**Scenario**: Collector's phone is stolen while carrying offline transaction data.

**Risk**:
- Thief accesses customer names, IDs, transaction amounts
- Thief could attempt to submit fake transactions if device is not locked
- If device is unlocked, full app access may be possible

**Mitigations**:
- All financial data encrypted in IndexedDB (AES-GCM)
- Device lock screen required (app checks biometric/PIN)
- Offline session expires after 24 hours maximum
- Server can revoke device enrollment remotely
- App does not store raw authentication tokens

### 4.2 Transaction Tampering

**Scenario**: User modifies transaction data in local storage before sync.

**Risk**:
- Inflated collection amounts
- Fictitious transactions
- Modified daily account figures

**Mitigations**:
- Server validates ALL financial rules during sync
- Server does not trust client-supplied values blindly
- Collector authorization verified server-side
- Account/cycle validity checked server-side
- Idempotency keys prevent replay of modified transactions
- Local state is advisory only — server is source of truth

### 4.3 Transaction Replay

**Scenario**: Attacker captures a valid offline transaction and replays it.

**Risk**:
- Duplicate collection credited to wrong customer
- Double-spending of collected funds

**Mitigations**:
- Every transaction has a unique device-generated UUID
- Server stores and checks idempotency keys
- Duplicate submission returns the original result (idempotent)
- Transaction IDs are cryptographically random (128+ bits)

### 4.4 Stale Data Exploitation

**Scenario**: User operates offline for extended period with outdated customer data.

**Risk**:
- Collecting from a customer whose account was disabled
- Collecting after a cycle was closed
- Collecting from a customer reassigned to another collector

**Mitigations**:
- Maximum offline grace period: 24 hours
- Server rejects transactions against invalid/disabled accounts
- Server rejects transactions against closed cycles
- Server verifies collector assignment at sync time
- UI shows clear warning when offline data may be stale

### 4.5 Session Hijacking (Offline)

**Scenario**: Attacker obtains the offline session state from the device.

**Risk**:
- Continued access to cached customer data
- Ability to queue fraudulent transactions

**Mitigations**:
- Session stored as encrypted hash (not raw token)
- Biometric/PIN required to access app
- Device revocation via server (tokenVersion bump)
- Offline session expires after 24 hours
- Password change invalidates all sessions including offline

### 4.6 Network Interception During Sync

**Scenario**: Attacker intercepts sync requests on public WiFi.

**Risk**:
- Transaction data interception
- Transaction modification in transit
- Response manipulation

**Mitigations**:
- HTTPS enforced for all sync requests
- TLS 1.2+ required
- Server validates all transaction data regardless of origin
- Idempotency keys prevent replay even if intercepted
- HSTS header enforced

---

## 5. Security Controls Matrix

| Control | Layer | Implementation |
|---------|-------|----------------|
| AES-GCM encryption | Storage | Web Crypto API, PBKDF2 key derivation |
| Biometric/PIN gate | Access | Device biometric API + app lock |
| 24h offline timeout | Session | Client-side timer + server validation |
| Idempotency keys | Transaction | Device UUID + crypto random |
| Server-side validation | Sync | All financial rules enforced server-side |
| Device enrollment | Identity | Server tracks authorized devices |
| Device revocation | Admin | Admin can disable device access |
| Token versioning | Session | Password change invalidates offline sessions |
| TLS enforcement | Transport | HTTPS only, HSTS header |
| Audit logging | Monitoring | Offline events logged with device ID |

---

## 6. Residual Risks

| Risk | Severity | Acceptance |
|------|----------|------------|
| Rooted/jailbroken device bypasses encryption | High | Accepted — device attestation out of scope for pilot |
| Extended offline period (>24h) with valid session | Medium | Mitigated by forced re-auth |
| Malware on device keylogger captures PIN | Medium | Accepted — standard mobile risk |
| Server downtime during sync window | Low | Mitigated by retry queue |

---

## 7. Security Requirements for Implementation

Before offline financial operations are implemented, the following MUST be verified:

- [ ] All financial data encrypted at rest in IndexedDB
- [ ] Biometric/PIN gate before app access
- [ ] Maximum offline grace period enforced
- [ ] Idempotency keys are cryptographically random
- [ ] Server rejects all invalid transactions during sync
- [ ] Device revocation mechanism works end-to-end
- [ ] Offline session does not persist after password change
- [ ] Audit trail includes device identification
- [ ] Penetration test of offline storage
- [ ] Security review of sync protocol

---

## 8. Review Schedule

This threat model should be reviewed:
- Before each implementation phase
- After any security incident
- When new offline features are added
- At least quarterly during pilot operation
