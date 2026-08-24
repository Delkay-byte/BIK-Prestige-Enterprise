# OFFLINE ONE-DEVICE PILOT REPORT

**BIK Prestige Enterprise — Susu Offline Collections**

Date: 2026-08-25
Status: **READY FOR FIELD TESTING**

---

## Device

- **User:** [Designated collector name]
- **Module:** Susu
- **Device:** [Android phone model]
- **Enrollment:** Active
- **Authorization timeout:** 24 hours

## Offline Security Controls

| Control | Status |
|---------|--------|
| Device enrollment | ✅ Implemented |
| Device revocation | ✅ Server-enforced |
| Offline auth timeout (24h) | ✅ Server-enforced |
| Replay protection (idempotency) | ✅ Implemented |
| Logout with pending queue | ✅ Warning shown |
| Sync failure classification | ✅ Retryable vs permanent |
| Audit logging | ✅ All events recorded |
| Password reset invalidation | ✅ Server checks on sync |
| Assignment change detection | ✅ Server rechecks on sync |

## How Offline Authorization Works

1. Collector logs in online → device enrolls via `/api/offline/enroll`
2. Server sets `authorizedAt` timestamp
3. Collector goes offline → can create transactions for up to 24 hours
4. Each successful sync extends the 24-hour window (`authorizedAt = now`)
5. If offline > 24 hours → "Reconnect required" → no new offline transactions
6. Admin can revoke device at any time → server rejects future sync

**The server is authoritative.** Client cannot extend its own authorization.

## Test Checklist (Field Tests)

### Online Baseline
- [ ] Collector logs in
- [ ] Assigned customers visible
- [ ] Online contribution works
- [ ] Admin sees contribution

### Device Enrollment
- [ ] Device appears in Admin → Offline Devices
- [ ] Status: Active
- [ ] Enrollment time correct

### Offline Collection
- [ ] Airplane mode → "Offline" indicator
- [ ] GH₵50 → saved on device
- [ ] GH₵350 → saved on device
- [ ] GH₵700 → saved on device
- [ ] GH₵725 → saved on device
- [ ] Clear "Saved on device" message (NOT "Recorded by BIK Prestige")

### App Restart
- [ ] Close browser while offline
- [ ] Reopen → pending transactions preserved
- [ ] No duplicates created

### Logout with Pending Queue
- [ ] Warning shows pending count
- [ ] Cancel → stays logged in
- [ ] Sign Out Anyway → session ends, queue preserved

### Reconnect & Sync
- [ ] Turn off airplane mode
- [ ] Sync begins automatically
- [ ] Transactions become "Recorded by BIK Prestige"
- [ ] Dashboard updates

### Admin Verification
- [ ] Contributions visible in admin
- [ ] Correct amounts
- [ ] Correct collector attribution
- [ ] Correct allocation (days covered)
- [ ] Audit entries present

### Financial Allocation (after sync)
- [ ] GH₵350 → 7 days covered
- [ ] GH₵700 → 14 days covered
- [ ] GH₵725 → 14 days + GH₵25 remainder

### Duplicate Prevention
- [ ] Same idempotency key → only one server transaction
- [ ] Response-lost retry → no duplicate

### Device Revocation
- [ ] Admin revokes device
- [ ] Collector goes offline
- [ ] Records transaction
- [ ] Reconnects → sync rejected
- [ ] No unauthorized transaction committed

### Offline Auth Timeout
- [ ] Wait > 24 hours offline (or use test shortened value)
- [ ] "Reconnect required" shown
- [ ] Cannot create new offline transactions

### Physical Card Reconciliation
- [ ] Compare physical Susu card against digital records
- [ ] Amounts match
- [ ] Days covered match
- [ ] Remaining balance matches

## Known Limitations

1. **In-memory rate limiting** — resets on server restart (pilot only)
2. **No email/SMS password recovery** — emergency recovery via database only
3. **Single device per pilot** — not tested with multiple concurrent offline devices
4. **Browser encryption** — protects against casual extraction, not determined attacker with device access
5. **No offline MoMo** — future phase

## Security Notes

- Encryption key derived from user session via PBKDF2 (100k iterations)
- AES-256-GCM for transaction encryption
- Device ID stored in IndexedDB (not localStorage)
- Server validates device enrollment on every sync
- Server validates collector-customer assignment on every sync
- Server validates account status and active cycle on every sync
- All rejections are audit-logged

## MoMo Offline

**Still disabled.** OFFLINE_MOMO_ENABLED=false

MoMo offline daily accounts require separate financial reconciliation verification.
