# Share Master

Share Master is a Windows desktop client for the local Codex app-server. It supports official OpenAI accounts, Niubi/Hexuan API profiles, and user-defined relay stations while keeping its own local conversation store.

## Run

```powershell
cd F:\codepro
npm install
npm start
```

For the dedicated one-way mirror configured on this machine, open `Start Share Master.cmd`. It always uses `F:\codepro\share-master-data` and `F:\codepro\share-master-profile`.

The first screen selects a connection. You can:

- Use the default official OpenAI account.
- Add another OpenAI/GPT account with its own official Codex login.
- Use the existing Niubi or Hexuan profile.
- Add a relay with its display name, Base URL, model, and API key.

Use the window button in the title bar to open additional windows. Each window can connect through a different account or API while seeing the same chat history.

## Projects

The sidebar groups existing threads by their Codex working directory. Select a Project to show only that directory's threads, use the folder-plus button to register an empty directory, or use the window icon on a Project row to open it separately. New threads inherit the selected Project directory.

The thread tabs expose active, locally archived, scheduled-task, and app-locally removed views. Removed conversations can be restored or immediately removed from Share Master. Local rename, archive, remove, and immediate-delete actions never call the provider's rename/archive/delete methods and do not modify the original Codex or Claude conversation files.

Scheduled tasks can run once, daily, or weekly. A due task uses an already connected Share Master provider to create a new conversation in its selected Project; tasks remain pending while no provider is connected.

## Storage And One-Way Sync

Share Master reads and writes only its private conversation copy:

```text
F:\codepro\share-master-data\conversations
```

The configured mirror scans only `.jsonl` files below the source `sessions` and `archived_sessions` directories every 15 seconds. New and updated source records are copied into the private store. Source files are never changed or deleted, and source deletions do not delete the private copy. Authentication, configuration, cache, and program files are not copied.

Share Master credentials remain separate. Custom relay keys are encrypted with Windows secure storage; plaintext keys are not exposed to the renderer. If both sides change the same mirrored record, Share Master backs up its local version under `.share-master-sync-backups` before applying a newer source record.
