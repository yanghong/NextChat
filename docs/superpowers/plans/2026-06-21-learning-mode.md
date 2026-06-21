# Diagnostic Learning Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight AI diagnostic learning mode to existing chat sessions, launched by `/学习`/`/learn` or a Learning action, where AI asks guiding questions before generating a learning profile and route.

**Architecture:** Implement learning mode as session metadata on `ChatSession`, plus a focused `app/utils/learning.ts` helper for command parsing, prompt construction, and launch-message text. Reuse the existing chat send pipeline, message rendering, persistence, remote sync, and model selection; do not add a standalone learning page in v1.

**Tech Stack:** Next.js 14, React 18, TypeScript, Zustand persisted store, Jest, existing SCSS modules and locale objects.

---

## File Structure

- Create `app/utils/learning.ts`
  - Owns learning command parsing, learning launch-message conversion, default state creation, and learning system prompt construction.
- Modify `app/store/chat.ts`
  - Adds `LearningModeState`, `session.learning`, normalization/migration, store methods, and learning prompt injection in `getMessagesWithMemory()`.
- Modify `app/components/chat.tsx`
  - Parses `/学习` and `/learn` before normal send, adds Learning input action, displays learning-mode status, and supports exit.
- Modify `app/components/chat.module.scss`
  - Styles a compact learning status bar without changing chat layout.
- Modify `app/locales/cn.ts` and `app/locales/en.ts`
  - Adds minimal learning-mode labels, messages, and command help text.
- Create `test/learning-mode.test.ts`
  - Unit/source tests for command parsing, prompt construction, store integration, and UI wiring.
- Modify `test/chat-session-normalization.test.ts`
  - Updates store version and normalization expectations.
- Create `docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md`
  - Test engineer's complete manual test cases and product coverage checklist.

## Implementation Notes

- Use @superpowers:test-driven-development for every implementation task: write the test, run it and confirm it fails, implement the minimum code, rerun.
- Keep command boundary strict: `/学习 React` and `/learn Python` are commands; `/学习React` and `/learnPython` are normal user text.
- Do not parse AI replies in v1. `learning.summary` may stay empty. If context is cleared and summary is empty, the learning prompt should tell AI to do a short re-diagnosis.
- `phase` is UI/extension metadata only in v1, not a hard AI state machine.
- Do not remove or refactor existing chat features unrelated to this work.

---

### Task 1: Learning Utility Module

**Files:**
- Create: `app/utils/learning.ts`
- Test: `test/learning-mode.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add these tests to `test/learning-mode.test.ts`:

```ts
import {
  buildLearningLaunchMessage,
  buildLearningSystemPrompt,
  createDefaultLearningMode,
  parseLearningCommand,
} from "../app/utils/learning";

describe("learning mode utilities", () => {
  test("parses Chinese learning start commands with strict boundaries", () => {
    expect(parseLearningCommand("/学习")).toEqual({
      type: "start",
      intent: "",
    });
    expect(parseLearningCommand("/学习 React Hooks")).toEqual({
      type: "start",
      intent: "React Hooks",
    });
    expect(parseLearningCommand("/学习React")).toEqual({
      type: "none",
      raw: "/学习React",
    });
  });

  test("parses English learning start commands with strict boundaries", () => {
    expect(parseLearningCommand("/learn Python")).toEqual({
      type: "start",
      intent: "Python",
    });
    expect(parseLearningCommand("/study SQL")).toEqual({
      type: "start",
      intent: "SQL",
    });
    expect(parseLearningCommand("/learnPython")).toEqual({
      type: "none",
      raw: "/learnPython",
    });
  });

  test("parses learning stop commands", () => {
    expect(parseLearningCommand("/退出学习")).toEqual({ type: "stop" });
    expect(parseLearningCommand("/exit-learn")).toEqual({ type: "stop" });
  });
});
```

- [ ] **Step 2: Run parser tests and verify RED**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: FAIL because `app/utils/learning.ts` does not exist.

- [ ] **Step 3: Implement minimal parser and learning helpers**

Create `app/utils/learning.ts`:

```ts
export type LearningPhase = "diagnosing" | "planning" | "learning" | "reviewing";

export type LearningModeState = {
  enabled: boolean;
  phase: LearningPhase;
  initialIntent?: string;
  summary?: string;
  updatedAt: number;
};

export type LearningCommand =
  | { type: "start"; intent: string }
  | { type: "stop" }
  | { type: "none"; raw: string };

const START_COMMANDS = ["/学习", "/learn", "/study"];
const STOP_COMMANDS = ["/退出学习", "/exit-learn"];

function matchCommand(input: string, commands: string[]) {
  const trimmed = input.trim();
  for (const command of commands) {
    if (trimmed === command) return { matched: true, rest: "" };
    if (trimmed.startsWith(command + " ")) {
      return { matched: true, rest: trimmed.slice(command.length).trim() };
    }
  }
  return { matched: false, rest: "" };
}

export function parseLearningCommand(input: string): LearningCommand {
  const stop = matchCommand(input, STOP_COMMANDS);
  if (stop.matched) return { type: "stop" };

  const start = matchCommand(input, START_COMMANDS);
  if (start.matched) return { type: "start", intent: start.rest };

  return { type: "none", raw: input };
}

export function createDefaultLearningMode(
  initialIntent = "",
): LearningModeState {
  return {
    enabled: true,
    phase: "diagnosing",
    initialIntent,
    updatedAt: Date.now(),
  };
}

export function buildLearningLaunchMessage(intent: string): string {
  if (intent.trim()) {
    return `我想进入学习模式，学习目标初步是：${intent.trim()}。请先通过诊断式问题了解我的目标、当前水平和可用学习节奏，再制定学习路线。`;
  }

  return "我想进入学习模式。请先问我想学什么，再通过诊断式问题了解我的目标、当前水平和可用学习节奏。";
}

export function buildLearningSystemPrompt(state?: LearningModeState): string {
  const summary = state?.summary?.trim();
  const intent = state?.initialIntent?.trim();

  return [
    "你是学习导师，不是只给答案的问答助手。",
    "先通过自然对话诊断用户的学习目标、当前水平、约束条件和可用学习节奏，再制定学习路径。",
    "不要要求用户填写固定表单；每轮最多问 1-3 个问题。",
    "信息足够时，用 Markdown 输出“学习档案”，包含目标、当前水平、建议节奏、阶段路线和下一步任务。",
    "后续回复要围绕讲解、练习、检查理解、纠错、复盘和推进下一步。",
    "用户答错时先指出关键误区，再给更小的提示。",
    "不确定用户水平时继续提问，不要伪造。",
    intent ? `用户的初始学习意图：${intent}` : "",
    summary
      ? `已有学习摘要：${summary}`
      : "如果当前上下文不足以判断用户水平，请重新做简短问诊。",
  ]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Run parser tests and verify GREEN**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Add helper behavior tests**

Extend `test/learning-mode.test.ts`:

```ts
test("builds diagnostic launch messages without exposing raw slash commands", () => {
  expect(buildLearningLaunchMessage("React")).toContain("学习目标初步是：React");
  expect(buildLearningLaunchMessage("React")).not.toContain("/学习");
  expect(buildLearningLaunchMessage("")).toContain("请先问我想学什么");
});

test("builds a tutor system prompt that asks diagnostic questions", () => {
  const prompt = buildLearningSystemPrompt(
    createDefaultLearningMode("React Hooks"),
  );

  expect(prompt).toContain("学习导师");
  expect(prompt).toContain("每轮最多问 1-3 个问题");
  expect(prompt).toContain("学习档案");
  expect(prompt).toContain("React Hooks");
});
```

- [ ] **Step 6: Run helper tests**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add app/utils/learning.ts test/learning-mode.test.ts
git commit -m "feat: add learning mode utilities"
```

---

### Task 2: Chat Store Learning State and Prompt Injection

**Files:**
- Modify: `app/store/chat.ts:1-140`
- Modify: `app/store/chat.ts:276-360`
- Modify: `app/store/chat.ts:606-705`
- Modify: `app/store/chat.ts:962-1056`
- Modify: `test/learning-mode.test.ts`
- Modify: `test/chat-session-normalization.test.ts`

- [ ] **Step 1: Write failing store source tests**

Add to `test/learning-mode.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("learning mode chat store integration", () => {
  test("chat sessions carry learning mode metadata", () => {
    const source = read("app/store/chat.ts");

    expect(source).toContain("LearningModeState");
    expect(source).toContain("learning?: LearningModeState");
    expect(source).toContain("normalizeSessionLearning");
  });

  test("chat store exposes learning mode state transitions", () => {
    const source = read("app/store/chat.ts");

    expect(source).toContain("startLearningMode(initialIntent");
    expect(source).toContain("stopLearningMode()");
    expect(source).toContain("updateLearningMode");
    expect(source).toContain("createDefaultLearningMode");
  });

  test("learning mode prompt is appended to system prompts", () => {
    const source = read("app/store/chat.ts");

    expect(source).toContain("buildLearningSystemPrompt");
    expect(source).toContain("session.learning?.enabled");
    expect(source).toContain("[Learning Mode System Prompt]");
  });
});
```

- [ ] **Step 2: Update migration expectation test first**

In `test/chat-session-normalization.test.ts`, update version checks from `3.6` to `3.7` and add learning normalization assertions:

```ts
expect(chat).toContain("version: 3.7");
expect(chat).toContain("if (version < 3.7)");
expect(chat).toContain("normalizeSessionLearning");
```

- [ ] **Step 3: Run store tests and verify RED**

Run:

```bash
yarn test:ci test/learning-mode.test.ts test/chat-session-normalization.test.ts --runInBand
```

Expected: FAIL because store does not have learning state or version `3.7`.

- [ ] **Step 4: Add imports and types in chat store**

Modify `app/store/chat.ts` imports:

```ts
import {
  buildLearningSystemPrompt,
  createDefaultLearningMode,
  LearningModeState,
} from "../utils/learning";
```

Extend `ChatSession`:

```ts
  learning?: LearningModeState;
```

- [ ] **Step 5: Add learning normalization**

Add near `normalizeSessionMask()`:

```ts
function normalizeSessionLearning(session: ChatSession): ChatSession {
  if (!session.learning) return session;

  session.learning = {
    enabled: Boolean(session.learning.enabled),
    phase: session.learning.phase ?? "diagnosing",
    initialIntent: session.learning.initialIntent ?? "",
    summary: session.learning.summary ?? "",
    updatedAt: session.learning.updatedAt ?? Date.now(),
  };

  return session;
}
```

Update `normalizeSessions()`:

```ts
function normalizeSession(session: ChatSession): ChatSession {
  return normalizeSessionLearning(normalizeSessionMask(session));
}

function normalizeSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => normalizeSession(session));
}
```

Update `createEmptySession()` return to call `normalizeSession(...)`.

- [ ] **Step 6: Add store methods**

Inside `methods` in `app/store/chat.ts`, after `newSession()`:

```ts
startLearningMode(initialIntent: string = "") {
  const session = get().currentSession();
  get().updateTargetSession(session, (session) => {
    session.learning = createDefaultLearningMode(initialIntent);
  });
  void get().saveRemoteSessions();
},

stopLearningMode() {
  const session = get().currentSession();
  get().updateTargetSession(session, (session) => {
    if (!session.learning) {
      session.learning = {
        enabled: false,
        phase: "diagnosing",
        updatedAt: Date.now(),
      };
      return;
    }
    session.learning.enabled = false;
    session.learning.updatedAt = Date.now();
  });
  void get().saveRemoteSessions();
},

updateLearningMode(updater: (learning: LearningModeState) => void) {
  const session = get().currentSession();
  get().updateTargetSession(session, (session) => {
    const learning = session.learning ?? createDefaultLearningMode();
    updater(learning);
    learning.updatedAt = Date.now();
    session.learning = learning;
  });
  void get().saveRemoteSessions();
},
```

- [ ] **Step 7: Inject learning system prompt without replacing existing prompts**

In `getMessagesWithMemory()`, after MCP/global system prompt construction and before memory prompts:

```ts
const learningSystemPrompt = session.learning?.enabled
  ? buildLearningSystemPrompt(session.learning)
  : "";

if (learningSystemPrompt) {
  if (systemPrompts.length > 0) {
    systemPrompts[0].content = [
      getMessageTextContent(systemPrompts[0]),
      learningSystemPrompt,
    ].join("\n\n");
  } else {
    systemPrompts = [
      createMessage({
        role: "system",
        content: learningSystemPrompt,
      }),
    ];
  }
  console.log("[Learning Mode System Prompt]", learningSystemPrompt);
}
```

- [ ] **Step 8: Bump chat store version and migration**

In persist config:

```ts
version: 3.7,
```

Add after existing `3.6` migration:

```ts
if (version < 3.7) {
  newState.sessions = normalizeSessions(newState.sessions);
}
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
yarn test:ci test/learning-mode.test.ts test/chat-session-normalization.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Run related regression tests**

Run:

```bash
yarn test:ci test/chat-actions.test.ts test/chat-mask-prompt-removal.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 11: Commit Task 2**

```bash
git add app/store/chat.ts test/learning-mode.test.ts test/chat-session-normalization.test.ts
git commit -m "feat: persist learning mode on chat sessions"
```

---

### Task 3: Chat Submit Flow and Learning UI

**Files:**
- Modify: `app/components/chat.tsx:1-90`
- Modify: `app/components/chat.tsx:527-741`
- Modify: `app/components/chat.tsx:1152-1201`
- Modify: `app/components/chat.tsx:2075-2143`
- Modify: `app/components/chat.module.scss:556-650`
- Modify: `app/locales/cn.ts:45-95`
- Modify: `app/locales/en.ts:45-100`
- Modify: `test/learning-mode.test.ts`

- [ ] **Step 1: Write failing UI/source tests**

Add to `test/learning-mode.test.ts`:

```ts
describe("learning mode chat UI wiring", () => {
  test("chat input exposes a learning action", () => {
    const source = read("app/components/chat.tsx");

    expect(source).toContain("startLearningModeFromInput");
    expect(source).toContain("Locale.Chat.InputActions.Learning");
    expect(source).toContain("onStartLearningMode");
  });

  test("chat submit intercepts learning commands before normal sending", () => {
    const source = read("app/components/chat.tsx");

    expect(source).toContain("parseLearningCommand(userInput)");
    expect(source).toContain("buildLearningLaunchMessage");
    expect(source).toContain("chatStore.startLearningMode");
    expect(source).toContain("chatStore.stopLearningMode");
  });

  test("chat shows learning mode status and exit control", () => {
    const source = read("app/components/chat.tsx");

    expect(source).toContain('styles["learning-mode-bar"]');
    expect(source).toContain("Locale.Chat.Learning.Status");
    expect(source).toContain("Locale.Chat.Learning.Exit");
  });
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: FAIL because UI wiring does not exist.

- [ ] **Step 3: Add imports and props**

In `app/components/chat.tsx`, import:

```ts
import {
  buildLearningLaunchMessage,
  parseLearningCommand,
} from "../utils/learning";
```

Extend `ChatActions` props:

```ts
  onStartLearningMode: () => void;
```

- [ ] **Step 4: Add Learning action button**

Inside `ChatActions`, near settings/model actions:

```tsx
<ChatAction
  onClick={props.onStartLearningMode}
  text={Locale.Chat.InputActions.Learning}
  icon={<BrainIcon />}
/>
```

- [ ] **Step 5: Add learning command handling in `doSubmit`**

Before existing `chatCommands.match(userInput)` in `doSubmit()`:

```ts
const learningCommand = parseLearningCommand(userInput);
if (learningCommand.type === "stop") {
  chatStore.stopLearningMode();
  setUserInput("");
  showToast(Locale.Chat.Learning.Stopped);
  return;
}

if (learningCommand.type === "start") {
  const intent = learningCommand.intent;
  const launchMessage = buildLearningLaunchMessage(intent);
  chatStore.startLearningMode(intent);
  setIsLoading(true);
  chatStore
    .onUserInput(launchMessage, [], false, {
      onError(error) {
        if (!isUserApiKeyRequiredError(error)) return false;
        setShowUserApiKeyModal(true);
        setUserInput(userInput);
        setAttachImages([]);
        showToast(USER_API_KEY_REQUIRED_MESSAGE);
        return true;
      },
    })
    .then(() => setIsLoading(false));
  chatStore.setLastInput(userInput);
  setAttachImages([]);
  setUserInput("");
  if (!isMobileScreen) inputRef.current?.focus();
  setAutoScroll(true);
  return;
}
```

- [ ] **Step 6: Add click handler for Learning action**

Inside `_Chat()`:

```ts
const startLearningModeFromInput = () => {
  if (session.learning?.enabled) {
    inputRef.current?.focus();
    return;
  }
  setUserInput("/学习 ");
  requestAnimationFrame(() => inputRef.current?.focus());
};
```

Pass it into `ChatActions`:

```tsx
onStartLearningMode={startLearningModeFromInput}
```

- [ ] **Step 7: Add learning status bar**

Above `<label className={clsx(styles["chat-input-panel-inner"], ...)}>`:

```tsx
{session.learning?.enabled && (
  <div className={styles["learning-mode-bar"]}>
    <span>{Locale.Chat.Learning.Status}</span>
    {session.learning.initialIntent && (
      <span className={styles["learning-mode-intent"]}>
        {session.learning.initialIntent}
      </span>
    )}
    <button
      type="button"
      className={styles["learning-mode-exit"]}
      onClick={() => {
        chatStore.stopLearningMode();
        showToast(Locale.Chat.Learning.Stopped);
      }}
    >
      {Locale.Chat.Learning.Exit}
    </button>
  </div>
)}
```

- [ ] **Step 8: Add compact styles**

In `app/components/chat.module.scss` near `.chat-input-panel`:

```scss
.learning-mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
  border: var(--border-in-light);
  border-radius: 8px;
  background: var(--white);
  color: var(--black);
  font-size: 12px;
  line-height: 1.4;
}

.learning-mode-intent {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--black);
  opacity: 0.75;
}

.learning-mode-exit {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
```

- [ ] **Step 9: Add locale keys**

In `app/locales/cn.ts` under `Chat.InputActions`:

```ts
Learning: "学习",
```

Under `Chat`:

```ts
Learning: {
  Status: "学习模式中",
  Exit: "退出学习",
  Stopped: "已退出学习模式",
  Help: "输入 /学习 加上你想学的内容，我会先通过提问了解你的目标和水平。",
},
```

In `app/locales/en.ts`:

```ts
Learning: "Learning",
```

```ts
Learning: {
  Status: "Learning mode",
  Exit: "Exit",
  Stopped: "Exited learning mode",
  Help: "Type /learn plus what you want to learn. I will ask questions first to understand your goal and level.",
},
```

If a visible helper is added later, reuse `Locale.Chat.Learning.Help`; do not add a fixed-form goal dialog in v1.

- [ ] **Step 10: Run UI/source tests**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 11: Run TypeScript and related tests**

Run:

```bash
yarn test:ci test/learning-mode.test.ts test/chat-actions.test.ts test/chat-mask-prompt-removal.test.ts --runInBand
yarn build
```

Expected: tests PASS; build PASS.

- [ ] **Step 12: Commit Task 3**

```bash
git add app/components/chat.tsx app/components/chat.module.scss app/locales/cn.ts app/locales/en.ts test/learning-mode.test.ts
git commit -m "feat: add learning mode chat entry"
```

---

### Task 4: Test Engineer Manual Test Cases

**Files:**
- Create: `docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md`

- [ ] **Step 1: Create test-case document before manual testing**

Create `docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md` with this structure:

```md
# Diagnostic Learning Mode Test Cases

## Scope

Validate that learning mode starts from `/学习` or the Learning button, uses AI diagnostic questioning rather than fixed forms, persists per chat session, exits cleanly, and does not regress ordinary chat.

## Coverage Matrix

| Requirement | Covered By |
| --- | --- |
| `/学习` starts learning mode | TC-001, TC-002 |
| AI infers level/time through questions | TC-003, TC-004 |
| Session persists learning state | TC-006 |
| Exit stops learning prompt injection | TC-007 |
| Slash boundary does not over-match | TC-008 |
| Existing chat features still work | TC-009, TC-010, TC-011 |
| Mobile layout is usable | TC-012 |

## Manual Test Cases

### TC-001 Start empty learning mode
- Preconditions: User is logged in with a valid OpenAI key.
- Steps: Open a normal chat, type `/学习`, send.
- Expected: Learning mode status appears; user message sent to AI is a diagnostic launch request; AI asks what the user wants to learn.

### TC-002 Start with rough topic
- Steps: Type `/学习 我想系统学 React`, send.
- Expected: Learning mode status appears with `我想系统学 React`; AI asks goal/background/current-level questions and does not immediately produce a rigid full course plan.

### TC-003 Multi-turn diagnostic
- Steps: Answer AI's diagnostic questions for 2-3 turns.
- Expected: AI summarizes learning goal, current level, recommended rhythm, staged route, and next task.

### TC-004 Guided learning continues
- Steps: Answer the next exercise or check question incorrectly once, then correctly.
- Expected: AI points out the misconception, gives a smaller hint, then advances.

### TC-005 Learning button
- Steps: Click Learning action in the input toolbar.
- Expected: Input is focused with `/学习 ` ready; sending a topic starts learning mode.

### TC-006 Session persistence
- Steps: Start learning mode, switch to another chat, return; refresh browser.
- Expected: Learning mode status remains for that session.

### TC-007 Exit learning
- Steps: Click Exit or send `/退出学习`, then send an ordinary question.
- Expected: Learning status disappears; subsequent prompt does not include learning tutor instructions.

### TC-008 Slash command boundary
- Steps: Send `/学习React`, `/learnPython`, and `/help`.
- Expected: They are sent as ordinary chat input and do not enable learning mode.

### TC-009 No API key behavior
- Preconditions: Logged-in user has no bound OpenAI key.
- Steps: Start learning mode and send.
- Expected: Existing API key modal/toast appears; learning state is retained.

### TC-010 Existing input actions
- Steps: Verify model selector, image generation toggle, upload image for vision model, web search, MCP, and shortcut modal where available.
- Expected: Existing actions still render and work.

### TC-011 Clear context
- Steps: Start learning mode, clear context, send a learning follow-up.
- Expected: Learning mode remains; AI does a short re-diagnosis if no summary exists.

### TC-012 Mobile layout
- Steps: Test on mobile viewport.
- Expected: Learning status bar, input, attached images, and send button do not overlap.

## Product Manager Coverage Review

- [ ] Covers startup, diagnosis, plan generation, guided learning, review/continuation, exit, and recovery.
- [ ] Covers normal path, error path, old data compatibility, and mobile layout.
- [ ] Verifies AI generates level/time/rhythm through questions, not user-filled fixed fields.
- [ ] Verifies ordinary chat and existing input actions still work.

## Execution Result

- Tester:
- Date:
- Build/commit:
- Result:
- Notes:
```

- [ ] **Step 2: Review test cases as Product Manager**

Compare the document to `docs/superpowers/specs/2026-06-21-learning-mode-design.md`.

Expected: The Product Manager coverage checklist includes all core requirements from the spec. If a requirement is missing, add a TC before testing.

- [ ] **Step 3: Commit Task 4**

```bash
git add docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md
git commit -m "test: document learning mode QA cases"
```

---

### Task 5: Automated Verification

**Files:**
- No source changes unless verification reveals a bug.

- [ ] **Step 1: Run focused learning tests**

Run:

```bash
yarn test:ci test/learning-mode.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run chat regression tests**

Run:

```bash
yarn test:ci test/chat-session-normalization.test.ts test/chat-actions.test.ts test/chat-mask-prompt-removal.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run full Jest suite**

Run:

```bash
yarn test:ci --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
yarn build
```

Expected: PASS.

- [ ] **Step 5: Fix any failures with TDD**

If any command fails, use @superpowers:systematic-debugging:

1. Capture the exact failure.
2. Identify the failing behavior.
3. Add or adjust the narrowest failing test.
4. Fix the implementation.
5. Rerun the failed command.

- [ ] **Step 6: Commit verification fixes if needed**

```bash
git add app/utils/learning.ts app/store/chat.ts app/components/chat.tsx app/components/chat.module.scss app/locales/cn.ts app/locales/en.ts test/learning-mode.test.ts test/chat-session-normalization.test.ts docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md
git commit -m "fix: stabilize learning mode verification"
```

---

### Task 6: Browser QA and Product User-Level Acceptance

**Files:**
- No source changes unless QA reveals a bug.

- [ ] **Step 1: Start local dev server**

Run:

```bash
yarn dev
```

Expected: Next.js dev server starts and prints a localhost URL, usually `http://localhost:3000`.

- [ ] **Step 2: Execute tester manual cases**

Use `docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md` and record the build/commit and result.

Expected: TC-001 through TC-012 pass or any failure is logged with reproduction steps.

- [ ] **Step 3: Product manager validates test coverage before accepting results**

Review the checklist in the test-case document.

Expected: All Product Manager coverage checklist items are checked. If not, add missing cases and rerun affected scenarios.

- [ ] **Step 4: Product manager user-level test**

Run this user-level flow:

1. Start a new chat.
2. Type `/学习 我想两周内学会 React Hooks`.
3. Confirm AI asks diagnostic questions rather than requesting fixed fields.
4. Answer as a beginner with 30 minutes per day.
5. Confirm AI summarizes goal, current level, rhythm, staged route, and next task.
6. Answer one check question incorrectly.
7. Confirm AI gives corrective guidance and a smaller hint.
8. Exit learning mode.
9. Send a normal non-learning message.

Expected: The learning flow feels like guided tutoring, not a static form or ordinary chat.

- [ ] **Step 5: Stop local dev server**

Terminate the `yarn dev` process.

- [ ] **Step 6: Commit QA documentation updates if results were recorded**

```bash
git add docs/superpowers/test-cases/2026-06-21-learning-mode-test-cases.md
git commit -m "test: record learning mode QA result"
```

---

## Final Handoff Checklist

- [ ] `test/learning-mode.test.ts` exists and passes.
- [ ] `app/utils/learning.ts` owns all learning parser/prompt helpers.
- [ ] `app/store/chat.ts` persists and normalizes `session.learning`.
- [ ] Learning prompt appends to existing system/MCP prompts.
- [ ] `/学习React`, `/learnPython`, and `/help` do not trigger learning mode.
- [ ] Chat UI shows a Learning action and learning status with exit control.
- [ ] Chinese and English visible labels are present.
- [ ] Test engineer manual cases are written before manual testing.
- [ ] Product Manager coverage review is complete.
- [ ] Full automated test suite and build pass.
- [ ] Product user-level acceptance flow passes.
