# AI Usage · Übersicht 桌面小组件

[English](README.md) | **简体中文**

<p align="center"><img src="screenshot.png" alt="AI Usage 组件截图" width="516"></p>

一个 [Übersicht](https://tracesof.net/uebersicht/) 的 macOS 桌面小组件,一眼看到
**Claude Code**(以及可选的 **OpenAI Codex CLI**)用量——数据来自本地 CLI
(默认 [`ccusage`](https://github.com/ryoppippi/ccusage),读 `~/.claude` 下的 JSONL 日志)。
**全程本地、无网络请求、无凭据。**

> 注意:显示的是 **Claude Code / Codex CLI** 的用量,它们的记录就在本机日志里。
> 这不是 claude.ai / chatgpt.com 网页聊天的额度(那个没有本地数据可读)。

## 功能

- 当前 5 小时窗口的已用 / 上限 + 重置倒计时
- 进度条四档变色(绿 → 黄 → 橙 → 红),包豪斯风格
- 日 / 周 / 月多粒度统计,带迷你进度条
- 可展开的每日柱状图(近 30 天),悬停查看按模型明细
- 浅色 / 深色主题跟随系统外观
- 卡片可拖动并记忆位置;手动刷新按钮
- 显示当前登录账户(读本地配置,只读)

## 依赖

- [Übersicht](https://tracesof.net/uebersicht/)
- `node` / `npx`(运行 ccusage 用)
- `python3`

## 安装

1. 把 `ai-usage.widget/`(含 `index.jsx`、`fetch-usage.py`)放进
   `~/Library/Application Support/Übersicht/widgets/`
2. 先单独验证 ccusage 能跑:
   ```bash
   npx ccusage@latest blocks --active --json
   ```
   能打印 JSON 就 OK。嫌 npx 每次慢可全局装:`npm i -g ccusage`,
   然后把 `fetch-usage.py` 里 `command` 改成 `["ccusage","blocks","--active","--json"]`。

## 配置(`fetch-usage.py` 顶部 `CONFIG`)

- `plan`: 卡片右上角 badge 文字(随意填,比如你的套餐名)。
- `metric`: `cost`(美元)或 `tokens`(令牌,单位 Mtok)。
- `cost_limit` / `token_limit`: 进度条上限(预警线),按你的体感调;
  进度条 = 当前 5 小时窗口用量 / 上限,`endTime` 即窗口重置时间(底部倒计时)。
- `stats_limits`: 日 / 周 / 月的"参考额度"(非官方),用于算剩余量和百分比——
  只是粗估,按你的实际用量调整。
- **Codex(ChatGPT 侧)**:ccusage 也支持 OpenAI Codex CLI 的本地日志。
  跑 `npx ccusage@latest --help` 看 Codex 对应的子命令/参数,填进 `chatgpt.command`。
  不用的话留空,卡片会显示「未配置」。
- `NPX`: `npx` 的绝对路径(Homebrew 默认 `/opt/homebrew/bin/npx`)。
  node 装在别处的话,用 `which npx` 查到后改这里。

## 换别的命令

任何输出 JSON 的本地命令都行:把 `command` 换掉,`parser` 设为 `paths`,
再用点号路径告诉它从哪取值,例如:

```python
"command": ["my-tool", "--json"],
"parser": "paths",
"paths": {"used": "data.used", "limit": "data.limit", "reset": "data.resets_at"},
"unit": "msgs",
```

## 排错

- 一直「读取中…」或卡片报「找不到命令」:Übersicht 的 PATH 没有 node/npx。
  `index.jsx` 已用 `/bin/zsh -lc` 登录 shell 来加载 PATH;若你的 node 来自 nvm/其他,
  确认登录 shell 里 `which npx` 有结果,或在 `command` 里写绝对路径。
- 「命令超时」:首次 npx 下载慢,等一轮或全局安装 ccusage。
- 想直接看脚本输出:
  ```bash
  python3 ~/Library/Application\ Support/Übersicht/widgets/ai-usage.widget/fetch-usage.py
  ```

## 许可证

[Apache-2.0](LICENSE)
