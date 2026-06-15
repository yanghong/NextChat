# Remove Masks, Quick Prompts, and Simplify Settings Design

## Goal

Simplify HongAI for high-frequency personal use by removing the mask/template workflow and quick prompt workflow from the product surface. Users should start a normal chat directly, see fewer controls in the chat input and settings page, and keep existing core chat capabilities such as model configuration, image generation, web search, MCP, realtime chat, history summarization, and sync.

This is a product-level hard removal with data-level compatibility. The first implementation should remove user-facing mask and quick-prompt features while preserving enough existing session shape to avoid breaking old local or remote data.

## Current Context

The app still carries the original NextChat mask model:

- `app/components/new-chat.tsx` shows a mask picker before creating a new chat.
- `app/components/mask.tsx` implements the mask management page and contextual prompt editor.
- `app/components/sidebar.tsx` exposes mask entry points and routes new chat through the mask splash screen depending on config.
- `app/components/chat.tsx` uses `PromptHints`, `PromptToast`, `ContextPrompts`, `usePromptStore`, and `useMaskStore` for quick prompts and contextual prompts.
- `app/components/settings.tsx` includes prompt management, prompt auto-complete settings, and mask splash/builtin-mask settings.
- `app/store/chat.ts` stores each session with `session.mask`, and many client/provider paths still read `session.mask.modelConfig`.
- `app/store/mask.ts` and `app/store/prompt.ts` persist user masks and custom prompts.
- `docs/user-manual-cn.md` and locale files still describe masks and prompt workflows.

The strongest coupling is `session.mask.modelConfig`. Removing the `mask` field from the data model in one step would affect chat sending, provider clients, message rendering, export, sync, and old persisted sessions. The first phase should therefore remove the feature semantics and UI while keeping compatibility fields.

## In Scope

Remove these user-visible capabilities:

- Mask page and mask management entry points.
- New-chat mask selection page.
- Sidebar mask button.
- Settings for mask splash screen and hiding builtin masks.
- Chat input quick prompt button.
- Slash-triggered quick prompt auto-complete.
- Custom prompt list and prompt editor in settings.
- Contextual prompt display/editing tied to masks.
- Save/edit conversation content as mask/context prompt.

Keep these capabilities:

- Normal chat creation and history.
- Per-session and global model settings.
- Model switching in the chat input.
- Image generation mode and image upload for vision models.
- Web Search toggle for supported models.
- MCP, plugins, Stable Diffusion, artifacts, realtime chat.
- System prompt injection and input preprocessing in model configuration.
- History memory/summarization.
- SD panel fields named prompt/negative prompt, because those are image-generation inputs rather than quick prompts.
- Existing local/remote chat data loading.

## Product Behavior

### New Chat

The primary new-chat action should create a plain chat session immediately and navigate to the chat route. It should not show a mask picker or ask users to choose a preset role.

If a user visits `/#/new-chat` directly, the route should create or show a normal chat rather than rendering the old mask selection UI. If a user visits `/#/masks`, the route should redirect to the chat/home route.

### Chat Input

The chat input should no longer show the quick prompt action. Typing `/` should behave like ordinary text and should not open prompt suggestions.

The input actions should retain controls unrelated to masks and quick prompts:

- Chat/session settings.
- Scroll to bottom and stop generation.
- Image upload when supported.
- Model selector.
- Reasoning mode and web search when supported.
- Image generation toggle and image parameters.
- Shortcut key display.
- MCP and realtime chat actions when available.

### Existing Sessions

Old sessions should be normalized into ordinary chats:

- Clear `session.mask.context`.
- Set `session.mask.hideContext` to `false`.
- Set `session.mask.name` to the default topic.
- Set `session.mask.avatar` to the default bot avatar.
- Keep `session.mask.modelConfig` so existing model choices, image settings, history settings, and provider settings are not lost.

This keeps old chats usable while removing the preset role and contextual prompt behavior.

### Settings

Settings should move toward a simpler tabbed structure:

- `Common`: avatar, send key, theme, language, font size, font family, auto title, preview bubble, artifacts, code folding.
- `Account & Keys`: HongAI AI entry, access code, logged-in user OpenAI API key, custom endpoint toggle, provider selector, provider keys/endpoints, balance.
- `Model`: custom model list, default model parameters, system prompt injection, input preprocessing, history count, compression threshold, memory settings.
- `Sync`: cloud state, local state, sync provider config, import/export.
- `Advanced`: realtime config, version update, reset settings, clear data.

Do not include mask or quick-prompt settings in the new settings surface.

Implementation may start with tab rendering inside `settings.tsx` to reduce first-phase risk. The design recommends a later refactor into smaller settings section components because `settings.tsx` is already over 2,000 lines.

## Technical Design

### Routes and Navigation

Remove mask route rendering from `app/components/home.tsx`. Keep route handling for old URLs by redirecting `/masks` and `/new-chat` to the normal chat flow.

Update `app/components/sidebar.tsx`:

- Remove the mask header action.
- Remove new-chat branching based on `dontShowMaskSplashScreen`.
- Make new-chat click call `chatStore.newSession()` and navigate to `Path.Chat`.

`Path.Masks` and `Path.NewChat` may remain in `app/constant.ts` during the compatibility phase if other old links or commands reference them. They should no longer lead to mask UI.

### Chat Store Compatibility

Keep `ChatSession.mask` and the `Mask` type in phase one. Add a small normalization helper near chat session migration/load logic that sanitizes mask semantics while preserving `modelConfig`.

The helper should be applied when:

- Persisted local chat store data is migrated or rehydrated.
- Remote chat sessions are loaded.
- A new empty session is created.

The helper should be idempotent so repeated loads do not change model configuration or message content.

### Chat UI

Remove quick prompt and contextual prompt UI from `app/components/chat.tsx`:

- `PromptHints`.
- `PromptToast`.
- `RenderPrompt`.
- `usePromptStore` usage.
- Slash prompt search and selection.
- Chat action for quick prompts.
- Context prompt rendering and editing.
- Save-to-mask/context-prompt actions.

Keep command handling only for non-prompt commands that are still useful. Remove or repurpose commands that create chats from masks.

Because `chat.tsx` is large, changes should be direct and conservative in phase one. A later cleanup can split the input actions, message actions, and session settings into focused modules.

### Settings UI

Remove prompt and mask settings code from `app/components/settings.tsx`:

- `UserPromptModal`.
- `EditPromptModal`.
- `usePromptStore` and `SearchService` usage.
- `useMaskStore` counts for sync overview if no longer displayed.
- Settings list items for `disablePromptHint`, custom prompt list, mask splash, and hide builtin masks.

Add a lightweight tab state for the five settings groups. Move existing settings blocks into the appropriate tab without changing their underlying behavior.

### Sync and Export

Do not break import/export or remote sync when old data contains `mask-store` or `prompt-store`.

In phase one:

- Sync may continue to read old prompt/mask keys if necessary, but the UI should not expose them.
- Export should not include mask context as exported conversation content after normalization.
- Existing remote data with masks/prompts should be ignored or normalized rather than causing errors.

A later phase can remove `StoreKey.Mask`, `StoreKey.Prompt`, `app/store/mask.ts`, `app/store/prompt.ts`, and builtin mask/prompt assets after the app has run with compatibility normalization.

### Documentation and Locales

Update Chinese and English product copy where visible:

- Remove or stop using visible labels for masks and quick prompts.
- Remove user-manual sections that teach mask and quick prompt workflows.
- Keep model-configuration copy for system prompt injection and input preprocessing.
- Keep SD prompt copy because it belongs to image generation.

Other locale files can retain unused strings in phase one unless the implementation removes the referenced keys from TypeScript types. The first pass should avoid forcing a broad translation cleanup.

## Error Handling

- Old `/masks` links should not crash or show a blank page; redirect to chat/home.
- Old mask share links should not create masked sessions. They should create/show a normal chat or redirect to chat/home.
- Bad or partial old session data should fall back to a normalized empty mask shell with current global model config.
- Prompt-store loading failure should not affect app startup because prompt UI is removed.

## Testing

Manual verification:

1. Click new chat in the sidebar; the app opens a plain chat directly.
2. Visit `/#/new-chat`; the app does not show a mask picker.
3. Visit `/#/masks`; the app redirects to chat/home.
4. Confirm no mask button appears in the sidebar.
5. Confirm no quick prompt button appears in the chat input.
6. Type `/`; no prompt suggestions appear and the slash remains normal input text.
7. Open settings; mask and quick-prompt settings are absent.
8. Confirm account/API key, model, sync, realtime, image generation, web search, and MCP controls still work.
9. Load an old session with `mask.context`; context is not displayed or sent.
10. Confirm the old session keeps its model/provider configuration.

Automated tests should cover:

- New chat creation no longer depends on mask splash config.
- Session normalization clears mask context while keeping model config.
- Slash input does not query prompt search.
- `/masks` and `/new-chat` routes do not render old mask UI.
- Settings no longer render prompt/mask controls.

## Rollout

1. Implement UI removal and route redirects.
2. Add session normalization for old mask data.
3. Add settings tabs and remove mask/prompt settings from the visible surface.
4. Update visible locale usage and Chinese manual.
5. Run focused tests and manual browser checks.
6. After stable usage, plan a second phase to remove remaining compatibility stores and unused assets.

## Deferred Work

- Full removal of `mask` from `ChatSession`.
- Full deletion of mask and prompt stores, builtin assets, and all unused locale strings.
- Broader product navigation cleanup for plugins, MCP, SD, and realtime chat.
- Splitting `chat.tsx` and `settings.tsx` into smaller focused components.
