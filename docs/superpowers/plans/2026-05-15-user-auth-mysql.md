# User Auth And MySQL Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add registration, login, logout, and MySQL-backed per-user chat sessions.

**Architecture:** Add focused server modules for MySQL and auth, expose Next.js API routes for auth and chat session persistence, then hydrate and save the existing Zustand chat store through those APIs. Use whole-session-array persistence first for correctness.

**Tech Stack:** Next.js App Router route handlers, MySQL via `mysql2`, Node `crypto`, Zustand, Jest.

---

### Task 1: Auth Core

**Files:**
- Create: `app/lib/server/auth.ts`
- Test: `test/user-auth.test.ts`

- [ ] Write failing tests for password hashing, verification, token creation, and token hashing.
- [ ] Run `yarn test:ci test/user-auth.test.ts` and verify the tests fail because the module does not exist.
- [ ] Implement auth helpers with Node `crypto`.
- [ ] Run `yarn test:ci test/user-auth.test.ts` and verify pass.

### Task 2: Database Layer

**Files:**
- Create: `app/lib/server/db.ts`
- Create: `app/lib/server/schema.ts`
- Modify: `app/config/server.ts`
- Test: `test/user-schema.test.ts`

- [ ] Write failing tests for schema SQL containing required tables and user indexes.
- [ ] Implement schema SQL and MySQL pool helpers.
- [ ] Add database env vars to server config types.
- [ ] Run targeted tests.

### Task 3: API Routes

**Files:**
- Create: `app/api/auth/register/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/me/route.ts`
- Create: `app/api/chat/sessions/route.ts`

- [ ] Add route handlers using auth and database helpers.
- [ ] Use Node runtime for database routes.
- [ ] Set and clear httpOnly auth cookie.
- [ ] Require auth for chat session routes.

### Task 4: Frontend Auth State

**Files:**
- Create: `app/client/user.ts`
- Modify: `app/components/auth.tsx`
- Modify: `app/components/home.tsx`

- [ ] Add browser client helpers for auth APIs.
- [ ] Replace access-code-only auth page with login/register UI while preserving access-code fields if needed later.
- [ ] Gate main app rendering behind `/api/auth/me`.
- [ ] Load remote chat sessions after login.

### Task 5: Chat Store Persistence

**Files:**
- Modify: `app/store/chat.ts`
- Create: `app/client/chat-sessions.ts`

- [ ] Add server hydrate/save methods.
- [ ] Save after new/delete/move/selectable chat mutations and after message completion.
- [ ] Keep local IndexedDB untouched except as existing fallback storage.

### Task 6: Configuration And Verification

**Files:**
- Modify: `.env.template`
- Modify: `.env.local`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] Add MySQL env vars and `AUTH_SECRET` docs.
- [ ] Add `mysql2` dependency.
- [ ] Run tests.
- [ ] Run typecheck/build if feasible.
- [ ] Create or verify database tables in `hongai`.
