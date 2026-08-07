# EBENEZER Backend

Backend-first API for the EBENEZER Christian events platform (NestJS + TypeScript + MongoDB/Mongoose). Every future client — public website, admin dashboard, QR scanner, mobile app, notifications — talks exclusively to this API.

## Scope of this slice

This is the first vertical slice of a much larger target backend (30+ modules: Volunteers, Notifications, CMS, Donations, Media, Statistics, Audit Logs, etc. - see the original spec). Rather than scaffold all of them at once, this slice builds **one full path end to end** — Participants → Registrations → QRCode → Attendance — plus the minimum supporting modules it depends on (Auth, Users, Roles, Permissions, Events) — in order to establish the conventions every other module should copy.

### What's implemented

- **Auth**: JWT + Passport (`register`, `login`, `me`), bcrypt password hashing.
- **Users**: CRUD, referenced by Auth.
- **Roles**: Mongoose-backed roles with a `permissions: string[]` field. Seed script creates the 11 roles from the spec (Super Admin, Administrateur, Prophète, Pasteur, Responsable Accueil, Responsable Scanner, Responsable Communication, Responsable Média, Responsable Hébergement, Bénévole, Participant).
- **Permissions**: static, code-defined catalog (`src/common/constants/permissions.constant.ts`) exposed read-only via `GET /permissions` - permissions are not end-user-editable data, so there's no database collection for them.
- **Events**: CRUD.
- **Participants**: full CRUD, pagination/filter/sort, soft delete, per-record history.
- **Registrations**: creates a unique `EBEN-{year}-{6-digit sequence}` registration number (atomic counter) and an opaque signed QR code per participant/event pair. Blocks double-registration to the same event.
- **QRCode**: internal service (no HTTP surface) that signs an opaque code with HMAC-SHA256 and renders it as a QR PNG data URL. The signature proves server origin; MongoDB remains the source of truth for status and duplicate checks.
- **Attendance**: `POST /attendance/scan` verifies the QR signature, looks up the registration, records attendance for the current day, and rejects a second scan of the same registration on the same day (enforced by a unique Mongo index, not just application logic).

### Explicitly out of scope for this slice (future work)

Notifications, Email, SMS, WhatsApp, Redis, BullMQ, Socket.io, Volunteers, Teams, CMS, Donations, Media/Gallery/Documents, Reports/Statistics/Dashboard, full Audit Logs module, Docker/Docker Compose. These are real modules in the long-term spec but were deliberately not built here so this slice stays reviewable and its conventions can be validated before being copied 25 more times.

No automated tests are included in this slice by explicit request - none of the usual `*.spec.ts` / e2e scaffolding is expected to be added back without being asked for again.

## Module convention (template for the next modules)

Every module in this codebase follows the same shape:

```
src/<module>/
  <module>.module.ts
  <module>.controller.ts      # thin: DTO in, service call, guards/permissions decorators
  <module>.service.ts         # business logic, throws Nest HTTP exceptions
  schemas/<name>.schema.ts    # @nestjs/mongoose schema classes
  dto/*.dto.ts                # class-validator DTOs, Swagger-annotated
  repositories/*.repository.ts# extends src/common/repositories/base.repository.ts
```

Conventions to reuse:
- **Repository pattern**: extend `BaseRepository<T>` (`src/common/repositories/base.repository.ts`) instead of injecting the Mongoose `Model` directly into services. It provides `create`, `findById`, `findOne`, `findAll` (pagination + sort), `updateById`, `deleteById`. Override `notDeletedFilter()` to opt into soft delete (see `ParticipantsRepository`).
- **Permissions**: add new permission strings to `src/common/constants/permissions.constant.ts` (`resource:action` format), guard routes with `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@Permissions(PERMISSIONS.X.Y)`.
- **Pagination**: accept `PaginationQueryDto` (or extend it, see `QueryParticipantDto`) as the `@Query()` param; the `TransformInterceptor` automatically hoists `{items, meta}` results into the standard `{success, data, meta}` envelope.
- **Errors**: throw Nest's built-in exceptions (`NotFoundException`, `ConflictException`, etc.) - `HttpExceptionFilter` standardizes the response shape and also translates raw Mongo `E11000` duplicate-key errors into `409 Conflict`.

## Setup

Requires a local MongoDB reachable at the configured `MONGODB_URI` (no Docker for this slice).

```bash
npm install
cp .env.example .env   # then fill in JWT_SECRET / QR_SECRET / SEED_SUPER_ADMIN_* with real values
npm run seed:roles     # creates the 11 default roles + one Super Admin user
npm run start:dev
```

API is served under `/api/v1`, Swagger UI at `/api/docs`.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Auth token signing |
| `QR_SECRET` | HMAC key signing the opaque code embedded in each registration's QR |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | Used only by `npm run seed:roles` to create the first admin account |

### Scripts

- `npm run start:dev` - watch mode
- `npm run build` - compile to `dist/`
- `npm run seed:roles` - idempotent: upserts the 11 default roles and (if the env vars are set and the user doesn't already exist) one Super Admin

## Manual verification

The full flow was smoke-tested against a local `mongod`: login as Super Admin → create an Event → create a Participant → create a Registration (unique `EBEN-2026-000001` number + signed QR) → `GET /registrations/:id/qrcode` → scan that QR via `POST /attendance/scan` (attendance recorded, registration flips to `checked-in`) → re-scanning the same QR the same day returns `409`, a forged QR returns `400`, and calling any protected route without a bearer token returns `401`.
