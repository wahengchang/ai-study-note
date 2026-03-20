---
title: OpenClaw Telegram 模式 1（单 Bot）部署教程与高频故障排查
---

## Objective

- **Objective**: Deploy + Debug
- 目标读者：需要把 OpenClaw 接到 Telegram 群组的工程师/运维。
- 范围：`模式 1：单 Bot（所有群组共用同一智能体身份）`。

## 1) 模式定义（先对齐语义）

- 单 Bot 模式：一个 `botToken`（例如 `111:aaa`）服务多个群组。
- 该模式下，所有群共享同一 Bot 身份与同一行为策略（如 `requireMention`）。
- 适合：统一助手、统一规则的团队场景。
- 不适合：需要“每个群不同人格/不同模型/不同策略”的场景。

## 2) 最小可用流程（MVP）

### Step 1: 配置 Bot Token

- 在 OpenClaw 的 Telegram 集成配置中填入：

```yaml
telegram:
  mode: single-bot
  botToken: "111:aaa"
  requireMention: true
```

### Step 2: 启动服务

```bash
openclaw start
```

### Step 3: 完成私信配对（关键动作）

> **这是最容易漏掉的步骤。**

- Bot 不会“启动即自动回复所有人”。
- 用户在 Telegram 侧发起配对后，服务端必须执行：

```bash
openclaw pairing approve
```

- 配对码有效期通常为 **1 小时**；过期必须重新发起配对流程。

### Step 4: 关闭 BotFather 隐私模式（群聊必做）

- 在 BotFather 对该 Bot 执行 `/setprivacy` 并关闭隐私模式。
- **修改后必须将 Bot 从群组移除再重新加入**，否则新设置通常不会生效。

## 3) requireMention 的工程含义

| 配置           | 行为                            | 适用场景           | 风险                     |
| -------------- | ------------------------------- | ------------------ | ------------------------ |
| `true`（默认） | 仅当消息包含 `@bot_name` 时响应 | 大群、噪声高的群   | 低噪声、低误触发         |
| `false`        | 监听并响应群内每条消息          | 小型私密群、测试群 | 高噪声、成本上升、易刷屏 |

建议：

- 生产群默认 `requireMention: true`。
- 若测试 `false`，先在小群验证，再评估 token 消耗与误触发率。

## 4) “命令行开关” vs “配置文件” 的选择原则

- `activation` 类命令（例如 `/activation always`）适合 **测试阶段快速验证**。
- 行为确认后，应固化到配置文件并纳入版本管理。
- 不要长期依赖临时命令维持生产行为（不可审计、不可复现、易漂移）。

## 5) 高频故障与定位（按命中率排序）

### 症状 A：私聊完全不回复

- **高概率原因**：未执行配对批准。
- **验证**：检查是否执行过 `openclaw pairing approve`，以及配对码是否过期。
- **修复**：重新发起配对 -> 在有效期内 approve。

### 症状 B：群聊里看不到 Bot 响应

- **高概率原因**：隐私模式未关闭，或关闭后未“移除并重加 Bot”。
- **验证**：BotFather 当前隐私设置 + 群成员列表中的 Bot 是否为新加入状态。
- **修复**：`/setprivacy` 关闭 -> 移除 Bot -> 重新拉入群。

### 症状 C：只有 @ 才回复 / 或回复过于频繁

- **高概率原因**：`requireMention` 设定与预期不一致。
- **验证**：读取实际生效配置。
- **修复**：根据群规模调整为 `true` 或 `false`，重启/热加载配置。

## 6) 工程化上线清单（Critical Actions）

- [ ] Bot Token 已配置且来源安全（密钥管理）。
- [ ] 服务已启动且日志无初始化错误。
- [ ] 私信配对流程已跑通（含过期重试演练）。
- [ ] BotFather 隐私模式已关闭。
- [ ] Bot 已从目标群移除并重新加入。
- [ ] `requireMention` 与群规模匹配。
- [ ] 最终策略已写入配置文件并提交版本库。

## 7) 可直接复制的 Prompt 模板（给工程师）

### Prompt A：上线前检查

```text
请作为 OpenClaw 运维审计员，按“单 Bot 模式”输出上线检查结果：
1) 配对状态是否完成（含有效期风险）
2) BotFather 隐私模式状态
3) requireMention 当前值与风险
4) 是否存在仅靠临时命令维持行为的问题
最后用 P0/P1/P2 标记风险并给出修复顺序。
```

### Prompt B：故障排查

```text
你是值班工程师。已知现象：Telegram 群消息 Bot 不响应。
请按以下顺序输出：
- 最可能的 3 个根因（按概率排序）
- 每个根因的可执行验证步骤
- 每个根因的修复动作
- 修复后回归测试用例（至少 3 条）
限制：结论必须可操作，不要泛泛而谈。
```

### Prompt C：配置评审

```text
请审查以下 Telegram 单 Bot 配置是否适合生产：
- 重点评估 requireMention、激活策略、可审计性、误触发成本
- 给出“保守方案”和“激进方案”两套配置建议
- 输出变更影响与回滚步骤
```

## 8) 最小回归用例

```text
用例 1：私信用户已配对，发送普通问题，Bot 应答。
用例 2：群聊内不 @Bot（requireMention=true），Bot 不应答。
用例 3：群聊内 @Bot（requireMention=true），Bot 应答。
用例 4：切换 requireMention=false 后，群内普通消息 Bot 应答。
```
