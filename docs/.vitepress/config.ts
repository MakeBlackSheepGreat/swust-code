import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'SWUST Code',
  description: '开源 AI 编程智能体 — 记得住、学得会、长得大',
  lang: 'zh-CN',
  base: '/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  locales: {
    root: {
      label: '中文',
      lang: 'zh-CN',
      title: 'SWUST Code',
      description: '开源 AI 编程智能体',
      themeConfig: {
        nav: [
          { text: '指南', link: '/guide/start' },
          { text: '功能', link: '/features/memory' },
          { text: 'API', link: '/api/tools' },
          { text: '开发', link: '/dev/architecture' },
          { text: '更新日志', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/MakeBlackSheepGreat/swust-code' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/guide/start' },
                { text: '安装', link: '/guide/install' },
                { text: '配置', link: '/guide/config' },
                { text: 'LLM 提供商', link: '/guide/providers' },
              ],
            },
          ],
          '/features/': [
            {
              text: '核心功能',
              items: [
                { text: '持久化记忆', link: '/features/memory' },
                { text: '目标驱动自治', link: '/features/goal' },
                { text: '自我进化', link: '/features/dream' },
                { text: '安全防护', link: '/features/security' },
                { text: '工作流引擎', link: '/features/workflow' },
                { text: '技能系统', link: '/features/skills' },
              ],
            },
          ],
          '/api/': [
            {
              text: 'API 参考',
              items: [
                { text: '工具参考', link: '/api/tools' },
                { text: 'CLI 命令', link: '/api/commands' },
                { text: '配置 Schema', link: '/api/config-schema' },
              ],
            },
          ],
          '/dev/': [
            {
              text: '开发者',
              items: [
                { text: '架构设计', link: '/dev/architecture' },
                { text: '贡献指南', link: '/dev/contributing' },
                { text: '插件开发', link: '/dev/plugin-dev' },
                { text: '技能开发', link: '/dev/skill-dev' },
              ],
            },
          ],
        },
        outline: { level: [2, 3] },
        lastUpdated: { text: '最后更新' },
        docFooter: { prev: '上一页', next: '下一页' },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: 'SWUST Code',
      description: 'Open-source AI coding agent',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/start' },
          { text: 'Features', link: '/en/features/memory' },
          { text: 'API', link: '/en/api/tools' },
          { text: 'Dev', link: '/en/dev/architecture' },
          { text: 'GitHub', link: 'https://github.com/MakeBlackSheepGreat/swust-code' },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Quick Start', link: '/en/guide/start' },
                { text: 'Installation', link: '/en/guide/install' },
                { text: 'Configuration', link: '/en/guide/config' },
                { text: 'LLM Providers', link: '/en/guide/providers' },
              ],
            },
          ],
          '/en/features/': [
            {
              text: 'Core Features',
              items: [
                { text: 'Persistent Memory', link: '/en/features/memory' },
                { text: 'Goal-Driven Autonomy', link: '/en/features/goal' },
                { text: 'Self-Improvement', link: '/en/features/dream' },
                { text: 'Security', link: '/en/features/security' },
                { text: 'Workflow Engine', link: '/en/features/workflow' },
                { text: 'Skills System', link: '/en/features/skills' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/MakeBlackSheepGreat/swust-code' },
    ],
    search: {
      provider: 'local',
    },
  },
})
