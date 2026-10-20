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
- **2c: password reset and email verification ✅ done 2026-10-19.** Email goes out over SMTP (`src/lib/email.ts`, nodemailer) through Resend, from `noreply@mail.randomlake.cc`, the domain the user's other app already verified; any SMTP provider works by changing `.env.local`. Email/password sign-ups must verify their email before signing in; a fresh link is sent on any sign-in attempt before then. New pages are `/forgot-password` and `/reset-password`. A reset signs out every other session. Reset and verification links expire after 1 hour. Tested end to end with a local Mailpit catcher, not with real email.

## Phase 3: Authorization helper ✅ done 2026-10-20

Still on Appwrite. Every workspace-scoped route now goes through one helper in `src/features/members/utils.ts`:

```ts
const member = await requireMember(c, workspaceId);                            // 403 if not a member
await requireMember(c, workspaceId, { role: MemberRole.ADMIN });               // 403 if not an admin
```

401 means not signed in (session middleware); 403 means signed in but not allowed. Phase 4 changes only the helper's internals. When Phase 4 joins membership into the data query (`where tasks.id = $1 and members.user_id = $2`), a non-member gets "not found" instead.

**Security fixes found in the route audit:**

- **Tasks could reference another workspace's project or member.** Create and update now check that `projectId` and `assigneeId` belong to the task's workspace (`requireInWorkspace`). The task list and task detail also look up projects and members only within the workspace. Phase 4's foreign keys don't prevent this on their own: they need the same check, or composite keys on `(workspace_id, id)`.
- **Bulk update (kanban) checked only the first 25 tasks** (Appwrite's default page size) but updated every id sent. It now requires every id to be found, all in one workspace, before updating any, and returns 400 instead of 200 when they aren't.
- **`/workspaces/:id/info` showed any workspace's name and image to anyone signed in.** It now requires the invite code (`?inviteCode=`). A wrong code and a missing workspace give the same 404.
- `Query.contains('$id', …)` is a substring match in Appwrite; the task routes now use exact `Query.equal`. The same pattern in the workspace list is replaced in Phase 4.

**Invite links survive sign-in (bug found while testing; existed since the first commit).** The join page used to send signed-out visitors to plain `/sign-in`, so after signing in they landed on "create a workspace". It now sends them to `/sign-in?callbackUrl=<invite>`, and email/password, Google/GitHub, and sign-up plus email verification all return there. The "Sign Up" / "Login" links in the card and the header button keep the callback. `safeCallbackUrl` (`src/features/auth/utils.ts`) accepts only paths on this site.

**Route checklist.** "Member" means a member of the workspace that owns the resource, never of some other workspace.

| Route | Who can use it |
| ----- | -------------- |
| `GET /workspaces` | Signed in; returns only workspaces they're a member of |
| `POST /workspaces` | Signed in; creator becomes its admin |
| `GET /workspaces/:id` | Member |
| `GET /workspaces/:id/info` | Signed in, with the workspace's invite code |
| `GET /workspaces/:id/analytics` | Member |
| `PATCH /workspaces/:id` | Admin |
| `DELETE /workspaces/:id` | Admin |
| `POST /workspaces/:id/reset-invite-code` | Admin |
| `POST /workspaces/:id/join` | Signed in, not yet a member, with the invite code |
| `GET /members?workspaceId=` | Member |
| `PATCH /members/:id` (role) | Admin |
| `DELETE /members/:id` | Admin, or the member removing themselves |
| `GET /projects?workspaceId=` | Member |
| `POST /projects` | Member |
| `GET /projects/:id` | Member |
| `GET /projects/:id/analytics` | Member |
| `PATCH /projects/:id` | Member |
| `DELETE /projects/:id` | **Admin** (was any member) |
| `GET /tasks?workspaceId=` | Member |
| `POST /tasks` | Member; project and assignee must be in the same workspace |
| `GET /tasks/:id` | Member |
| `PATCH /tasks/:id` | Member; project and assignee must be in the same workspace |
| `DELETE /tasks/:id` | Member |
| `POST /tasks/bulk-update` | Member; every task must exist and be in that one workspace |
| `/api/auth/*` | Better Auth |

## Phase 4: Port the routes

**Split into five steps (decided 2026-10-20).** Postgres enforces the links between tables, so a table moves only after the tables it points at. Each step resets that step's test data. Until a table moves, its Appwrite rows simply store the new Postgres ids.

- **4a: workspaces and members ✅ done 2026-10-20.**
  - `requireMember`, `getMember` and `listMembers` (`src/features/members/utils.ts`) read Postgres. The member list gets names and emails in one join instead of a lookup per member.
  - Routes that look something up by its own id answer a non-member with **404**, the same as a missing id, so other workspaces' ids can't be probed (`orNotFound`). A member lacking the admin role still gets 403. Malformed ids are treated as missing (`isUuid`) instead of causing a database error.
  - Creating a workspace and its first admin is one transaction. Join can't create a duplicate membership.
  - Images: PNG, JPEG, GIF or WebP up to 1 MB, stored as data URLs (`src/lib/images.ts`), with no Appwrite bucket. SVG is no longer accepted because it can carry scripts. Editing without a new file keeps the image; there is still no way to remove one (existing behavior).
  - Invite codes come from the secure random generator instead of `Math.random()`.
  - Responses keep the Appwrite shape via `toApi` / `toApiList` (`src/db/api-shape.ts`).
  - Temporary: deleting a workspace leaves its projects and tasks in Appwrite (unreachable) until 4b/4c.
  - **Permanent tests:** `bun test` (`tests/`) calls the API in-process against `TEST_DATABASE_URL` from `.env.test.local`, a local `on_track_test` database. It refuses any database whose name doesn't end in `_test`, and email is stubbed out. 37 tests cover workspaces and members, including cross-workspace access; with the membership check disabled, 22 fail. The Hono app moved to `src/server/app.ts` so tests can import it.
- **4b: projects.** ✅ Done.
  - Projects are in Postgres. Shared lookups in `src/features/projects/utils.ts`: `requireProject` answers a missing project and another workspace's project with the same 404, and `listProjects` replaces the Appwrite lookups in the task routes.
  - Any member can create and edit; only admins can delete. Images use the same rules as workspaces (PNG, JPEG, GIF or WebP, up to 1 MB, no SVG); editing without a new file keeps the image.
  - Deleting a project or workspace removes its projects in Postgres; the database will remove their tasks once 4c moves them.
  - Temporary until 4c: Appwrite tasks whose project no longer exists in Postgres (including every task created before 4b) are hidden from the task list, and opening one gives 404.
  - Known, not new: "Remove Image" on the edit forms doesn't save; the image comes back. Same for workspaces.
  - Tests: 16 more (53 in all). With the project access check disabled, 4 fail.
- **4c: tasks.** One query for the list with project and assignee; kanban bulk update in one transaction; search; unassigned tasks in the UI.
- **4d: analytics.** One query per page; fix the "last month overdue" bug.
- **4e: remove Appwrite.** Drop `node-appwrite` and its settings and the test stand-in; back to Node 26.

The original notes:

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

- ~~Password fields: a show/hide toggle and a "confirm password" field.~~ Done 2026-10-19 with Phase 2: `PasswordInput` on sign-in, sign-up and reset; sign-up and reset also ask for confirmation.
- ~~Remove `console.log({ user })` from the sign-in page.~~ Done 2026-10-19.
- **Organizations (tenants), to design before launch.** Today a workspace is effectively the tenant. Add an organization level, one per non-profit, owning one or more workspaces, with its own users and admins (and later billing). Requirement from the user: non-profit A must not be able to learn anything about non-profit B, and vice versa. `requireMember` is where organization scoping goes. Because the data is test data, adding the table is a cheap migration.
- **Platform admin (the system manager), to design before launch.** One explicit role that can see across all organizations. Its access should be logged, so a non-profit can know when its data was viewed, rather than skipping the normal checks silently.
- **Agile work hierarchy (next project, after this migration).** Replace "projects → tasks" with Initiatives → Epics → Features → Story | Task | Bug. Phase 4 keeps today's tables as they are; the hierarchy will be its own migration.
- Return to the original page after sign-in for the other signed-in-only pages (task, project, settings, members), using the same `callbackUrl` as the join page.
- Microsoft sign-in (dropped for now; many non-profits use donated Microsoft 365).
- Postgres row-level security keyed on workspace (or organization).
- Billing.
- A published self-host bundle (the same compose file) for organizations that want to run their own copy.
