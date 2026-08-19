# Share Master User Guide

[Back to README](../README.md) | [中文](USER_GUIDE.zh-CN.md)

Share Master is a multi-model desktop client for Windows. It connects Codex, Claude Code, DeepSeek, Qwen, and OpenAI-compatible models in one workspace while keeping Share Master's conversations in a separate data directory.

> [!IMPORTANT]
> Share Master does not modify the application files of ChatGPT App, Codex, or Claude Code. Local configuration discovery and local conversation browsing access original data in read-only mode.

## 1. Installation and first launch

### Portable ZIP

1. Download the portable ZIP from [Releases](https://github.com/MttJelly/share-master/releases).
2. Extract the entire archive to a normal folder. Do not run the app from inside the archive.
3. Double-click `Share Master.exe`.

### MSI installer

1. Download and open the MSI package.
2. Complete the installation wizard.
3. Start Share Master from the desktop shortcut or Start menu.

The Select connection screen (`选择连接方式`) appears on first launch. Add or select one model connection before creating a conversation.

## 2. Codex and Claude Code prerequisites

Official account connections require the matching local command-line tool:

- Codex: `codex --version` should return a version in PowerShell.
- Claude Code: `claude --version` should return a version in PowerShell.

If a command is unavailable, install the CLI using its vendor's official instructions and restart Share Master. Share Master invokes the installed CLI but does not replace or modify it.

## 3. Add official accounts

### Default official account

1. Open the connection selector in the bottom-left corner.
2. Select Log in to default official account (`登录默认官方账号`).
3. Complete the official authentication flow that opens.

### Separate GPT account

1. Open Select connection (`选择连接方式`) and choose Add connection (`添加连接`).
2. Select the GPT account (`GPT 账号`) tab.
3. Leave the local label blank if you do not need to distinguish accounts, then choose Open ChatGPT login (`打开 ChatGPT 登录`).
4. Complete sign-in on the official OpenAI ChatGPT page opened in your browser. Do not enter your ChatGPT email or password in Share Master.

The local label only distinguishes accounts. Each separate account has its own authentication files while still using Share Master's shared conversation history. An incomplete official login keeps the chat workspace locked.

## 4. Add DeepSeek, Qwen, or a compatible API

1. Open Select connection (`选择连接方式`) and choose Add connection (`添加连接`).
2. Stay on the Model API (`模型 API`) tab and select a provider preset or a custom configuration.
3. Enter a display name, Base URL, default model, and API Key.
4. Select the API protocol. Most standard model APIs use `OpenAI Chat Completions`; use `OpenAI Responses` only when the service explicitly supports the Responses/Codex proxy protocol.
5. Choose Test connection and load models (`测试连接并读取模型`), then select a returned model.
6. Save the connection.

API Keys are encrypted through Windows secure storage and written only to Share Master's private data directory. Never place a key in a README, screenshot, Issue, or Git commit.

> [!NOTE]
> Chat Completions connections support streaming responses, interruption, and shared local conversations, but they do not provide Codex local tools or Skills. Actual capabilities depend on the provider and model.

## 5. Connections, models, and failover

- Use the bottom-left connection selector to switch accounts or APIs.
- Use the controls below the composer to select the model and reasoning effort for the current conversation.
- Open Connection health (`连接监控`) to test all connections and inspect response latency.
- When editing an API connection, enable Automatic failover (`自动故障转移`) to configure fallback order, failure threshold, and cooldown.

Failover uses only the fallback connections you configure. Model capabilities, context limits, and pricing may differ between providers.

## 6. Conversations and message controls

### Create and switch conversations

- Choose New chat (`新会话`) to start a conversation.
- After sending, the bottom of the conversation shows Connecting to model (`正在连接模型`) or Thinking (`正在思考`); it disappears when the response completes, fails, or stops.
- You can switch to another conversation while a response is running; the original conversation continues in the background.
- Share Master can send a Windows notification when background work completes. Check Windows notification permissions if none appears.
- The conversation list supports search. Its menu supports rename, archive, and remove actions.

### Send again, steer, and queue

You can enter another message while a response is being generated:

- Send (`发送`) steers the current response. Connections with native steering receive the new instruction directly; other connections stop the current turn and continue with the new prompt.
- Queue (`排队发送`) adds a message to that conversation's pending queue and runs it after the current response completes.
- Stop (`停止`) requests immediate cancellation of the current response.
- Clear pending messages (`清空待发送`) in the conversation menu removes queued messages that have not run.

If the model stream closes early, reaches an output limit, or is filtered by the provider, Share Master preserves the generated content and displays an interrupted-response card. A continuation prompt is sent only after you choose Continue generating (`继续生成`); potentially state-changing tasks are never retried automatically.

Queues are stored per conversation. Switching conversations neither clears a queue nor stops work in another conversation.

### Archive, remove, and delete now

- Archive organizes a conversation without deleting its record.
- Remove conversation (`移除会话`) moves it to Removed (`已移除`), where it can be restored for one hour.
- Delete now (`立即删除`) in Removed skips the grace period and permanently deletes the corresponding Share Master record.

Permanent deletion cannot be undone. Create any required backup first.

## 7. Projects and multiple windows

1. Select the add button next to Projects (`项目`) in the sidebar.
2. Enter a Project name. It must not duplicate an existing Project name.
3. Optionally select a local directory, or create the Project without one.
4. New conversations created while the Project is active are assigned to it automatically.

Projects are reordered according to the latest activity of their conversations. Deleting a Project removes its Share Master grouping and assignments but does not delete its linked local directory.

Use New window (`新建窗口`) in the title bar to open another window. Different windows can show different conversations, and background generation continues while you switch windows.

## 8. Scheduled tasks

1. Select the calendar button beside the Conversations heading to open Schedule task (`安排任务`).
2. Enter a task name, prompt, and first run time.
3. Choose Once, Hourly, Daily, Weekdays, Weekly, or Monthly recurrence.
4. Optionally select a Project, connection, model, and approval mode.
5. Choose whether to notify on completion or failure and whether to retry failures.
6. Save the task.

The Scheduled (`已安排`) tab lets you search, edit, enable, disable, run now, or delete tasks and inspect run history. A due task creates and runs a new conversation automatically.

To keep tasks running after closing the window, enable Keep running in tray after closing (`关闭窗口后留在托盘`) in App settings and leave Share Master running. Tasks cannot execute while the computer is off or Share Master is fully exited.

## 9. Image attachments

- Select the paperclip below the composer to choose an image.
- You can also drag image files directly into the chat area.
- Remove unwanted images from the attachment tray before sending.

Image understanding depends on the selected model and provider API. Attachments may contain private information, so inspect them before sending.

## 10. Discover local configurations

1. Open Select connection (`选择连接方式`).
2. Choose Discover local configurations (`发现本机配置`).
3. Review the read-only scan of Codex, Claude Code, and related environment-variable configurations.
4. Select the configurations you need and confirm the import.

Scanning does not modify source files. Only confirmed selections are written to Share Master. Secrets are stored in Share Master's encrypted secure storage and are not displayed in scan results.

## 11. Browse local Codex and Claude conversations

1. Select the drive button beside the Conversations heading.
2. Choose the Codex or Claude source.
3. Search for a conversation and open its read-only preview.
4. To continue it in Share Master, explicitly choose the copy/import action.

Browsing alone does not import, delete, or rewrite original records. A copied conversation belongs to Share Master, and later changes are not written back to the original client.

## 12. Skills, Prompts, and MCP

Open Extension center (`扩展中心`) from Select connection:

- Skills: install from a folder, ZIP, or GitHub source into Share Master's private Skill directory. You can refresh, enable, disable, or remove installed Skills.
- Prompts: create a command name, description, and template body. After saving, type `/` in the composer to find and insert it.
- MCP: configure `stdio`, Streamable HTTP, or SSE with commands, arguments, URLs, and encrypted environment variables. Test a saved server before enabling it for normal use.

Whether a Skill or MCP server can be called depends on the active connection. Review the source and requested permissions before importing or running third-party extensions.

## 13. Usage and cost

Open Usage and cost (`用量与成本`) to inspect local request statistics and set input, cached-input, and output pricing by provider and model. Cost is estimated from local token counts and the prices you enter; it is not the provider's invoice.

Share Master's usage logs do not store message bodies or credentials.

## 14. Import, export, backup, and sync

### Configuration import and export

Import (`导入`) and Export (`导出`) transfer Share Master configuration. An import preview appears before anything is written. API Key, Token, password, and credential fields in links are rejected.

### Local backup

Open Backup (`备份`) and choose Back up now (`立即备份`). Rotating backups retain up to 10 copies. Encrypted credentials can generally be decrypted only under the Windows security context that created them.

### Directory or WebDAV sync

1. Open Sync (`同步`).
2. Select Sync directory (`同步目录`) or `WebDAV`.
3. Configure the directory, or the WebDAV URL and account.
4. Run sync, push, or pull as needed and review any conflict warning.

Sync covers Share Master configuration, not API Keys, MCP secrets, or conversation bodies. Credentials must be configured separately on each device.

## 15. App settings and data location

App settings (`应用设置`) controls:

- Launch at Windows sign-in.
- Keep running in the tray after closing the window.
- Check for application updates.

The default private data directory is:

```text
%APPDATA%\Share Master\data
```

Open Conversation location (`记录位置`) from Select connection to view or change Share Master's conversation directory. Changing it does not move or delete records in the previous directory. Verify source and destination before running directory synchronization.

Uninstalling Share Master does not automatically delete `%APPDATA%\Share Master`. Back up any conversations you need before removing that directory manually.

## 16. Troubleshooting

### The composer is disabled or a message cannot be sent

1. Confirm that the bottom-left status shows a connection instead of Not connected (`未连接`).
2. Open Connection health (`连接监控`) and test the active connection.
3. For an API connection, run Test connection and load models again.
4. Confirm that a valid model is selected, the API Key is active, and the account has quota.
5. For Codex or Claude, verify the corresponding CLI command in PowerShell.
6. Fully exit and restart Share Master. If tray mode is enabled, exit from the tray menu as well.

### A conversation keeps generating after switching away

This is expected multi-conversation behavior. Return to that conversation to inspect progress, or choose Stop to cancel its current response.

### A scheduled task did not run

Confirm that the task is enabled, its time and local timezone are correct, its selected connection is available, and Share Master was not fully exited at the due time.

### The model did not recognize an image

Confirm that the attachment appears above the composer and use a model that explicitly supports vision input. Some OpenAI-compatible services do not accept images.

### API Keys are missing after sync

This is intentional. Sync and configuration exports do not carry secrets. Enter them locally on each device.

## 17. Privacy boundaries

- Share Master's private conversations, account configuration, and cache are independent of the original clients.
- Local configuration discovery and local conversation browsing do not modify source files.
- Share Master does not delete or overwrite original conversations from ChatGPT App, Codex, or Claude Code.
- Messages and attachments are sent to the model provider you select; that provider's privacy policy also applies.
- Release packages, configuration exports, and sync data should not contain API Keys, Tokens, login credentials, or original-client conversations.

For a reproducible problem, include the Share Master version, Windows version, connection type, reproduction steps, and a redacted error in a GitHub Issue. Never upload API Keys, Tokens, private conversations, or full logs containing personal paths.
