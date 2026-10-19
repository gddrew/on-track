# Migration plan: Appwrite → self-hosted Postgres

Status: proposed (2026-10-19)

## Goal

Remove Appwrite completely. Run the app, its database and auth on infrastructure we control, cheaply enough to sell as a low-cost multi-tenant SaaS to non-profits.

Done means:

- No `node-appwrite` dependency, no Appwrite env vars.
- Every page loads in well under a second with realistic data (hundreds of tasks per workspace).
- Production runs on a single VPS with automatic HTTPS and nightly off-site backups.
- Node 26 works (Appwrite was the blocker).

## Target stack

| Concern  | Choice                                 |
| -------- | -------------------------------------- |
| Database | PostgreSQL 18                          |
| ORM      | Drizzle ORM + drizzle-kit migrations   |
| Auth     | Better Auth (email/password, Google, GitHub; Microsoft later) |
| Files    | Unchanged for now: images stay base64 data URLs in a `text` column (see Phase 6) |
| Email    | SMTP via a transactional provider (needed for password reset and verification) |
| Hosting  | One VPS, Docker Compose: `app`, `postgres`, `caddy` |
| Backups  | Nightly `pg_dump` to S3-compatible object storage |

## Guiding rules

- **Keep the API shape stable.** 36 frontend files read `$id` and some read `$createdAt`. During the migration, the server maps rows to the existing shape (`id → $id`, `createdAt → $createdAt`, and so on) in one helper per entity, so the frontend doesn't change. Renaming the fields is a separate, later cleanup.
- **Port one feature at a time.** Each phase leaves the app working, which makes each phase a reviewable PR.
- **Authorization lives in one place.** With many organizations in one database, a missed membership check means one customer can read another's data.

## Current Appwrite surface

| File | Uses |
| ---- | ---- |
| `src/lib/appwrite.ts` | Session and admin clients |
| `src/lib/session-middleware.ts` | `account.get()` on every API request |
| `src/lib/oauth.ts`, `src/app/oauth/route.ts` | Google/GitHub OAuth via Appwrite tokens |
| `src/features/auth/server/route.ts`, `auth/queries.ts` | Login, register, logout, current user |
| `src/features/workspaces/server/route.ts`, `workspaces/queries.ts` | Workspaces CRUD, invite codes, analytics |
| `src/features/members/server/route.ts`, `members/utils.ts` | Members list and roles, `getMember` |
| `src/features/projects/server/route.ts` | Projects CRUD and analytics |
| `src/features/tasks/server/route.ts` | Tasks CRUD, bulk update (kanban) |
| `src/features/*/types.ts` | `Models.Document` base type |

---

## Phase 0: Postgres and tooling ✅ done 2026-10-19

1. ~~Add `docker-compose.yml` with a `postgres:18` service.~~ Changed: the database lives on the existing Postgres server at **192.168.1.65** (Fedora 44 Server), so there's no local database container.
2. Add `drizzle-orm`, `postgres` (the postgres.js driver) and `drizzle-kit`.
3. Add `src/db/index.ts` (connection) and `drizzle.config.ts`.
4. Add `DATABASE_URL` to `.env.local` and an `.env.example`.
5. Add scripts: `db:generate`, `db:migrate`, `db:studio`.

Done when `bun run db:migrate` runs against an empty database.

## Phase 1: Schema ✅ done 2026-10-19

Implemented in `src/db/schema.ts` (app tables) and `src/db/auth-schema.ts` (Better Auth's `user`, `session`, `account`, `verification`, written by hand to match its defaults; check them against `@better-auth/cli generate` in Phase 2). The migration is `drizzle/0000_init.sql`. It was tested on Postgres 18: removing a member unassigns their tasks, deleting a user leaves their workspaces in place, deleting a workspace removes everything in it, and duplicate memberships are rejected.

Differences from the sketch below: ids are `uuid` with `gen_random_uuid()` (Better Auth's tables keep `text` ids); `owner_id` became `created_by`, nullable with `set null`, because access is decided by `members.role` and a non-profit's workspace must not disappear when its creator's account is deleted.

Original sketch:

```
workspaces
  id            text pk          -- cuid2 / nanoid
  name          text not null
  image_url     text
  invite_code   text not null unique
  owner_id      text not null → user.id
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

members
  id            text pk
  workspace_id  text not null → workspaces.id  on delete cascade
  user_id       text not null → user.id        on delete cascade
  role          member_role not null           -- enum ADMIN | MEMBER
  created_at, updated_at
  unique (workspace_id, user_id)

projects
  id            text pk
  workspace_id  text not null → workspaces.id  on delete cascade
  name          text not null
  image_url     text
  created_at, updated_at
  index (workspace_id)

tasks
  id            text pk
  workspace_id  text not null → workspaces.id  on delete cascade
  project_id    text not null → projects.id    on delete cascade
  assignee_id   text not null → members.id     -- decide: cascade or set null
  name          text not null
  description   text
  status        task_status not null           -- enum, same values as TaskStatus
  position      integer not null
  due_date      timestamptz not null
  created_at, updated_at
  index (workspace_id, status, position)
  index (project_id)
  index (assignee_id)
```

The `on delete cascade` foreign keys take care of the existing `TODO: Delete members, projects and tasks` comments in the workspace and project delete handlers.

Decided: when a member is removed, their tasks become unassigned (`assignee_id` nullable, `on delete set null`). Phase 4 must update `createTaskSchema`, the `Task` type and the task UI to handle a task with no assignee.

Done when the migration is generated and applies cleanly.

## Phase 2: Auth (highest risk)

1. Install Better Auth and configure it with the Drizzle adapter, email/password, and the Google and GitHub providers. Generate its tables.
2. Mount its handler at `/api/auth/*`. Hono and Better Auth both document this setup; check it doesn't collide with the existing `auth` Hono routes and remove those as they're replaced.
3. Replace `sessionMiddleware`: read the session with `auth.api.getSession({ headers })` and set `user` on the context. Drop the `account`, `databases` and `storage` context variables; routes use `db` directly.
4. Replace `getCurrent()` in `features/auth/queries.ts` with the same session lookup (used by server components to redirect).
5. Update the sign-in, sign-up and logout hooks and the OAuth buttons to call Better Auth (its client or `/api/auth/*`). Delete `src/lib/oauth.ts` and `src/app/oauth/route.ts`.
6. Register the OAuth apps' new callback URLs with Google and GitHub.
7. Add password reset over SMTP. The app has none today, and once we're off Appwrite we can't reset passwords from its console.

Done when register, login, logout, Google and GitHub sign-in all work locally, and unauthenticated API calls get 401.

**Split into three parts (decided 2026-10-19).** The data routes reached Appwrite as the signed-in user, so replacing Appwrite login would have broken every page until Phase 4. Each part is its own commit and leaves the app working:

- **2a: email/password ✅ done 2026-10-19.** Better Auth is mounted at `/api/auth/*`, the old Hono auth routes and Appwrite OAuth files are gone, and the four auth hooks call Better Auth. Auth tables were checked against `bunx auth generate`; that added `drizzle/0001_verification_identifier_index.sql`.
  - **Temporary bridge until Phase 4:** `sessionMiddleware` gives routes Appwrite clients that use the **admin API key** (the key now has the `documents.*` and `files.*` scopes). Member names and emails come from the Postgres `user` table (`populateMembers`). Routes still check membership with `getMember`.
  - **Run `next dev` on Node 25 until Phase 4.** node-appwrite 14 fails on Node 26 (`UND_ERR_INVALID_ARG: invalid onError method`).
- **2b: Google and GitHub sign-in ✅ done 2026-10-19.** Microsoft was dropped. Dev OAuth apps are `on-track (dev)` with GitHub and in the Google Cloud project `on-track` (no billing account; the consent screen is in Testing mode, so only listed test users can sign in). Both cards use `SocialSignIn`. Production needs separate OAuth apps or callback URLs, and the Google app published (Phase 7).
- **2c: password reset by email.** Needs an email provider.

## Phase 3: Authorization helper

Replace `getMember` with one helper used by every workspace-scoped route, for example:

```ts
const member = await requireMember(c, workspaceId);           // 401 if not a member
const admin  = await requireMember(c, workspaceId, 'ADMIN');  // 401 if not admin
```

For routes that receive a task, project or member id rather than a workspace id, load the row and its `workspace_id` in one query, then check membership. Better still, join membership into the same query (`where tasks.id = $1 and members.user_id = $2`) so a non-member simply gets "not found".

Done when every route that touches workspace data goes through the helper. List the routes in the PR and check off each one.

## Phase 4: Port the routes

Order, from simplest to hardest:

1. **Workspaces.** List, get, info, create, update, delete, reset invite code, join. Creating a workspace and its admin member happens in one transaction.
2. **Projects.** CRUD.
3. **Members.** List with user name and email (one join, which replaces the N `users.get()` calls), update role, delete.
4. **Tasks.** List with project and assignee joined, get, create, update, delete, bulk update. Run the bulk update in a single transaction.
5. **Analytics** (workspace and project). Replace the 10 sequential queries with one aggregate query using `count(*) filter (where …)` for this month and last month.

While porting:

- Add pagination to list endpoints. Appwrite silently returned only 25 rows; Postgres returns everything, which is also wrong at scale.
- Fix the analytics bug: "last month overdue" filters on `status = DONE` and should be `status != DONE`.
- Move the entity types in `features/*/types.ts` off `Models.Document`. Derive them from the Drizzle schema plus the `$id`/`$createdAt` mapping.
- Remove the leftover `console.log` calls in the tasks list route.
- Replace `Query.search('name', …)` with `ilike` for now. Postgres full-text search can come later.

Done when no file imports `node-appwrite` and every screen works: dashboard, task table, kanban drag and drop, calendar, task detail, project page, settings, members, invite join flow.

## Phase 5: Data migration ⏭️ skipped

Decided 2026-10-19: the Appwrite data is test data, so we start fresh. The notes below are kept only for reference.

- **Test data:** start fresh and skip this phase.
- **Real data:** write `scripts/migrate-from-appwrite.ts`, run once:
  1. Export users with the admin key. Appwrite's Users API returns password hashes (Argon2) along with the hash options. Either import them and configure Better Auth's password verification to accept Argon2, or import users without passwords and send everyone a reset link.
  2. Export workspaces, members, projects and tasks with pagination (more than 25 rows per page).
  3. Insert in dependency order, keeping the Appwrite ids as the new primary keys so the references stay valid.
  4. Verify row counts per table and spot-check a few workspaces in the UI.

Existing sessions won't carry over; everyone signs in again once.

## Phase 6: Uploaded images (can wait until after launch)

Workspace and project images are uploaded to an Appwrite bucket, read back, and stored as base64 data URLs in `imageUrl`, so the bucket copy is never used. For the migration, drop the bucket upload and store the data URL directly, with a size limit (for example 1 MB) in the Zod schema.

Later, move images to S3-compatible storage or disk served by Caddy, and store only a URL. That keeps rows small and list responses fast.

## Phase 7: Production deployment

1. Add a multi-stage `Dockerfile` using Next.js `output: 'standalone'`.
2. Add a production `docker-compose.yml`: `app`, `postgres` (volume, not exposed publicly), `caddy` (ports 80 and 443, automatic TLS).
3. Run `db:migrate` on deploy, before the app starts.
4. Provision a VPS, lock SSH down to keys only, enable the firewall (allow 22, 80, 443) and turn on unattended security updates.
5. Back up: a nightly `pg_dump` container uploads to object storage with 30-day retention. **Test a restore** before calling this done.
6. Add uptime monitoring (a free external pinger is enough to start) and an error-reporting service.
7. Set DNS, then update the OAuth callback URLs and `NEXT_PUBLIC_APP_URL`.

Done when production is live on HTTPS, a restore from last night's backup has been tested, and the Appwrite project can be deleted.

## Phase 8: Cleanup

- Remove `node-appwrite` and every `NEXT_PUBLIC_APPWRITE_*` / `NEXT_APPWRITE_KEY` variable.
- Retry the Node 26 upgrade.
- Optionally rename `$id` / `$createdAt` across the frontend to `id` / `createdAt`.
- Replace the default `README.md` with setup instructions (Docker, env vars, migrations).

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Auth regressions (cookies, OAuth callbacks) | Phase 2 is its own PR and is tested end to end before any routes are ported. |
| One organization seeing another's data | One `requireMember` helper, a checklist of routes, and later Postgres row-level security as a second layer. |
| Losing the database | Tested backups before the first real user. |
| Ops burden on one person | One VPS, three containers, automatic TLS and updates. Nothing runs that doesn't have to. |

## Later, not part of this migration

- Microsoft sign-in (many non-profits use donated Microsoft 365).
- Postgres row-level security keyed on workspace.
- Billing.
- A published self-host bundle (the same compose file) for organizations that want to run their own copy.
