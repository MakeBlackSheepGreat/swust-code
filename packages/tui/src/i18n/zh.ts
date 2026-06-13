/**
 * 简体中文翻译字典
 *
 * 缺失的 key 会在运行时自动回退到英文 (en.ts)。
 * TypeScript 会确保这里使用的 key 必须是 en.ts 中定义的有效 key。
 */

import type { Dictionary } from "./en"

const zh: Dictionary = {
  // 语言名称
  "language.zh": "简体中文",
  "language.zht": "繁體中文",
  "language.auto": "自动（跟随系统）",

  // 输入区
  "tui.prompt.placeholder": "输入消息或 / 查看命令...",
  "tui.prompt.hint.tab": "Tab 切换智能体",
  "tui.prompt.hint.enter": "Enter 发送",
  "tui.prompt.hint.shiftEnter": "Shift+Enter 换行",

  // 命令面板
  "tui.command.session.new.title": "新建会话",
  "tui.command.session.new.description": "开始新的对话",
  "tui.command.session.list.title": "会话列表",
  "tui.command.session.list.description": "浏览并恢复历史会话",
  "tui.command.config.title": "设置",
  "tui.command.config.description": "配置 SWUST Code",
  "tui.command.help.title": "帮助",
  "tui.command.help.description": "查看快捷键",
  "tui.command.language.title": "语言",
  "tui.command.language.description": "切换显示语言",
  "tui.command.memory.title": "记忆",
  "tui.command.memory.description": "搜索持久化记忆",
  "tui.command.goal.title": "设定目标",
  "tui.command.goal.description": "设定自治目标",
  "tui.command.dream.title": "Dream 知识提炼",
  "tui.command.dream.description": "整合项目记忆",
  "tui.command.distill.title": "Distill 技能发现",
  "tui.command.distill.description": "发现可复用工作流",

  // 对话框
  "tui.dialog.language.title": "选择语言",
  "tui.dialog.confirm.yes": "是",
  "tui.dialog.confirm.no": "否",
  "tui.dialog.confirm.cancel": "取消",

  // 提示消息
  "tui.toast.session.created": "新会话已创建",
  "tui.toast.session.deleted": "会话已删除",
  "tui.toast.memory.searching": "正在搜索记忆...",
  "tui.toast.memory.noResults": "未找到相关记忆",
  "tui.toast.goal.set": "目标已设定：{{condition}}",
  "tui.toast.goal.cleared": "目标已清除",

  // 会话 UI
  "tui.session.badge.running": "运行中",
  "tui.session.badge.idle": "空闲",
  "tui.session.badge.error": "错误",
  "tui.session.badge.goal": "目标：{{condition}}",

  // 提示（首页展示）
  "tui.tip.1": "使用 /memory 搜索持久化的项目知识",
  "tui.tip.2": "用 /goal 设定目标，让智能体自主工作",
  "tui.tip.3": "运行 /dream 整合智能体学到的知识",
  "tui.tip.4": "按 Tab 切换 build 和 plan 智能体",
  "tui.tip.5": "记忆文件保存在 .swust-code/memory/ 中，跨会话持久化",
  "tui.tip.6": "用 /distill 发现重复工作流并打包为可复用技能",
  "tui.tip.7": "智能体通过 MEMORY.md 记住项目上下文",
  "tui.tip.8": "斜杠命令：/help /memory /goal /dream /distill /status",

  // CLI 输出
  "cli.dream.starting": "启动 Dream：记忆整合...",
  "cli.dream.complete": "Dream 完成",
  "cli.distill.starting": "启动 Distill：技能发现...",
  "cli.distill.complete": "Distill 完成",
  "cli.memory.searching": "搜索记忆：{{query}}",
  "cli.goal.set": "目标已设定：{{condition}}",
  "cli.goal.cleared": "目标已清除",
}

export default zh
