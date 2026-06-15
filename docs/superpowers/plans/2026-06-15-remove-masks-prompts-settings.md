# Remove Masks and Quick Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the user-facing mask and quick prompt workflows, keep old chat data compatible, and simplify settings into clear tabs.

**Architecture:** This is a phase-one product removal with compatibility retained in the chat state shape. UI routes and controls stop exposing masks/prompts, while `session.mask.modelConfig` remains available for provider clients and old sessions. Settings get a lightweight tab layer before any deeper component split.

**Tech Stack:** Next.js 14, React 18, TypeScript, Zustand persisted stores, Jest with `next/jest`, SCSS modules.

---

## Spec

Approved spec: `docs/superpowers/specs/2026-06-15-remove-masks-prompts-settings-design.md`

Reviewer status: Approved. Advisory clarifications applied in this plan:

- Direct `/#/new-chat` creates a new normal chat once, then navigates to `/#/chat`.
- Old mask share links use the known pattern `/#/new-chat?mask=<id>` and should ignore the `mask` query.

## File Structure

- Modify: `app/utils/store.ts`
  - Compose persisted-store rehydration callbacks instead of discarding store-specific callbacks.
- Modify: `app/store/chat.ts`
  - Add idempotent mask normalization.
  - Make `newSession()` ignore mask arguments in product behavior while preserving global model defaults.
  - Apply normalization during migration, rehydration, and remote session loading.
- Modify: `app/components/sidebar.tsx`
  - Remove mask header action and imports.
  - Make new-chat action create a normal chat directly.
- Modify: `app/components/home.tsx`
  - Remove dynamic mask page route.
  - Make `/new-chat` and `/masks` legacy routes redirect or create normal chat.
- Modify: `app/components/chat.tsx`
  - Remove quick prompt UI, prompt search, slash prompt behavior, context prompt display/edit actions, and mask store usage.
- Modify: `app/components/settings.tsx`
  - Remove prompt editor/modal code and mask/prompt settings.
  - Add settings tabs and move existing settings blocks into tab panes.
- Modify: `app/components/settings.module.scss`
  - Add tab styling that fits the current settings surface.
- Modify: `app/components/chat-list.tsx`, `app/components/exporter.tsx`, `app/components/message-selector.tsx`
  - Stop showing mask-specific avatars/context where user-visible.
  - Keep model metadata display where useful.
- Modify: `app/utils/sync.ts`
  - Stop surfacing mask/prompt counts in settings overview; keep compatibility with old store keys.
- Modify: `app/locales/cn.ts`, `app/locales/en.ts`
  - Remove visible mask/quick-prompt labels from used UI paths or stop referencing them.
- Modify: `docs/user-manual-cn.md`
  - Remove mask and quick prompt workflow sections; keep model/system prompt documentation.
- Test: `test/chat-mask-prompt-removal.test.ts`
  - Add source-level regression tests for removed routes/actions/settings.
- Test: `test/chat-session-normalization.test.ts`
  - Add focused tests for mask normalization source/behavior.

Do not delete `app/store/mask.ts`, `app/store/prompt.ts`, `app/masks/**`, `public/prompts.json`, or store keys in phase one unless a task explicitly proves they are no longer imported. They are deferred compatibility cleanup.

---

### Task 1: Add Regression Tests for Removed Product Surface

**Files:**
- Create: `test/chat-mask-prompt-removal.test.ts`
- Read: `app/components/sidebar.tsx`
- Read: `app/components/home.tsx`
- Read: `app/components/chat.tsx`
- Read: `app/components/settings.tsx`

- [ ] **Step 1: Write source-level tests for removed routes and controls**

Create `test/chat-mask-prompt-removal.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mask and quick prompt removal", () => {
  test("sidebar no longer exposes mask entry or mask splash branching", () => {
    const source = read("app/components/sidebar.tsx");

    expect(source).not.toContain("MaskIcon");
    expect(source).not.toContain("Locale.Mask.Name");
    expect(source).not.toContain("dontShowMaskSplashScreen");
    expect(source).toContain("chatStore.newSession()");
    expect(source).toContain("navigate(Path.Chat)");
  });

  test("home no longer renders the mask management page", () => {
    const source = read("app/components/home.tsx");

    expect(source).not.toContain("MaskPage");
    expect(source).not.toContain('path={Path.Masks} element={<MaskPage />}');
  });

  test("chat input no longer loads prompt store or prompt hints", () => {
    const source = read("app/components/chat.tsx");

    expect(source).not.toContain("usePromptStore");
    expect(source).not.toContain("PromptHints");
    expect(source).not.toContain("PromptToast");
    expect(source).not.toContain("showPromptHints");
    expect(source).not.toContain("ChatCommandPrefix.Prompt");
    expect(source).not.toContain("newm: () => navigate(Path.NewChat)");
    expect(source).not.toContain("setUserInput(\"/\")");
    expect(source).not.toContain("ContextPrompts");
  });

  test("settings no longer renders mask or quick prompt settings", () => {
    const source = read("app/components/settings.tsx");

    expect(source).not.toContain("UserPromptModal");
    expect(source).not.toContain("EditPromptModal");
    expect(source).not.toContain("usePromptStore");
    expect(source).not.toContain("useMaskStore");
    expect(source).not.toContain("dontShowMaskSplashScreen");
    expect(source).not.toContain("hideBuiltinMasks");
    expect(source).not.toContain("disablePromptHint");
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts
```

Expected: FAIL because current source still imports and renders mask/prompt features.

- [ ] **Step 3: Commit failing tests**

```bash
git add test/chat-mask-prompt-removal.test.ts
git commit -m "test: cover mask and prompt removal"
```

---

### Task 2: Normalize Old Mask Data While Keeping Model Config

**Files:**
- Modify: `app/store/chat.ts`
- Modify: `app/utils/store.ts`
- Create: `test/chat-session-normalization.test.ts`

- [ ] **Step 1: Write tests for normalization contract**

Create `test/chat-session-normalization.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

describe("chat session mask normalization", () => {
  const source = () =>
    readFileSync(join(process.cwd(), "app/store/chat.ts"), "utf8");

  test("defines a normalization helper that clears mask semantics", () => {
    const chat = source();

    expect(chat).toContain("normalizeSessionMask");
    expect(chat).toContain("context: []");
    expect(chat).toContain("hideContext: false");
    expect(chat).toContain("name: DEFAULT_TOPIC");
    expect(chat).toContain("avatar: DEFAULT_MASK_AVATAR");
  });

  test("normalization preserves existing model config", () => {
    const chat = source();

    expect(chat).toContain("const modelConfig = session.mask?.modelConfig");
    expect(chat).toContain("modelConfig: {");
    expect(chat).toContain("...modelConfig");
  });

  test("migrate and remote loading normalize sessions", () => {
    const chat = source();

    expect(chat).toContain("version: 3.6");
    expect(chat).toContain("normalizeSessions");
    expect(chat).toContain("if (version < 3.6)");
    expect(chat).toContain("newState.sessions = normalizeSessions");
    expect(chat).toContain("loadRemoteSessions");
  });

  test("persist wrapper preserves store-specific rehydrate callbacks", () => {
    const store = readFileSync(
      join(process.cwd(), "app/utils/store.ts"),
      "utf8",
    );

    expect(store).toContain("oldOnRehydrateStorage");
    expect(store).toContain("oldAfterRehydrate");
    expect(store).toContain("oldAfterRehydrate?.");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
yarn test:ci test/chat-session-normalization.test.ts
```

Expected: FAIL because no normalization helper exists.

- [ ] **Step 3: Add normalization helper**

Modify `app/store/chat.ts` imports:

```ts
import { createEmptyMask, DEFAULT_MASK_AVATAR, Mask } from "./mask";
```

Add helper near `createEmptySession()`:

```ts
function normalizeSessionMask(session: ChatSession): ChatSession {
  const fallbackMask = createEmptyMask();
  const modelConfig = session.mask?.modelConfig;

  session.mask = {
    ...fallbackMask,
    ...session.mask,
    name: DEFAULT_TOPIC,
    avatar: DEFAULT_MASK_AVATAR,
    context: [],
    hideContext: false,
    syncGlobalConfig: true,
    modelConfig: {
      ...fallbackMask.modelConfig,
      ...modelConfig,
    },
  };

  return session;
}

function normalizeSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => normalizeSessionMask(session));
}
```

- [ ] **Step 4: Preserve store-specific rehydration callbacks**

Before adding chat-store rehydration normalization, update `app/utils/store.ts`. The current wrapper calls the store-provided `onRehydrateStorage(state)` but discards its returned callback, so per-store after-hydration cleanup would never run.

Replace the wrapper logic with callback composition:

```ts
const oldOnRehydrateStorage = persistOptions?.onRehydrateStorage;
persistOptions.onRehydrateStorage = (state) => {
  const oldAfterRehydrate = oldOnRehydrateStorage?.(state);
  return (hydratedState, error) => {
    oldAfterRehydrate?.(hydratedState, error);
    (hydratedState ?? state).setHasHydrated(true);
  };
};
```

Use the exact parameter names needed by TypeScript if inference requires adjustment, but preserve the behavior: call the store-specific returned callback first, then mark hydration complete.

- [ ] **Step 5: Apply normalization to new, migrated, rehydrated, and remote sessions**

In `createEmptySession()`, return `normalizeSessionMask({...})` around the existing session object.

In the chat store persist options, bump the version:

```ts
version: 3.6,
```

In `migrate()`, add a new phase before returning:

```ts
if (version < 3.6) {
  newState.sessions = normalizeSessions(newState.sessions);
}
```

This is required because existing users can already be on `version: 3.5`; without a version bump, local persisted sessions would not run the cleanup.

Also add rehydration-time normalization for defensive coverage when persisted state is already at the newest version or is manually imported. Use the existing `createPersistStore` `onRehydrateStorage` hook:

```ts
onRehydrateStorage() {
  return (state) => {
    if (!state?.sessions) return;
    state.sessions = normalizeSessions(state.sessions);
  };
},
```

If the chat store already has an `onRehydrateStorage` callback when implementing, compose with it rather than replacing it.

In `loadRemoteSessions()` implementation in `app/store/chat.ts`, normalize remote sessions before `set`. If the function currently sets remote sessions inline, use:

```ts
const sessions = normalizeSessions(
  remoteSessions.length > 0 ? remoteSessions : [createEmptySession()],
);
```

Preserve the existing current session index rules.

- [ ] **Step 6: Make `newSession(mask?: Mask)` ignore mask semantics**

Keep the optional parameter for compatibility, but do not apply `mask.name`, `mask.avatar`, or `mask.context`.

```ts
newSession(_mask?: Mask) {
  const session = createEmptySession();

  set((state) => ({
    currentSessionIndex: 0,
    sessions: [session].concat(state.sessions),
  }));
  void get().saveRemoteSessions();
},
```

- [ ] **Step 7: Run normalization tests**

Run:

```bash
yarn test:ci test/chat-session-normalization.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run existing chat action tests**

Run:

```bash
yarn test:ci test/chat-actions.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/store/chat.ts app/utils/store.ts test/chat-session-normalization.test.ts
git commit -m "feat: normalize legacy mask chat data"
```

---

### Task 3: Remove Mask Routes and Sidebar Entry Points

**Files:**
- Modify: `app/components/sidebar.tsx`
- Modify: `app/components/home.tsx`
- Optional Modify: `app/components/new-chat.tsx`

- [ ] **Step 1: Update sidebar imports**

Remove from `app/components/sidebar.tsx`:

```ts
import MaskIcon from "../icons/mask.svg";
```

- [ ] **Step 2: Remove mask header action**

Delete the `IconButton` that uses `MaskIcon` and navigates to `Path.NewChat` or `Path.Masks`.

- [ ] **Step 3: Simplify new chat action**

Replace the existing new-chat click handler:

```ts
onClick={() => {
  chatStore.newSession();
  navigate(Path.Chat);
}}
```

- [ ] **Step 4: Remove mask page dynamic import and route**

In `app/components/home.tsx`, remove:

```ts
const MaskPage = dynamic(async () => (await import("./mask")).MaskPage, {
  loading: () => <Loading noLogo />,
});
```

Remove the route:

```tsx
<Route path={Path.Masks} element={<MaskPage />} />
```

- [ ] **Step 5: Add legacy route handler component**

Update the React import in `app/components/home.tsx` to include `useRef` if needed:

```ts
import { useEffect, useRef, useState } from "react";
```

In `app/components/home.tsx`, add small legacy components near `Screen()`. Use stable selectors and an idempotence guard so `/#/new-chat` creates exactly one normal chat even if store updates cause rerenders:

```tsx
function LegacyNewChatRedirect() {
  const navigate = useNavigate();
  const newSession = useChatStore((state) => state.newSession);
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    newSession();
    navigate(Path.Chat, { replace: true });
  }, [newSession, navigate]);

  return <Loading noLogo />;
}

function LegacyMasksRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(Path.Chat, { replace: true });
  }, [navigate]);

  return <Loading noLogo />;
}
```

Then route:

```tsx
<Route path={Path.NewChat} element={<LegacyNewChatRedirect />} />
<Route path={Path.Masks} element={<LegacyMasksRedirect />} />
```

This handles `/#/new-chat?mask=<id>` by creating a normal chat and ignoring `mask`.

- [ ] **Step 6: Run removal tests**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts
```

Expected: still FAIL because chat/settings prompt code remains, but sidebar/home assertions should now pass.

- [ ] **Step 7: Commit**

```bash
git add app/components/sidebar.tsx app/components/home.tsx
git commit -m "feat: remove mask navigation"
```

---

### Task 4: Remove Quick Prompt and Context Prompt UI from Chat

**Files:**
- Modify: `app/components/chat.tsx`
- Modify: `app/components/chat-list.tsx`
- Modify: `app/components/message-selector.tsx`
- Modify: `app/components/exporter.tsx`

- [ ] **Step 1: Remove chat prompt imports**

From `app/components/chat.tsx`, remove imports for:

```ts
PromptIcon
Prompt
usePromptStore
ContextPrompts
MaskAvatar
useMaskStore
ChatCommandPrefix
showPrompt
```

Keep `MaskConfig` only if session settings still use it for model config. If `MaskConfig` is only a mask editor dependency, replace it with `ModelConfigList` or keep it deferred until Task 5.

- [ ] **Step 2: Delete prompt hint components**

Remove these declarations from `app/components/chat.tsx`:

```ts
function PromptToast(...)
export type RenderPrompt = ...
export function PromptHints(...)
```

- [ ] **Step 3: Remove prompt state and search**

Delete state and callbacks related to:

```ts
const promptStore = usePromptStore();
const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
onSearch
onPromptSelect
```

In input handling, remove `ChatCommandPrefix.Prompt` logic so `/` remains ordinary text. Keep non-prompt command handling only where still used. Remove the mask-related `/newm` command and any command that navigates to `Path.NewChat` for mask creation.

- [ ] **Step 4: Remove quick prompt input action**

In `ChatActions`, remove prop:

```ts
showPromptHints: () => void;
setUserInput: (input: string) => void;
```

Remove the `ChatAction` that uses:

```tsx
text={Locale.Chat.InputActions.Prompt}
icon={<PromptIcon />}
```

Update the `<ChatActions />` call accordingly.

- [ ] **Step 5: Remove context prompt display and editing**

Delete `PromptToast` rendering near the chat body.

Remove context prompt derived values and rendering:

```ts
const context = session.mask.hideContext ? [] : session.mask.context.slice();
```

Remove message actions that push a message into `session.mask.context` or open contextual prompt editing.

- [ ] **Step 6: Keep session/model settings working**

If `SessionConfigModel` currently depends on mask contextual prompt editing, remove only contextual prompt controls. Keep model config controls, memory, avatar/name display if required for layout, but do not expose mask/context semantics.

- [ ] **Step 7: Remove mask-specific visible metadata elsewhere**

In `app/components/chat-list.tsx`, replace mask avatar/name usage with default bot avatar or session topic where user-visible.

In `app/components/message-selector.tsx`, keep model display but avoid mask avatar if it is presented as a preset role.

In `app/components/exporter.tsx`, remove:

```ts
ret.push(...session.mask.context);
```

Keep normal message export.

- [ ] **Step 8: Run tests**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts test/chat-actions.test.ts
```

Expected: `chat-mask-prompt-removal` may still fail only on settings assertions; `chat-actions` should pass after adjusting any string assertions affected by cleanup.

- [ ] **Step 9: Commit**

```bash
git add app/components/chat.tsx app/components/chat-list.tsx app/components/message-selector.tsx app/components/exporter.tsx test/chat-actions.test.ts
git commit -m "feat: remove quick prompt chat UI"
```

---

### Task 5: Remove Mask and Prompt Settings, Add Settings Tabs

**Files:**
- Modify: `app/components/settings.tsx`
- Modify: `app/components/settings.module.scss`
- Modify: `app/utils/sync.ts`
- Modify: `app/locales/cn.ts`
- Modify: `app/locales/en.ts`

- [ ] **Step 1: Remove prompt and mask imports from settings**

From `app/components/settings.tsx`, remove:

```ts
Prompt
SearchService
usePromptStore
useMaskStore
```

- [ ] **Step 2: Delete prompt editor components**

Remove:

```ts
function EditPromptModal(...)
function UserPromptModal(...)
```

Remove state and counters:

```ts
const promptStore = usePromptStore();
const builtinCount = SearchService.count.builtin;
const customCount = promptStore.getUserPrompts().length ?? 0;
const [shouldShowPromptModal, setShowPromptModal] = useState(false);
```

- [ ] **Step 3: Remove mask/prompt settings list items**

Delete list items referencing:

```ts
Locale.Settings.Mask.Splash
Locale.Settings.Mask.Builtin
Locale.Settings.Prompt.Disable
Locale.Settings.Prompt.List
```

Delete the prompt modal render:

```tsx
{shouldShowPromptModal && (
  <UserPromptModal onClose={() => setShowPromptModal(false)} />
)}
```

- [ ] **Step 4: Add settings tab locale keys**

In `app/locales/cn.ts`, add under `Settings` near the existing settings labels:

```ts
Tabs: {
  Common: "常用",
  Account: "账号与 Key",
  Model: "模型",
  Sync: "同步",
  Advanced: "高级",
},
```

In `app/locales/en.ts`, add under `Settings` near the existing settings labels:

```ts
Tabs: {
  Common: "Common",
  Account: "Account & Keys",
  Model: "Model",
  Sync: "Sync",
  Advanced: "Advanced",
},
```

- [ ] **Step 5: Add settings tab state**

Inside `Settings()`:

```ts
type SettingsTab = "common" | "account" | "model" | "sync" | "advanced";
const [activeTab, setActiveTab] = useState<SettingsTab>("common");
const tabs: Array<{ id: SettingsTab; title: string }> = [
  { id: "common", title: Locale.Settings.Tabs.Common },
  { id: "account", title: Locale.Settings.Tabs.Account },
  { id: "model", title: Locale.Settings.Tabs.Model },
  { id: "sync", title: Locale.Settings.Tabs.Sync },
  { id: "advanced", title: Locale.Settings.Tabs.Advanced },
];
```

Render before tab content:

```tsx
<div className={styles["settings-tabs"]}>
  {tabs.map((tab) => (
    <button
      key={tab.id}
      className={clsx(styles["settings-tab"], {
        [styles["settings-tab-active"]]: activeTab === tab.id,
      })}
      onClick={() => setActiveTab(tab.id)}
      type="button"
    >
      {tab.title}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Move existing blocks into tab panes**

Wrap existing blocks with conditionals:

```tsx
{activeTab === "common" && (
  <>
    {/* avatar, update version if you keep it common temporarily, send key,
        theme, language, font size, font family, auto title,
        preview bubble, artifacts, code fold */}
  </>
)}
```

Use this target:

- `common`: avatar, send key, theme, language, font size, font family, auto title, preview bubble, artifacts, code fold.
- `account`: `privateOpenAIConfigComponent`, `saasStartComponent`, `accessCodeComponent`, `userOpenAIKeyComponent`, custom endpoint/provider/provider configs, usage.
- `model`: custom model list and `ModelConfigList`.
- `sync`: `SyncItems`.
- `advanced`: `RealtimeConfigList`, update version/check, danger reset, danger clear.

Preserve all existing handler logic while moving blocks.

- [ ] **Step 7: Add tab styles**

In `app/components/settings.module.scss`, add:

```scss
.settings-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 20px 0;
  overflow-x: auto;
}

.settings-tab {
  border: var(--border-in-light);
  background: var(--white);
  color: var(--black);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
}

.settings-tab-active {
  border-color: var(--primary);
  color: var(--primary);
}
```

- [ ] **Step 8: Adjust `SyncItems` local state overview**

In `app/components/settings.tsx`, update `SyncItems()` so it no longer depends on prompt or mask stores.

Remove:

```ts
const promptStore = usePromptStore();
const maskStore = useMaskStore();
```

Change `stateOverview` to only include chat and message counts:

```ts
const stateOverview = useMemo(() => {
  const sessions = chatStore.sessions;
  const messageCount = sessions.reduce((p, c) => p + c.messages.length, 0);

  return {
    chat: sessions.length,
    message: messageCount,
  };
}, [chatStore.sessions]);
```

Update `Locale.Settings.Sync.Overview` in `app/locales/cn.ts` and `app/locales/en.ts` in this same task so it does not read `overview.prompt` or `overview.mask`.

In `app/utils/sync.ts`, keep old `StoreKey.Mask` and `StoreKey.Prompt` compatibility if needed for old backup files, but do not expose their counts in settings.

- [ ] **Step 9: Run settings tests**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts
```

Expected: PASS for settings assertions.

- [ ] **Step 10: Commit**

```bash
git add app/components/settings.tsx app/components/settings.module.scss app/utils/sync.ts app/locales/cn.ts app/locales/en.ts
git commit -m "feat: simplify settings without masks or prompts"
```

---

### Task 6: Update Visible Copy and Documentation

**Files:**
- Modify: `app/locales/cn.ts`
- Modify: `app/locales/en.ts`
- Modify: `docs/user-manual-cn.md`

- [ ] **Step 1: Remove or stop referencing visible mask labels**

In `app/locales/cn.ts` and `app/locales/en.ts`, keep unused keys if TypeScript still requires them, but update visible copy used by current UI:

- Remove chat input action labels for prompt/masks if they are no longer referenced.
- Update sync overview to omit prompt and mask counts.
- Keep `Settings.InjectSystemPrompts` copy.
- Keep SD `Prompt` and `NegativePrompt` copy.

Example Chinese sync overview:

```ts
Overview: (overview: any) => {
  return `${overview.chat} 次对话，${overview.message} 条消息`;
},
```

Example English sync overview:

```ts
Overview: (overview: any) => {
  return `${overview.chat} chats, ${overview.message} messages`;
},
```

- [ ] **Step 2: Rewrite user manual**

In `docs/user-manual-cn.md`, remove the `面具 (Mask)` section and quick command bullets. Keep the chat settings/global settings relationship and history summary sections.

Add a short first section:

```md
## 对话 (Chat)

HongAI 默认直接创建普通对话。新建聊天不会要求选择面具或预设角色。
```

- [ ] **Step 3: Search for active visible references**

Run:

```bash
rg -n "面具|快捷指令|PromptHints|PromptToast|所有面具|Pick a Mask|Masks" app docs/user-manual-cn.md
```

Expected: remaining matches are either unused locale compatibility, SD prompt labels, model/system prompt documentation, or deferred mask store files. No active component should render mask/quick-prompt UI.

- [ ] **Step 4: Run tests**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts test/chat-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/locales/cn.ts app/locales/en.ts docs/user-manual-cn.md
git commit -m "docs: remove mask and quick prompt guidance"
```

---

### Task 7: Browser Verification and Final Regression

**Files:**
- No planned edits unless verification finds defects.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
yarn test:ci test/chat-mask-prompt-removal.test.ts test/chat-session-normalization.test.ts test/chat-actions.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run broader relevant tests**

Run:

```bash
yarn test:ci test/model-provider.test.ts test/model-available.test.ts test/image-generation-model.test.ts test/openai-reasoning-mode.test.ts test/vision-model-checker.test.ts
```

Expected: PASS.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next dev server starts and prints a localhost URL.

- [ ] **Step 4: Verify UI in browser**

Open the app URL and verify:

- Sidebar has no mask entry.
- New chat opens a plain chat directly.
- `/#/new-chat` creates a plain chat and redirects to `/#/chat`.
- `/#/new-chat?mask=anything` ignores the mask query.
- `/#/masks` redirects to chat.
- Chat input has no quick prompt button.
- Typing `/` does not open suggestions.
- Settings shows tabs: 常用, 账号与 Key, 模型, 同步, 高级.
- Settings has no mask or quick prompt controls.
- Model selection, image generation toggle, web search, MCP, and realtime controls still render where applicable.

- [ ] **Step 5: Stop dev server**

If the dev server was started in this session, stop it cleanly with Ctrl-C or the tracked process id.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: only intended implementation files are changed.

- [ ] **Step 7: Final commit if verification fixes were needed**

If Task 7 required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize mask removal flow"
```

Otherwise no commit is needed.
