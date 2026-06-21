# Learning Mode Manual Test Cases

Date: 2026-06-21
Branch: codex/learning-mode
Product: ChatGPTNextWeb diagnostic learning mode

## Scope

This document covers manual QA for the diagnostic learning mode experience in ChatGPTNextWeb.

In scope:
- Learning mode entry through `/学习`, `/learn`, `/study`, and the input toolbar learning button.
- Diagnostic multi-turn guidance where AI asks about learning goal, current level, available time, and study rhythm instead of using a fixed form.
- Learning plan generation, same-session learning state persistence, and continued guidance.
- Learning mode exit through `/退出学习`, `/exit-learn`, and the learning status bar exit button.
- Slash command boundary behavior, including non-trigger cases such as `/学习React` and `/learnPython`.
- Coexistence with existing global system prompts and MCP system prompts.
- Session persistence and compatibility with old or abnormal learning state data.
- Mobile layout safety around the status bar, input box, and action buttons.
- Regression coverage for normal chat, attachments, drafts, and API-key-missing behavior.

Out of scope:
- Model quality scoring beyond verifying that the requested diagnostic and planning behavior is present.
- Long-term cross-device sync unless the tested build already supports cross-device session sync.
- Backend model provider correctness unrelated to learning mode prompt injection and request shape.

## Coverage Matrix

| Area | Requirement | Test Cases |
| --- | --- | --- |
| Slash entry | `/学习`, `/learn`, `/study` start learning mode when followed by whitespace or end of input | TC-001, TC-002 |
| Slash boundaries | Similar strings without required boundary do not trigger learning mode | TC-003 |
| Toolbar button | Empty input is prefilled with localized start command; submitting it starts learning; non-empty draft is preserved | TC-004 |
| Initial model message | `/学习 React`, `/learn React`, and `/study React` start learning and send converted learning-start messages, not raw slash commands | TC-002 |
| Diagnostic flow | AI asks multi-turn questions for goal, level, time, and rhythm instead of showing a fixed form | TC-005 |
| Plan generation | AI generates goal breakdown, staged plan, daily task, and continued guidance | TC-006 |
| Session state | Learning state persists in the current chat session and does not leak to other sessions | TC-007 |
| Exit behavior | Slash exit and status bar exit stop learning mode | TC-008, TC-009 |
| Exit side effects | `/退出学习` does not call model and clears input/attachments | TC-008 |
| Prompt coexistence | Learning system prompt coexists with global/MCP prompts; exits cleanly | TC-010 |
| Compatibility | Old, missing, malformed, or remote abnormal learning data does not crash | TC-011 |
| Error path | API key missing follows existing error path and preserves learning state/draft | TC-012 |
| Mobile regression | Status bar does not cover input or actions on mobile | TC-009 |
| Normal chat regression | Existing chat, send, attachment, and command behavior continue to work | TC-003, TC-012 |

## Execution Strategy

Use automated tests for deterministic behavior:
- Slash parsing and boundary behavior.
- Learning start/stop state updates.
- Converted learning-start message creation.
- Prompt injection and cleanup.
- Persisted session normalization for missing, old, and malformed `learning` data.

Use manual testing for product experience:
- Whether the assistant asks diagnostic questions instead of showing a fixed form.
- Whether the generated plan is useful enough for a learner.
- Whether localized copy is understandable.
- Whether mobile layout has no visual overlap after real rendering.
- Whether network payloads match the expected request shape in the running app.

## Manual Test Cases

### TC-001 - Start Learning Mode With Slash Command Only

Priority: P0

Preconditions:
- App is running with a valid model configuration and API key.
- Open an existing or new chat session that is not currently in learning mode.
- Browser devtools Network panel is available for request inspection.

Steps:
1. In the chat input, type `/学习`.
2. Submit the message.
3. Observe the chat UI and the outgoing model request.
4. Repeat in a new chat session with `/learn`.
5. Repeat in another new chat session with `/study`.

Expected results:
- Each command starts learning mode.
- The learning status bar appears and clearly indicates the current learning mode.
- The first model call is made for learning-mode initiation.
- The raw slash command is not displayed or sent as a normal user chat message.
- The assistant starts diagnostic learning guidance instead of showing a fixed form.
- Existing global UI controls remain usable.

### TC-002 - Start Learning Mode With Topic Argument

Priority: P0

Preconditions:
- App has a valid API key.
- Open a new chat session outside learning mode.
- Network request payloads can be inspected.

Steps:
1. Type `/学习 React` in the input.
2. Submit the message.
3. Inspect the user-visible conversation and the outgoing model request payload.
4. Repeat in new sessions with `/learn React` and `/study React`.
5. Continue one turn by answering a diagnostic question.

Expected results:
- Learning mode starts immediately.
- The request sent to the model uses a converted learning-start message that includes React as the learning target.
- The original `/学习 React`, `/learn React`, or `/study React` command is not sent as a normal user message.
- The assistant asks diagnostic follow-up questions about React learning needs, current level, available time, and rhythm.
- The session remains in learning mode after the first reply.

### TC-003 - Slash Command Boundary And Normal Chat Regression

Priority: P0

Preconditions:
- Open a chat session outside learning mode.
- App has a valid API key.

Steps:
1. Type `/学习React` and submit.
2. Observe whether learning mode starts.
3. Start another new chat session.
4. Type `/learnPython` and submit.
5. Observe whether learning mode starts.
6. Send a normal non-command message, such as `Explain React state in one paragraph`.

Expected results:
- `/学习React` does not trigger learning mode.
- `/learnPython` does not trigger learning mode.
- These inputs are treated through the existing normal chat path.
- Normal chat still sends and receives responses as before.
- No learning status bar appears for boundary-failed commands.

### TC-004 - Learning Toolbar Button Draft Behavior

Priority: P1

Preconditions:
- Open a chat session outside learning mode.
- The input toolbar learning button is visible.
- Test once in Chinese locale and once in English locale if locale switching is available.

Steps:
1. Ensure the input box is empty.
2. Click the learning button.
3. Observe the input content.
4. Submit the prefilled command.
5. Observe the chat UI and first model request.
6. Exit learning mode.
7. Type a draft such as `I want to ask about hooks`.
8. Click the learning button again.

Expected results:
- With empty input, the button pre-fills the localized learning start command.
- In Chinese locale, the prefilled command is localized, for example `/学习`.
- In English locale, the prefilled command is localized, for example `/learn`.
- Submitting the prefilled command starts learning mode, shows the learning status bar, and begins diagnostic guidance.
- The prefilled command is not sent as a normal chat message.
- With non-empty input, the existing draft is not overwritten.
- Cursor focus remains in or returns to the input for continued editing.
- No message is sent merely by clicking the toolbar button.

### TC-005 - Diagnostic Multi-Turn Learning Intake

Priority: P0

Preconditions:
- App has a valid API key.
- Start learning mode with `/学习 Python 数据分析`.

Steps:
1. Read the assistant's first learning-mode response.
2. Answer only part of the question, such as `I know basic Python`.
3. Submit and read the next assistant response.
4. Answer available time, such as `I can study 30 minutes on weekdays and 2 hours on Sunday`.
5. Submit and read the next assistant response.
6. Answer learning rhythm or target, such as `I want a job-ready portfolio project in two months`.

Expected results:
- The assistant does not present a fixed form requiring manual fields like current level or daily time.
- The assistant asks conversational diagnostic questions, with no more than three questions in a single assistant turn.
- Across turns, the assistant gathers learning goal, current level, available time, and study rhythm.
- The assistant uses prior answers in follow-up questions and does not repeatedly ask for already supplied information unless clarification is needed.
- The learning status bar remains visible throughout.

Minimum pass criteria:
- At least two assistant turns contain diagnostic questions before a complete plan is produced, unless the user already supplied goal, level, time, and rhythm in one answer.
- The assistant explicitly references at least two supplied facts, such as `basic Python`, `30 minutes on weekdays`, or `portfolio project in two months`.
- The assistant does not ask the user to fill a table, settings panel, or fixed field list for current level and study time.

### TC-006 - Plan Generation And Continue Learning

Priority: P0

Preconditions:
- A learning-mode session has collected at least learning goal, current level, available time, and target horizon, or the assistant has explicitly said it has enough context to plan.

Steps:
1. Ask the assistant to generate the learning plan, or answer the assistant's final diagnostic question.
2. Review the assistant response.
3. Send a follow-up such as `Start today's task`.
4. Complete or partially answer the task.
5. Send `continue` or a localized equivalent such as `继续`.

Expected results:
- The assistant generates a learning goal breakdown.
- The assistant includes a staged learning plan.
- The assistant includes an actionable current-day task.
- The assistant continues guiding the user through the task rather than ending at the plan.
- Follow-up turns use the existing plan and learning context from the current session.
- No fixed intake form appears at any point.

Minimum pass criteria:
- The plan includes at least three sections or bullets that map to goal, current level, suggested rhythm, staged route, and next task.
- Today's task is concrete enough to start immediately and includes an exercise, reading target, or practice prompt.
- After `continue` or `继续`, the assistant references the plan or current task and gives the next learning action rather than restarting intake.

### TC-007 - Learning State Persists Per Chat Session

Priority: P0

Preconditions:
- App supports multiple chat sessions.
- A valid API key is configured.

Steps:
1. In Chat A, start learning mode with `/learn SQL`.
2. Complete at least one diagnostic exchange.
3. Switch to Chat B or create a new chat.
4. Verify Chat B's mode and send a normal message.
5. Switch back to Chat A.
6. Refresh the browser page.
7. Reopen Chat A.

Expected results:
- Chat A remains in learning mode before and after switching sessions.
- Chat B does not automatically enter learning mode because Chat A did.
- Normal chat in Chat B behaves normally and does not include learning prompts.
- After refresh, Chat A restores learning state and status bar.
- The restored Chat A conversation can continue the learning flow without losing the previous context.

### TC-008 - Exit With Slash Command

Priority: P0

Preconditions:
- Open a chat session currently in learning mode.
- Attach at least one file or image if attachments are supported.
- If the app supports draft restoration, prepare any non-command draft in a separate check; this case verifies the exit command input itself and current attachments are cleared.
- Network panel is open.

Steps:
1. Type `/退出学习` in the input.
2. Submit the command.
3. Observe UI state and network activity.
4. Start learning mode again.
5. Repeat with `/exit-learn`.

Expected results:
- Learning mode exits immediately.
- No model request is made for the exit command.
- The learning status bar disappears.
- The exit command input is cleared.
- Current attachments are cleared.
- The exit command is not sent or displayed as a normal user chat message.
- Subsequent normal messages do not include the learning system prompt.

### TC-009 - Exit With Status Bar Button And Mobile Layout

Priority: P1

Preconditions:
- Open a chat session currently in learning mode.
- Test on desktop width and mobile width, for example 390 x 844.
- Browser devtools responsive mode or a real mobile device is available.

Steps:
1. On desktop, locate the learning status bar and click its exit button.
2. Restart learning mode.
3. Switch to mobile viewport.
4. Verify status bar placement around the input and action buttons.
5. Click the status bar exit button on mobile.
6. Send a normal chat message after exit.

Expected results:
- The status bar exit button stops learning mode.
- The status bar does not obscure the input field, send button, attachment button, voice button, or other existing action buttons.
- Mobile scrolling and keyboard interaction remain usable.
- After exit, normal chat works without learning status or prompt injection.
- No visual overlap or clipped essential controls appears on mobile.

### TC-010 - Learning Prompt Coexists With Global And MCP System Prompts

Priority: P1

Preconditions:
- Configure a global system prompt, for example `Always answer concisely`.
- Enable or configure an MCP/system prompt path if available in the test environment.
- App has a valid API key.
- Network request payloads can be inspected.

Steps:
1. Start learning mode with `/learn TypeScript`.
2. Send one diagnostic answer.
3. Inspect the outgoing request messages or prompt payload for the current model provider.
4. Exit learning mode.
5. Send a normal chat message and inspect its request payload.

Expected results:
- During learning mode, at least one `system` role message contains the learning mentor guidance text, including the instruction that the assistant should diagnose goal, current level, constraints, and learning rhythm.
- Existing global system prompt content remains present in a `system` message. It may be in the same system message as the learning prompt or in another system message.
- Existing MCP system prompt content remains present when MCP is enabled. It may be in the same system message as the global prompt or in another system message.
- Prompt composition does not drop the global prompt, MCP prompt, user message, or prior chat context.
- After exit, no `system` message contains the learning mentor guidance text or the serialized learning context block.
- Global and MCP prompts continue to behave as they did before learning mode.

### TC-011 - Old, Missing, Or Abnormal Learning Data Compatibility

Priority: P0

Preconditions:
- Tester can edit browser storage in devtools.
- Chat state is stored under key `chat-next-web-store` in IndexedDB through `idb-keyval`, with localStorage fallback under the same key.
- Keep a backup of any manually edited storage value before testing.

Steps:
1. Open devtools Application storage and locate `chat-next-web-store` in IndexedDB or localStorage.
2. Back up the full JSON value.
3. Edit one session so the `learning` field is absent, then refresh and reopen the app.
4. Restore the backup, then edit one session so `learning` is an old or invalid shape, for example `true`.
5. Refresh and reopen the app.
6. Restore the backup, then edit one session so `learning` is an object with invalid nested values, for example `{ "enabled": true, "phase": "unknown", "initialIntent": 123, "summary": null, "updatedAt": "bad-date" }`.
7. Refresh and reopen the app.
8. Try starting and exiting learning mode from the affected session.

Expected results:
- The app does not crash for missing learning data.
- The app does not crash for old learning data shape.
- The app does not crash for abnormal remote learning state.
- Invalid or unknown learning data is safely ignored, migrated, or normalized.
- For invalid object values, `phase` is normalized to a supported phase, non-string text fields do not render as broken UI text, and invalid `updatedAt` does not break hydration.
- The user can still start learning mode after compatibility handling.
- Existing chat history is not lost.

### TC-012 - API Key Missing Error Path And Draft Preservation

Priority: P1

Preconditions:
- Remove or disable the API key using the existing app settings path.
- Open a chat session outside learning mode.

Steps:
1. Type a draft such as `I want to learn algorithms`.
2. Click the learning toolbar button.
3. Verify the draft is not overwritten.
4. Clear input and type `/learn algorithms`.
5. Submit the command.
6. Observe the error or modal path for missing API key.
7. Restore the API key.
8. Reopen the same session.

Expected results:
- The non-empty draft is preserved when clicking the learning button.
- Missing API key uses the existing app error, dialog, or settings prompt path.
- The app does not silently drop the learning state.
- The app does not silently drop the user's draft unless the existing send behavior already clears drafts for failed sends.
- After restoring the API key, the session can continue or restart learning mode without corruption.
- Ordinary missing-key behavior for normal chat is not regressed.

## Product Manager Coverage Review

| Product Requirement | Covered By | Review Notes |
| --- | --- | --- |
| Entry can be `/学习`, `/learn`, `/study`, or toolbar learning button | TC-001, TC-004 | Covers localized toolbar prefill and submit flow. |
| Entry supports topic text such as `/学习 React`, `/learn React`, or `/study React` | TC-002 | Verifies converted learning-start message and no raw slash leakage. |
| No fixed form for current level or daily time | TC-005, TC-006 | Verifies diagnostic conversational intake. |
| AI understands goal, level, time, and rhythm through multi-turn questions | TC-005 | Covers partial answers and follow-up behavior. |
| AI generates goal breakdown, staged plan, today's task, and continuous guidance | TC-006 | Covers plan creation and continued learning. |
| Learning state is saved to current chat session | TC-007 | Includes session switching and refresh persistence. |
| `/退出学习` and status bar exit stop learning mode | TC-008, TC-009 | Covers slash and UI exits. |
| Normal chat and existing input actions do not regress | TC-003, TC-004, TC-009, TC-012 | Includes drafts, attachments, mobile actions, and missing API key path. |
| Slash command boundary prevents false triggers | TC-003 | Covers `/学习React` and `/learnPython`. |
| Learning prompt coexists with global/MCP prompts and stops after exit | TC-010 | Covers prompt composition and cleanup. |
| Old or abnormal learning data is compatible | TC-011 | Covers local and remote abnormal states. |
| Mobile status bar does not block input/actions | TC-009 | Covers responsive viewport verification. |

PM sign-off checklist:
- [ ] All P0 cases pass.
- [ ] No product requirement is missing test coverage.
- [ ] Any accepted P1/P2 defects have explicit product approval.
- [ ] Learning-mode copy and localization are acceptable for the target release.
- [ ] Diagnostic flow quality is acceptable for at least two representative learning topics.

## Execution Result Template

Build under test:

Tester:

Date:

Environment:
- OS:
- Browser and version:
- Viewports tested:
- Locale:
- Model/provider:
- API key state:

Result values:
- Pass
- Fail
- Blocked
- Not Run

| Test Case | Priority | Result | Defect ID | Evidence | Blocked Reason | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TC-001 | P0 | Not Run |  |  |  |  |
| TC-002 | P0 | Not Run |  |  |  |  |
| TC-003 | P0 | Not Run |  |  |  |  |
| TC-004 | P1 | Not Run |  |  |  |  |
| TC-005 | P0 | Not Run |  |  |  |  |
| TC-006 | P0 | Not Run |  |  |  |  |
| TC-007 | P0 | Not Run |  |  |  |  |
| TC-008 | P0 | Not Run |  |  |  |  |
| TC-009 | P1 | Not Run |  |  |  |  |
| TC-010 | P1 | Not Run |  |  |  |  |
| TC-011 | P0 | Not Run |  |  |  |  |
| TC-012 | P1 | Not Run |  |  |  |  |

Evidence guidance:
- Attach screenshots for UI and mobile layout checks.
- Attach HAR, console log excerpt, or redacted request payload for network payload checks.
- Attach before/after storage JSON snippets for compatibility checks.
- Link defect records for every failed or blocked P0 case.

Summary:
- Passed:
- Failed:
- Blocked:
- Not run:

Defect summary:

Release recommendation:
- [ ] Pass
- [ ] Pass with known issues
- [ ] Block release
