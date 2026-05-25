# User Auth And MySQL Sessions Design

## Goal

Add a formal user system to this NextChat fork: users can register, log in, log out, and only see their own chat sessions. Existing local IndexedDB chat history is left untouched and is not imported.

## Scope

- Add MySQL-backed users, auth sessions, chat sessions, and chat messages.
- Use the existing MySQL database `hongai`.
- Use httpOnly cookies for login state.
- Keep the existing access-code/API-key model proxy authorization logic separate from user login.
- After login, use server-side chat sessions rather than old local-only sessions.

## Architecture

Server-side auth lives under `app/lib/server/auth.ts` and database access under `app/lib/server/db.ts`. API routes expose registration, login, logout, current-user lookup, and session persistence. The browser calls these APIs and hydrates the existing Zustand chat store with the current user's server sessions.

Chat persistence uses a whole-state save in the first version: the client sends the current session array to `/api/chat/sessions`, and the server rewrites that user's chat rows in a transaction. This favors correctness and a small integration surface over incremental write complexity.

## Data Model

- `users`: email, display name, password hash, timestamps.
- `auth_sessions`: opaque session token hash, user id, expiry, timestamps.
- `chat_sessions`: user id, client session id, topic, memory, stats, mask JSON, ordering timestamps.
- `chat_messages`: user id, client session id, message id, role, content JSON, metadata JSON, date/order.

## Behavior

- Unauthenticated users are redirected to `/#/auth`.
- Auth page supports register/login mode.
- Successful login registers an httpOnly cookie and redirects to chat.
- `GET /api/auth/me` returns the current user or `401`.
- `GET /api/chat/sessions` returns only the current user's sessions.
- `PUT /api/chat/sessions` persists only the current user's sessions.
- Logout clears the cookie and redirects to auth.

## Non-Goals

- No automatic import of old IndexedDB history.
- No password reset or email verification in this version.
- No admin UI for users.
- No per-message incremental sync in this version.
