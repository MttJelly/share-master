# 更新日志

本文件记录 Share Master 每个版本的用户可见变化。版本号遵循语义化版本；每次向 GitHub 推送产品更新前，必须先更新版本号和本文件。

## [0.1.5] - 2026-08-04

### 修复

- 将 Windows AppUserModelID 固定为 Share Master 的应用 ID，修复源码运行时被 Windows 归类为 Electron 并显示默认原子图标的问题。
- 窗口和托盘在开发运行时统一使用多尺寸 Share Master ICO，安装版继续使用可执行文件内嵌的同一套图标。

## [0.1.4] - 2026-08-04

### 优化

- 缓存流式事件的共享会话映射，避免回答期间按片段同步读取和解析配置文件。
- 回答正文与思考摘要改为分块缓冲和增量文本更新，输入时暂停自动滚动布局，降低长会话输入卡顿和整机负载。

### 修复

- 底层 Codex 与 Claude 运行日志不再直接显示为用户错误弹层；真实失败仍通过会话状态和断线详情呈现。
- 聊天连接、发送、引导和中断请求改用结构化 IPC 错误，避免 Electron 输出 `Error occurred in handler` 技术窗口。
- 增加流式 DOM 写入和底层诊断隔离回归测试。

## [0.1.3] - 2026-08-04

### 修复

- 修复 GitHub Actions 在 Windows CRLF 检出环境中误报 Vue 生成文件过期的问题。
- UI 测试改为读取统一应用版本源，减少后续版本升级时的重复维护。

## [0.1.2] - 2026-08-04

### 新增

- 全新 Share Master 应用图标，并提供可重复生成 PNG/ICO 的矢量母版与构建脚本。
- 设置页可按 GitHub Release 检查最新发布版本，并在有更新时直接打开下载页面。

### 优化

- README 下载地址改为稳定的 Latest Release 链接，版本升级后不再需要手工替换 URL。
- 发布流程同时生成带版本号文件、稳定下载别名和 SHA-256 清单。

### 修复

- 统一应用版本来源，修复 Codex 客户端标识、Claude 请求和中转请求仍停留在旧版本的问题。
- 增加发布元数据检查，阻止 package、lockfile、更新日志和下载链接版本维护不一致。

## [0.1.1] - 2026-08-04

### 新增

- 修复中断的自定义工具调用记录，在恢复 Share Master 私有会话前补全明确的取消结果。
- 为权限选择弹窗增加更清晰的说明、状态反馈和焦点恢复。

### 优化

- 助手回答尚未完成时隐藏复制、引用和重新生成操作，回答完成或停止后再显示。
- 流式回复改为轻量增量渲染，完成后再统一解析 Markdown，减少长回复期间输入卡顿。
- 输入框尺寸与 Skill 自动完成合并到逐帧更新，连续输入时减少布局和自动滚动竞争。
- 精简消息队列控件，明确区分排队与引导，防止同一条消息被重复消费。

### 修复

- 修复切换权限后输入框短时间无法使用的问题。
- 修复思考摘要宽度和长文本换行异常。
- 修复恢复会话时 `Custom tool call output is missing` 导致连接失败的问题。

[0.1.1]: https://github.com/MttJelly/share-master/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/MttJelly/share-master/compare/v0.1.1...v0.1.2
[0.1.3]: https://github.com/MttJelly/share-master/compare/v0.1.2...v0.1.3
[0.1.4]: https://github.com/MttJelly/share-master/compare/v0.1.3...v0.1.4
[0.1.5]: https://github.com/MttJelly/share-master/compare/v0.1.4...v0.1.5
