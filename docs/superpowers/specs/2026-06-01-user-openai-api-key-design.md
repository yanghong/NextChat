# User OpenAI API Key Binding Design

## Goal

Logged-in users must bind their own OpenAI-compatible API key before they can use OpenAI chat models. The key is stored on the server, associated with the user account, and reused across devices. OpenAI proxy requests must use the bound user key instead of the shared server `OPENAI_API_KEY`.

This design only covers OpenAI-compatible requests handled by the existing OpenAI proxy path. Other providers such as Google, Anthropic, DeepSeek, and image/realtime-specific settings stay unchanged unless they already route through the OpenAI proxy.

## Current Context

The app already has MySQL-backed authentication:

- `users`, `auth_sessions`, `chat_sessions`, and `chat_messages` are created from `app/lib/server/schema.ts`.
- Login session lookup is handled by `getUserBySessionToken()` in `app/lib/server/user-repository.ts`.
- Model proxy authorization is centralized in `app/api/auth.ts`.
- OpenAI proxy requests call `auth(req, ModelProvider.GPT)` in `app/api/openai.ts`, then forward through `requestOpenai(req)` in `app/api/common.ts`.

Today, a logged-in user can pass proxy auth even without a user-supplied key. When no client key is present, `auth()` injects a random shared server key from `OPENAI_API_KEY`.

## Requirements

- A logged-in user can save, update, and delete their OpenAI-compatible API key.
- The saved key must live in MySQL so it works after login from another device.
- The frontend must not receive the plaintext saved key from the server.
- OpenAI chat requests from logged-in users must fail clearly when no key is bound.
- OpenAI chat requests from logged-in users with a bound key must use that key in the upstream `Authorization` header.
- Existing non-OpenAI providers are out of scope.
- Existing anonymous/access-code behavior should remain unchanged unless a request is authenticated as a logged-in user.

## Data Model

Add a `user_api_keys` table to the auth schema:

```sql
CREATE TABLE IF NOT EXISTS user_api_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(64) NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_api_keys_user_provider (user_id, provider),
  KEY idx_user_api_keys_user (user_id),
  CONSTRAINT fk_user_api_keys_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

The first supported provider value is `openai`.

Keys should be encrypted before storage. The encryption helper should use AES-256-GCM with a server-only secret from an environment variable such as `USER_API_KEY_ENCRYPTION_SECRET`. If that secret is missing, key save/read operations should fail with a clear server configuration error rather than storing plaintext.

## Server Repository

Add a focused repository module for user API keys:

- `getUserApiKey(userId, provider)` returns the decrypted key or `null`.
- `hasUserApiKey(userId, provider)` returns a boolean without exposing the key.
- `upsertUserApiKey(userId, provider, apiKey)` encrypts and stores the key.
- `deleteUserApiKey(userId, provider)` removes the key.

The repository should call `ensureAuthSchema()` before database access, matching the existing auth repository pattern.

## API Routes

Add `/api/user/api-key` with login-required handlers:

- `GET`: returns `{ hasOpenAIKey: boolean }`.
- `PUT`: accepts `{ provider: "openai", apiKey: string }`, validates a non-empty string, stores it, and returns `{ hasOpenAIKey: true }`.
- `DELETE`: accepts `provider=openai` or a JSON body with `{ provider: "openai" }`, deletes the key, and returns `{ hasOpenAIKey: false }`.

The API must never return the plaintext key.

## OpenAI Proxy Behavior

Update `auth(req, modelProvider)` so the GPT/OpenAI branch distinguishes logged-in users from anonymous/access-code users.

For `ModelProvider.GPT`:

1. If the request has a valid logged-in session:
   - Ignore any shared `OPENAI_API_KEY` fallback.
   - Look up the user key for provider `openai`.
   - If missing, return an auth error such as `请先在设置中填写 API Key`.
   - If present, set `Authorization: Bearer <userKey>` on the proxied request.
2. If the request is not logged in:
   - Keep the existing access-code and client-supplied key behavior.

This keeps existing deployment compatibility while making logged-in usage require a bound key.

## Frontend Behavior

Add a small account-level API key panel in settings:

- Shows whether an OpenAI API key is bound.
- Lets the user paste a new key and save it.
- Lets the user delete the saved key.
- Does not display the saved plaintext key after refresh or cross-device login.

When an OpenAI chat request fails because the user has no bound key, the chat should show a clear error and guide the user to Settings. The first implementation can rely on the existing chat error surface if the server message is explicit.

## Security Notes

- Do not log plaintext API keys.
- Do not return plaintext API keys to the browser after saving.
- Do not store plaintext API keys in MySQL.
- Keep the encryption secret outside source control and deployment images.
- Avoid using the existing local `openaiApiKey` setting as the source of truth for logged-in users; it is browser-local and does not satisfy cross-device use.

## Testing

Add tests for:

- Schema: `user_api_keys` table exists and enforces unique `(user_id, provider)`.
- Repository/encryption: save, read, update, and delete a key; verify plaintext is not stored as-is.
- Auth helper behavior: a logged-in OpenAI request without a bound key is rejected; with a bound key it injects that key instead of the shared system key.
- API route behavior: `GET` returns only key presence; `PUT` saves; `DELETE` clears.

## Rollout

1. Add the schema migration through `AUTH_SCHEMA_SQL`.
2. Add encryption config to deployment environment before enabling key save/read in production.
3. Deploy backend and frontend together.
4. Existing users will be able to log in but will need to bind an API key before OpenAI chat works.
