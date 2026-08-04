# Share Master 发布维护流程

本流程适用于向 GitHub 推送 Share Master 的产品代码更新。普通文档纠错可合并处理；只要推送包含功能、修复或用户体验变化，就必须完成以下步骤。

1. 按语义化版本更新 `package.json` 和 `package-lock.json`。修复使用补丁版本，兼容功能使用次版本，不兼容变化使用主版本。
2. 在 `CHANGELOG.md` 新增对应版本、日期和实际更新内容，不使用“若干优化”等模糊描述。
3. 运行构建检查、单元测试、界面测试和受影响功能的专项测试。
4. 使用 `git diff --check` 检查格式，再提交并推送。
5. 创建发布包时，确认 ZIP、MSI、Git Tag、GitHub Release 和 README 下载链接使用同一版本号。

最低验证命令：

```powershell
npm run build:renderer
npm run check
npm run test:unit
npm run test:vue-ui
git diff --check
```

涉及会话并行、流式输出或消息队列时，还必须运行：

```powershell
npm run test:thread-performance
npm run test:thread-actions
npm run test:multi-window
```
