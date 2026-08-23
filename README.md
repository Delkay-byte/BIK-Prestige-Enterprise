# MoMo Module — BIK Prestige Enterprise Platform

This directory contains the MoMo (Mobile Money) business management module and the Next.js application that serves the entire BIK Prestige Enterprise platform.

## Architecture

The MoMo module is part of the BIK Prestige Enterprise platform. It shares authentication, audit logging, and database infrastructure with the Susu module via `shared/core/`.

## Directory Structure

```
Momo module/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── admin/              # Admin dashboard, MoMo management
│   │   ├── worker/             # MoMo worker mobile UI
│   │   ├── collector/          # Susu collector mobile UI
│   │   ├── susu/               # Susu admin pages
│   │   ├── login/              # Authentication
│   │   ├── api/                # API routes
│   │   └── layout.tsx          # Root layout
│   ├── lib/
│   │   ├── auth.ts             # Shared authentication
│   │   ├── db.ts               # Prisma client
│   │   ├── audit.ts            # Shared audit logging
│   │   ├── utils.ts            # Shared utilities
│   │   ├── validations.ts      # MoMo-specific Zod schemas
│   │   └── actions/
│   │       ├── auth.actions.ts           # Shared auth actions
│   │       ├── daily-account.actions.ts  # MoMo daily accounts
│   │       ├── location.actions.ts       # MoMo location management
│   │       └── worker.actions.ts         # MoMo worker management
│   └── middleware.ts            # Route protection
├── prisma/
│   ├── schema.prisma           # Combined MoMo + Susu schema
│   ├── seed.ts                 # Development seed data
│   └── dev.db                  # SQLite database
└── public/
    └── manifest.json           # PWA manifest
```

## MoMo Features

- Location management (create, edit, activate/deactivate)
- Worker management (create, edit, password reset)
- Daily account workflow (open → operate → record → reconcile → submit → review)
- Real-time reconciliation calculation
- Expense recording
- Report filtering and CSV export
- Mobile-first worker interface

## Import Convention

MoMo actions are imported directly:

```typescript
import { createLocation } from "@/lib/actions/location.actions";
import { createDailyAccount } from "@/lib/actions/daily-account.actions";
```

Susu actions are imported via the `@susu/*` path alias:

```typescript
import { createCustomer } from "@susu/actions/susu-customer.actions";
```
