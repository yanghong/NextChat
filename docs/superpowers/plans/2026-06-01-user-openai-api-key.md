# User OpenAI API Key Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require logged-in users to save an OpenAI-compatible API key on the server before they can chat through the OpenAI proxy, and use that saved key for upstream requests.

**Architecture:** Store encrypted per-user provider keys in MySQL, expose a login-required account API for key presence/save/delete, and update the centralized model proxy auth path to inject the logged-in user's OpenAI key. Add a compact settings panel that manages the server-side key without ever displaying stored plaintext.

**Tech Stack:** Next.js app routes, MySQL via `mysql2/promise`, Node `crypto`, existing auth cookie/session helpers, React settings UI, Jest, TypeScript.

---

## File Structure

- Create `app/lib/server/user-api-key-crypto.ts`
  - Owns API key encryption and decryption with AES-256-GCM.
  - Reads `USER_API_KEY_ENCRYPTION_SECRET` through server config.
  - Has no database dependencies.

- Create `app/lib/server/user-api-key-repository.ts`
  - Owns CRUD for `user_api_keys`.
  - Calls `ensureAuthSchema()` before DB access.
  - Only returns decrypted keys to server-side callers.

- Create `app/api/user/api-key/route.ts`
  - Owns login-required GET/PUT/DELETE API for the current user's OpenAI key.
  - Never returns plaintext keys.

- Create `app/client/user-api-key.ts`
  - Owns frontend fetch helpers for the key presence/save/delete API.

- Modify `app/lib/server/schema.ts`
  - Adds the `user_api_keys` table.

- Modify `app/config/server.ts`
  - Adds `USER_API_KEY_ENCRYPTION_SECRET` to the env type and returned server config.

- Modify `app/api/auth.ts`
  - Makes logged-in OpenAI requests require a saved user key.
  - Injects the saved key into `Authorization`.

- Modify `app/components/settings.tsx`
  - Adds a server-backed OpenAI key panel near the existing access/model settings.

- Modify `app/locales/cn.ts`, `app/locales/en.ts`, and optionally `app/locales/tw.ts`
  - Adds labels and status copy for the new settings panel.
  - Other locales can fall back through the existing locale merge behavior.

- Modify tests:
  - `test/user-schema.test.ts`
  - `test/user-auth.test.ts`
  - `test/model-proxy-auth.test.ts`
  - Add `test/user-api-key-crypto.test.ts`

---

### Task 1: Schema And Server Config

**Files:**
- Modify: `app/lib/server/schema.ts`
- Modify: `app/config/server.ts`
- Test: `test/user-schema.test.ts`

- [ ] **Step 1: Write failing schema/config tests**

Add expectations to `test/user-schema.test.ts`:

```ts
test("defines per-user API key table", () => {
  expect(AUTH_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS user_api_keys");
  expect(AUTH_SCHEMA_SQL).toContain("api_key_ciphertext TEXT NOT NULL");
  expect(AUTH_SCHEMA_SQL).toContain(
    "UNIQUE KEY uniq_user_api_keys_user_provider",
  );
  expect(AUTH_SCHEMA_SQL).toContain("CONSTRAINT fk_user_api_keys_user");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next' --runTestsByPath test/user-schema.test.ts
```

Expected: FAIL because `user_api_keys` is not in `AUTH_SCHEMA_SQL`.

- [ ] **Step 3: Add table to schema**

In `app/lib/server/schema.ts`, add this table after `auth_sessions`:

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

- [ ] **Step 4: Add server config env**

In `app/config/server.ts`:

```ts
USER_API_KEY_ENCRYPTION_SECRET?: string;
```

Return:

```ts
userApiKeyEncryptionSecret: process.env.USER_API_KEY_ENCRYPTION_SECRET,
```

- [ ] **Step 5: Run test to verify it passes**

Run the same `test/user-schema.test.ts` command.

- [ ] **Step 6: Commit**

```bash
git add app/lib/server/schema.ts app/config/server.ts test/user-schema.test.ts
git commit -m "feat: add user api key schema"
```

---

### Task 2: API Key Encryption Helper

**Files:**
- Create: `app/lib/server/user-api-key-crypto.ts`
- Test: `test/user-api-key-crypto.test.ts`

- [ ] **Step 1: Write failing crypto tests**

Create `test/user-api-key-crypto.test.ts`:

```ts
import {
  decryptUserApiKey,
  encryptUserApiKey,
} from "@/app/lib/server/user-api-key-crypto";

describe("user api key crypto", () => {
  test("encrypts without storing plaintext and decrypts back", () => {
    const secret = "test-secret-for-user-api-key-encryption";
    const plaintext = "sk-test-123";

    const ciphertext = encryptUserApiKey(plaintext, secret);

    expect(ciphertext).not.toContain(plaintext);
    expect(decryptUserApiKey(ciphertext, secret)).toBe(plaintext);
  });

  test("requires an encryption secret", () => {
    expect(() => encryptUserApiKey("sk-test", "")).toThrow(
      "USER_API_KEY_ENCRYPTION_SECRET",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next' --runTestsByPath test/user-api-key-crypto.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement crypto helper**

Create `app/lib/server/user-api-key-crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(secret: string) {
  if (!secret.trim()) {
    throw new Error("USER_API_KEY_ENCRYPTION_SECRET is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptUserApiKey(plaintext: string, secret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptUserApiKey(ciphertext: string, secret: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = ciphertext.split(":");
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Unsupported user API key ciphertext");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Run crypto test to verify it passes**

Run the same `test/user-api-key-crypto.test.ts` command.

- [ ] **Step 5: Commit**

```bash
git add app/lib/server/user-api-key-crypto.ts test/user-api-key-crypto.test.ts
git commit -m "feat: encrypt user api keys"
```

---

### Task 3: User API Key Repository

**Files:**
- Create: `app/lib/server/user-api-key-repository.ts`
- Test: `test/user-api-key-crypto.test.ts` or a new repository unit test with mocked DB if practical

- [ ] **Step 1: Write failing repository surface test**

If mocking `getDbPool()` is too heavy in the current Jest ESM setup, add a focused export-shape test in `test/user-api-key-crypto.test.ts`:

```ts
import {
  deleteUserApiKey,
  getUserApiKey,
  hasUserApiKey,
  upsertUserApiKey,
} from "@/app/lib/server/user-api-key-repository";

test("exposes user api key repository operations", () => {
  expect(typeof getUserApiKey).toBe("function");
  expect(typeof hasUserApiKey).toBe("function");
  expect(typeof upsertUserApiKey).toBe("function");
  expect(typeof deleteUserApiKey).toBe("function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next' --runTestsByPath test/user-api-key-crypto.test.ts
```

Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement repository**

Create `app/lib/server/user-api-key-repository.ts`:

```ts
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getServerSideConfig } from "@/app/config/server";
import { ensureAuthSchema, getDbPool } from "./db";
import { decryptUserApiKey, encryptUserApiKey } from "./user-api-key-crypto";

export const OPENAI_USER_API_KEY_PROVIDER = "openai";

type UserApiKeyRow = RowDataPacket & {
  api_key_ciphertext: string;
};

function getEncryptionSecret() {
  const secret = getServerSideConfig().userApiKeyEncryptionSecret ?? "";
  if (!secret.trim()) {
    throw new Error("USER_API_KEY_ENCRYPTION_SECRET is not configured");
  }
  return secret;
}

export async function getUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  const [rows] = await getDbPool().execute<UserApiKeyRow[]>(
    "SELECT api_key_ciphertext FROM user_api_keys WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, provider],
  );

  const row = rows[0];
  if (!row) return null;
  return decryptUserApiKey(row.api_key_ciphertext, getEncryptionSecret());
}

export async function hasUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  const [rows] = await getDbPool().execute<RowDataPacket[]>(
    "SELECT id FROM user_api_keys WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, provider],
  );
  return rows.length > 0;
}

export async function upsertUserApiKey(
  userId: number,
  provider: string,
  apiKey: string,
) {
  await ensureAuthSchema();
  const ciphertext = encryptUserApiKey(apiKey.trim(), getEncryptionSecret());
  await getDbPool().execute<ResultSetHeader>(
    `INSERT INTO user_api_keys (user_id, provider, api_key_ciphertext)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE api_key_ciphertext = VALUES(api_key_ciphertext)`,
    [userId, provider, ciphertext],
  );
}

export async function deleteUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  await getDbPool().execute<ResultSetHeader>(
    "DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?",
    [userId, provider],
  );
}
```

- [ ] **Step 4: Run focused tests**

Run the same Jest command.

- [ ] **Step 5: Commit**

```bash
git add app/lib/server/user-api-key-repository.ts test/user-api-key-crypto.test.ts
git commit -m "feat: add user api key repository"
```

---

### Task 4: Account API Route And Client Helper

**Files:**
- Create: `app/api/user/api-key/route.ts`
- Create: `app/client/user-api-key.ts`

- [ ] **Step 1: Write failing client helper test if existing setup supports it**

If fetch mocking is straightforward, add a small test for client helper request methods. If not, keep this task verified by TypeScript and manual route calls after implementation.

- [ ] **Step 2: Create route**

Create `app/api/user/api-key/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/app/lib/server/user-repository";
import {
  deleteUserApiKey,
  hasUserApiKey,
  OPENAI_USER_API_KEY_PROVIDER,
  upsertUserApiKey,
} from "@/app/lib/server/user-api-key-repository";

export const runtime = "nodejs";

function providerFrom(value: unknown) {
  return value === OPENAI_USER_API_KEY_PROVIDER
    ? OPENAI_USER_API_KEY_PROVIDER
    : null;
}

export async function GET() {
  const user = await requireCurrentUser();
  const hasOpenAIKey = await hasUserApiKey(
    user.id,
    OPENAI_USER_API_KEY_PROVIDER,
  );
  return NextResponse.json({ hasOpenAIKey });
}

export async function PUT(req: NextRequest) {
  const user = await requireCurrentUser();
  const body = (await req.json()) as { provider?: string; apiKey?: string };
  const provider = providerFrom(body.provider);

  if (!provider || !body.apiKey?.trim()) {
    return NextResponse.json(
      { error: true, msg: "请输入有效 API Key" },
      { status: 400 },
    );
  }

  await upsertUserApiKey(user.id, provider, body.apiKey);
  return NextResponse.json({ hasOpenAIKey: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireCurrentUser();
  const provider =
    providerFrom(req.nextUrl.searchParams.get("provider")) ??
    OPENAI_USER_API_KEY_PROVIDER;

  await deleteUserApiKey(user.id, provider);
  return NextResponse.json({ hasOpenAIKey: false });
}
```

Wrap `requireCurrentUser()` failures only if needed to match existing route error style.

- [ ] **Step 3: Create frontend client helper**

Create `app/client/user-api-key.ts`:

```ts
type UserApiKeyState = {
  hasOpenAIKey: boolean;
  msg?: string;
};

async function parse(response: Response) {
  const data = (await response.json()) as UserApiKeyState;
  if (!response.ok) {
    throw new Error(data.msg || "API Key request failed");
  }
  return data;
}

export async function getUserApiKeyState() {
  const response = await fetch("/api/user/api-key", { method: "GET" });
  return parse(response);
}

export async function saveUserOpenAIKey(apiKey: string) {
  const response = await fetch("/api/user/api-key", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "openai", apiKey }),
  });
  return parse(response);
}

export async function deleteUserOpenAIKey() {
  const response = await fetch("/api/user/api-key?provider=openai", {
    method: "DELETE",
  });
  return parse(response);
}
```

- [ ] **Step 4: Run type check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/user/api-key/route.ts app/client/user-api-key.ts
git commit -m "feat: add user api key route"
```

---

### Task 5: Enforce Bound Key In OpenAI Proxy

**Files:**
- Modify: `app/api/auth.ts`
- Test: `test/model-proxy-auth.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Refactor logic into a pure helper before changing async request behavior. Add to `test/model-proxy-auth.test.ts`:

```ts
import { shouldRequireBoundOpenAIKey } from "@/app/api/auth";

test("requires bound OpenAI key for logged-in GPT requests", () => {
  expect(
    shouldRequireBoundOpenAIKey({
      modelProvider: "GPT",
      hasUserSession: true,
      hasBoundUserApiKey: false,
    }),
  ).toBe(true);
});

test("does not require bound key for anonymous GPT requests", () => {
  expect(
    shouldRequireBoundOpenAIKey({
      modelProvider: "GPT",
      hasUserSession: false,
      hasBoundUserApiKey: false,
    }),
  ).toBe(false);
});
```

Use the actual `ModelProvider.GPT` enum in the final test.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next' --runTestsByPath test/model-proxy-auth.test.ts
```

Expected: FAIL because helper is not exported.

- [ ] **Step 3: Update session lookup to return user**

In `app/api/auth.ts`, replace `hasValidUserSession()` with a helper that returns the user:

```ts
async function getValidUserSession(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await getUserBySessionToken(token);
  } catch (error) {
    console.error("[Auth] failed to verify user session", error);
    return null;
  }
}
```

- [ ] **Step 4: Add pure helper**

```ts
export function shouldRequireBoundOpenAIKey(options: {
  modelProvider: ModelProvider;
  hasUserSession: boolean;
  hasBoundUserApiKey: boolean;
}) {
  return (
    options.modelProvider === ModelProvider.GPT &&
    options.hasUserSession &&
    !options.hasBoundUserApiKey
  );
}
```

- [ ] **Step 5: Enforce saved key for logged-in GPT requests**

In `auth(req, modelProvider)`:

```ts
const user = await getValidUserSession(req);
const hasUserSession = !!user;
```

Before the existing system-key injection block:

```ts
if (modelProvider === ModelProvider.GPT && user) {
  const userApiKey = await getUserApiKey(
    user.id,
    OPENAI_USER_API_KEY_PROVIDER,
  );

  if (!userApiKey) {
    return {
      error: true,
      msg: "请先在设置中填写 API Key",
    };
  }

  req.headers.set("Authorization", `Bearer ${userApiKey}`);
  return { error: false };
}
```

This intentionally short-circuits logged-in GPT requests so they do not fall back to `OPENAI_API_KEY`.

- [ ] **Step 6: Run focused auth tests**

Run the same `test/model-proxy-auth.test.ts` command.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth.ts test/model-proxy-auth.test.ts
git commit -m "feat: require bound openai key for users"
```

---

### Task 6: Settings UI For Server-Bound Key

**Files:**
- Modify: `app/components/settings.tsx`
- Modify: `app/locales/cn.ts`
- Modify: `app/locales/en.ts`
- Optional: `app/locales/tw.ts`

- [ ] **Step 1: Add locale copy**

Add under `Settings.Access`:

```ts
UserOpenAIKey: {
  Title: "OpenAI API Key",
  SubTitle: "登录后需保存你的 API Key，聊天请求将使用这把 Key",
  Configured: "已设置",
  Missing: "未设置",
  Placeholder: "输入 API Key",
  Save: "保存",
  Delete: "删除",
  Saved: "API Key 已保存",
  Deleted: "API Key 已删除",
}
```

Use English equivalents in `app/locales/en.ts`.

- [ ] **Step 2: Add state and API helper imports**

In `app/components/settings.tsx`, import:

```ts
import {
  deleteUserOpenAIKey,
  getUserApiKeyState,
  saveUserOpenAIKey,
} from "../client/user-api-key";
```

Inside `Settings()` add state:

```ts
const [userOpenAIKeyInput, setUserOpenAIKeyInput] = useState("");
const [hasUserOpenAIKey, setHasUserOpenAIKey] = useState(false);
const [loadingUserOpenAIKey, setLoadingUserOpenAIKey] = useState(false);
```

- [ ] **Step 3: Load key state**

In an effect after auth/client setup:

```ts
useEffect(() => {
  setLoadingUserOpenAIKey(true);
  getUserApiKeyState()
    .then((state) => setHasUserOpenAIKey(state.hasOpenAIKey))
    .catch(() => setHasUserOpenAIKey(false))
    .finally(() => setLoadingUserOpenAIKey(false));
}, []);
```

- [ ] **Step 4: Add `userOpenAIKeyComponent`**

Place this before existing custom provider controls:

```tsx
const userOpenAIKeyComponent = (
  <ListItem
    title={Locale.Settings.Access.UserOpenAIKey.Title}
    subTitle={`${Locale.Settings.Access.UserOpenAIKey.SubTitle} (${
      hasUserOpenAIKey
        ? Locale.Settings.Access.UserOpenAIKey.Configured
        : Locale.Settings.Access.UserOpenAIKey.Missing
    })`}
  >
    <PasswordInput
      aria={Locale.Settings.ShowPassword}
      aria-label={Locale.Settings.Access.UserOpenAIKey.Title}
      value={userOpenAIKeyInput}
      type="text"
      placeholder={Locale.Settings.Access.UserOpenAIKey.Placeholder}
      onChange={(e) => setUserOpenAIKeyInput(e.currentTarget.value)}
    />
    <IconButton
      text={Locale.Settings.Access.UserOpenAIKey.Save}
      icon={<ConfirmIcon />}
      disabled={loadingUserOpenAIKey || !userOpenAIKeyInput.trim()}
      onClick={() => {
        setLoadingUserOpenAIKey(true);
        saveUserOpenAIKey(userOpenAIKeyInput)
          .then((state) => {
            setHasUserOpenAIKey(state.hasOpenAIKey);
            setUserOpenAIKeyInput("");
            showToast(Locale.Settings.Access.UserOpenAIKey.Saved);
          })
          .finally(() => setLoadingUserOpenAIKey(false));
      }}
    />
    <IconButton
      text={Locale.Settings.Access.UserOpenAIKey.Delete}
      icon={<DeleteIcon />}
      disabled={loadingUserOpenAIKey || !hasUserOpenAIKey}
      onClick={() => {
        setLoadingUserOpenAIKey(true);
        deleteUserOpenAIKey()
          .then((state) => {
            setHasUserOpenAIKey(state.hasOpenAIKey);
            showToast(Locale.Settings.Access.UserOpenAIKey.Deleted);
          })
          .finally(() => setLoadingUserOpenAIKey(false));
      }}
    />
  </ListItem>
);
```

If `IconButton` does not support `disabled`, use an early return inside `onClick` instead of passing `disabled`.

- [ ] **Step 5: Render panel**

In the `List id={SlotID.CustomModel}` block, render:

```tsx
{userOpenAIKeyComponent}
```

near `accessCodeComponent`, before local/private endpoint settings.

- [ ] **Step 6: Run TypeScript**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/components/settings.tsx app/locales/cn.ts app/locales/en.ts app/locales/tw.ts
git commit -m "feat: add user api key settings"
```

---

### Task 7: Final Verification

**Files:**
- No planned code edits.

- [ ] **Step 1: Run focused tests**

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next' --runTestsByPath test/user-schema.test.ts test/user-auth.test.ts test/model-proxy-auth.test.ts test/user-api-key-crypto.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

```bash
node --no-warnings --experimental-vm-modules ./node_modules/.bin/jest --ci --modulePathIgnorePatterns='<rootDir>/.next'
```

Expected: all test suites pass.

- [ ] **Step 3: Run type check**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: no output and exit code 0.

- [ ] **Step 4: Manual local smoke test**

Ensure local dev server is running:

```bash
./node_modules/.bin/next dev -H 127.0.0.1 -p 3000
```

Open `http://127.0.0.1:3000`, log in, go to Settings, verify:

- Key state loads.
- Saving a key clears the input and shows configured state.
- Deleting a key shows missing state.
- With no key, OpenAI chat returns the explicit "请先在设置中填写 API Key" message.
- With a saved key, OpenAI chat reaches the upstream API.

- [ ] **Step 5: Commit any final fixes**

```bash
git status --short
git add <changed-files>
git commit -m "test: verify user openai api key binding"
```

Skip this commit if there are no final fixes.
