# prd-clarify — 需求下达 Skill

让产品经理在提需求时，由 AI 逐轮追问、把业务边界和边界情况列清楚，并静默核对代码现状，最终在仓库根目录 `prd/` 下生成一份开发可直接执行的 PRD。

- 面向不懂技术的产品经理：只问业务问题，技术问题 AI 自己查代码
- 每轮最多 3 个问题，带例子、选项和推荐答案
- 每个维度必须落到「已确认 / 不适用 / 待定」，不允许静默跳过
- PRD 有状态门槛：只有业务待定项为 0 时才是「可开发」

采用 [Agent Skills](https://agentskills.io) 通用格式（`SKILL.md`），Claude Code、Codex 等支持该格式的工具都能直接使用。

## 安装

在你的项目仓库根目录执行：

```bash
git clone --depth 1 https://github.com/xxy757/prd-clarify-skill.git /tmp/prd-clarify-skill
```

然后按所用工具复制到对应目录：

| 工具 | 项目级（只在这个仓库生效） | 个人级（所有项目生效） |
|---|---|---|
| Claude Code | `.claude/skills/prd-clarify/` | `~/.claude/skills/prd-clarify/` |
| Codex | `.agents/skills/prd-clarify/` | `~/.agents/skills/prd-clarify/` |

```bash
# Claude Code（项目级）
mkdir -p .claude/skills && cp -r /tmp/prd-clarify-skill/prd-clarify .claude/skills/

# Codex（项目级）
mkdir -p .agents/skills && cp -r /tmp/prd-clarify-skill/prd-clarify .agents/skills/
```

安装后重启工具。

**其他不支持 Skill 的 AI 工具：** 把 `prd-clarify/` 文件夹放进仓库，对 AI 说"请阅读 `prd-clarify/SKILL.md` 并按它的流程帮我写需求"即可。

## 使用

在项目仓库里打开 AI 工具，直接说需求即可触发，例如：

> 我想加一个功能：员工请假后，系统自动提醒他的主管审批。

也可以显式调用：Claude Code 输入 `/prd-clarify`，Codex 输入 `$prd-clarify`。

生成的文件位于 `prd/YYYY-MM-DD-<短名>.md`。

## 文件结构

```
prd-clarify/
├── SKILL.md                    # 主流程与铁律
└── references/
    ├── question-bank.md        # 澄清维度清单（A～G 七组）
    ├── tech-probe.md           # 静默技术调研方法
    └── prd-template.md         # PRD 模板与完整度自检
```
