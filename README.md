# Share Master

Share Master 是一款面向 Windows 的多模型桌面客户端。它把 Codex、Claude Code、DeepSeek、Qwen 和其他 OpenAI 兼容服务集中在同一个本地会话工作区中，并允许不同模型共享 Share Master 自己的聊天记录。

> Share Master 使用独立的数据目录。读取本机 Codex、Claude Code 或 CCSwitch 配置与聊天记录时采用只读方式，不会修改原始客户端的文件。

## 主要功能

- 支持 OpenAI/Codex 官方登录、Claude Code、DeepSeek、Qwen 和自定义 OpenAI 兼容接口。
- 多连接与多账号管理，可配置模型、API 地址、故障转移顺序、健康检查及用量价格。
- 不同模型共享 Share Master 私有会话记录，可在会话级别切换模型。
- 多会话并行运行，支持后台完成通知、停止回复、引导当前回复和消息排队发送。
- 支持 Project、会话搜索、重命名、归档、移除、立即删除和多窗口。
- 支持一次、每小时、每天、工作日、每周和每月执行的已安排任务。
- 支持图片附件、拖放上传、图片预览，以及消息复制、引用和重新生成。
- 支持 `/` Skill、Prompt 模板和 MCP 配置。
- 只读发现本机已有模型或中转站配置，并可选择性导入 Share Master。
- 只读浏览 Codex 和 Claude Code 的本地聊天记录，并可单向复制到私有工作区。
- 支持配置备份、目录同步和 WebDAV 同步；同步内容不包含 API Key 和聊天正文。

## 下载与安装

### ZIP 便携版

下载 `Share-Master-0.1.0-portable-win-x64.zip`，解压到任意目录后运行 `Share Master.exe`。ZIP 版本无需安装，删除解压目录即可移除程序。

### MSI 安装版

运行 `Share-Master-0.1.0-setup-win-x64.msi`，按安装向导完成安装。安装程序会创建开始菜单和桌面快捷方式，可从 Windows“已安装的应用”中卸载。

当前构建为 x64 Windows 版本。软件暂未进行商业代码签名，Windows SmartScreen 首次运行时可能要求确认来源。

## 首次使用

1. 启动 Share Master，在“选择连接方式”中选择官方账号或添加 API 连接。
2. 使用 Codex 时需要先安装 Codex CLI，并确保终端可以运行 `codex`。
3. 使用 Claude 时需要先安装 Claude Code CLI，并确保终端可以运行 `claude`。
4. DeepSeek、Qwen 或其他兼容服务只需填写 Base URL、模型名称和 API Key。
5. API Key 使用 Windows 安全存储加密，只保存在当前电脑的 Share Master 数据目录中。

## 数据位置与安全

安装版和 ZIP 版默认把私有配置与聊天副本保存在：

```text
%APPDATA%\Share Master\data
```

开发环境通过 `Start Share Master.cmd` 启动时，数据保存在项目目录下的 `share-master-data` 中。

Share Master 不会把以下内容打进发布包或配置导出文件：

- API Key、Token、登录凭据和 Windows 安全存储数据。
- Share Master 私有聊天记录。
- Codex、Claude Code 或 ChatGPT 原始聊天记录。
- 本机测试数据、日志与用户路径配置。

删除软件不会自动删除 `%APPDATA%\Share Master`。如需彻底清理，可在卸载后手动删除该目录；执行前请先备份需要保留的 Share Master 会话。

## 开发运行

需要 Node.js 20 或更高版本。

```powershell
npm install
npm start
```

使用项目内隔离数据目录：

```powershell
& '.\Start Share Master.cmd'
```

## 构建发布包

```powershell
npm install
npm run dist:win
```

生成文件位于 `release` 目录。

## 测试

```powershell
npm run check
npm run test:unit
npm run test:vue-ui
npm run test:project-actions
npm run test:multi-window
```

## 隐私边界

Share Master 是独立应用，只复用当前电脑上已安装的 CLI 或用户明确导入的配置。它不会修改原始 ChatGPT App、Codex、Claude Code 或 CCSwitch 的程序文件，也不会删除或覆盖这些客户端的原始聊天记录。
