# FRPC 日志结构化、日志级别与数字输入设计

## 目标

让 FRPC 标准输出只显示一次时间和一次结构化级别，允许用户在 FRPC、FRPS 的高级表单中配置日志级别，并移除全应用数字输入框的原生上下微调箭头。

## 范围

本次修改覆盖运行期日志归一化、FRPC/FRPS 表单日志级别、TOML 往返和全局数字输入样式。不改变 FRPC 启停、日志快照传输、ANSI 脱敏、NSIS/MSI 打包或端口数值校验。

## 日志结构化

FRPC 已输出标准前缀：`YYYY-MM-DD HH:mm:ss.SSS [I|W|E|D|T] `。后端在 ANSI 清洗和凭据脱敏后识别该前缀：

- `timestamp` 使用 FRPC 自带的毫秒时间；
- `[I]`、`[W]`、`[E]`、`[D]`、`[T]` 分别映射到 `info`、`warn`、`error`、`debug`、`trace`；
- `message` 只保留前缀之后的来源位置和实际内容；
- 非标准输出（例如应用自身的错误、第三方核心输出）保留清洗后的正文，并继续使用 GUI 捕获时间和既有级别推断。

因此界面行固定为“时间列、结构化级别标签、方案标签、正文”，不再重复显示 FRPC 的原始时间和级别标记。复制和导出基于同一结构化字段生成一行文本，不丢失时间、级别或方案归属。

## 日志级别设置

FRPC 与 FRPS 的表单高级区都新增“运行日志”设置，使用现有 `FeishuSelect`。默认值为 `info`，无论是新建、场景向导转入高级编辑，还是编辑既有配置但未设置 `log.level`，均落为 `info`。

选择器选项保持简短，选中后下方显示说明：

| 值 | 标签 | 说明 |
| --- | --- | --- |
| `info` | INFO（默认） | 日常运行：显示启动、登录、代理状态、告警和错误。 |
| `warn` | WARN | 减少正常输出，只保留告警和错误。 |
| `error` | ERROR | 仅保留错误，适合故障聚焦。 |
| `debug` | DEBUG | 控制连接、重连和心跳等排障细节。 |
| `trace` | TRACE | 最完整的协议追踪，仅用于难复现问题诊断。 |

表单保存和“生成 TOML”都会写入 `config.log.level`，由既有序列化器输出 `[log]` 节。TOML 源码模式解析 `log.level` 后回填选择器。高级表单不会新增 `log.to` 或改变已有 `maxDays` 的既有序列化规则。

日志面板筛选增加 `TRACE`，与 FRP 官方五种级别保持一致；保留现有全部、INFO、WARN、ERROR、DEBUG 筛选。

## 数字输入

在 `src/styles/globals.css` 的基础样式中对全部 `input[type="number"]` 设置 `appearance: textfield` 和 `-moz-appearance: textfield`，并隐藏 WebKit 的 `::-webkit-inner-spin-button`、`::-webkit-outer-spin-button`。这样所有原生 `input` 与 `FeishuInput` 的端口/数值字段都会隐藏上下箭头，仍保留 `type="number"`、现有 `min/max/step`、键盘输入和可访问语义。

## 测试与验收

- Rust：标准 FRPC 行解析为毫秒时间、结构化级别和去前缀正文；非标准行回退到捕获时间和既有级别推断。
- 前端：日志面板能筛选 TRACE；FRPC/FRPS 表单默认 INFO、修改后持久化并生成/解析正确 TOML；说明随选择变化。
- 样式：全局 CSS 包含标准跨浏览器 number spinner 隐藏规则，数字字段仍使用 `type="number"`。
- 人工：使用实际 FRPC 启动，确认每行只出现一个时间和一个级别；FRPC、FRPS 高级表单均可选择日志级别；端口数字框不再显示上下箭头。

## 完成标准

1. 标准 FRPC 日志在 UI、复制和导出中只显示一份时间和一份级别。
2. FRPC/FRPS 表单与 TOML 源码模式都正确保存和回填五种官方日志级别，默认 INFO。
3. TRACE 可在日志面板独立筛选。
4. 所有数字输入框不显示原生微调箭头且不降低现有输入语义或校验。
