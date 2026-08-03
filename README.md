# Share Master

Share Master is a private Windows desktop client for working with Codex, Claude, DeepSeek, Qwen, Gemini-compatible endpoints, local models, and custom OpenAI-compatible providers from one shared conversation workspace.

## Features

- Official OpenAI/Codex login, Claude Code, OpenAI-compatible APIs, and multiple independent accounts.
- Shared logical conversations across model providers.
- Concurrent conversations, background completion notifications, steer, interrupt, and persistent queued prompts.
- Projects, local rename/archive/removal, scheduled tasks, usage and pricing, provider health, and failover routes.
- Image attachments, drag and drop, message copy/quote/regenerate actions, and conversation full-text search.
- Private Skills, Prompt templates, and MCP configuration.
- Read-only discovery of local Codex, Claude Code, and CCSwitch provider configuration.
- Read-only browsing and one-way copying of local Codex and Claude conversation records.
- Configuration backup and directory/WebDAV synchronization without API credentials.

## Run

```powershell
npm install
npm start
```

Or launch the isolated local profile:

```powershell
npm install
& '.\Start Share Master.cmd'
```

`Start Share Master.cmd` stores runtime data below `share-master-data` and the Electron profile below `share-master-profile`. Both directories are ignored by Git.

The first screen selects a connection. You can:

- Use the default official OpenAI account.
- Add another OpenAI/GPT account with its own official Codex login.
- Use the existing Niubi or Hexuan profile.
- Add a relay with its display name, Base URL, model, and API key.

Use the window button in the title bar to open additional windows. Each window can connect through a different account or API while seeing the same chat history.

## Projects

The sidebar groups existing threads by their Codex working directory. Select a Project to show only that directory's threads, use the folder-plus button to register an empty directory, or use the window icon on a Project row to open it separately. New threads inherit the selected Project directory.

The thread tabs expose active, locally archived, scheduled-task, and app-locally removed views. Removed conversations can be restored or immediately removed from Share Master. Local rename, archive, remove, and immediate-delete actions never call the provider's rename/archive/delete methods and do not modify the original Codex or Claude conversation files.

Scheduled tasks can run once, hourly, daily, on weekdays, weekly, or monthly. A due task uses an already connected Share Master provider to create a new conversation in its selected Project; tasks remain pending while no provider is connected.

## Storage And One-Way Sync

Share Master reads and writes only its private conversation copy:

```text
share-master-data\conversations
```

The configured mirror scans only `.jsonl` files below the source `sessions` and `archived_sessions` directories every 15 seconds. New and updated source records are copied into the private store. Source files are never changed or deleted, and source deletions do not delete the private copy. Authentication, configuration, cache, and program files are not copied.

Share Master credentials remain separate. Custom relay keys are encrypted with Windows secure storage; plaintext keys are not exposed to the renderer. If both sides change the same mirrored record, Share Master backs up its local version under `.share-master-sync-backups` before applying a newer source record.

Configuration export and synchronization intentionally exclude API keys, login credentials, chat content, and machine-bound secrets.

## Verification

```powershell
npm run check
npm run test:unit
npm run test:vue-ui
npm run test:multi-window
npm run test:thread-performance
```

The one-hour stability suite can be run with `npm run test:stability-hour`.
