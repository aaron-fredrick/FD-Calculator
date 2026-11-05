import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'FD Cal',
  description: 'Documentation for FD Cal — fixed-deposit planning, strategies and the shared calculation engine.',
  base: '/FD-Calculator/docs/',
  outDir: '../site/docs',
  lastUpdated: true,
  cleanUrls: false,

  themeConfig: {
    siteTitle: 'FD Cal',
    nav: [
      { text: 'Overview', link: '/' },
      { text: 'Strategies', link: '/STRATEGIES' },
      { text: 'Architecture', link: '/reference/CODEBASE' },
      { text: 'Open app', link: 'https://aaron-fredrick.github.io/FD-Calculator/web/' },
    ],

    sidebar: [
      {
        text: 'Start here',
        collapsed: false,
        items: [
          { text: 'Documentation home', link: '/' },
          { text: 'Project overview', link: '/overview' },
          { text: 'Getting started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'User guide',
        collapsed: false,
        items: [
          { text: 'Issues and support', link: '/ISSUES' },
        ],
      },
      {
        text: 'Strategies',
        collapsed: false,
        items: [
          { text: 'Strategy overview', link: '/STRATEGIES' },
          { text: 'GSS technical reference', link: '/strategies/GSS' },
        ],
      },
      {
        text: 'Architecture',
        collapsed: true,
        items: [
          { text: 'Codebase map', link: '/reference/CODEBASE' },
          { text: 'Migration plan', link: '/MIGRATION_PLAN' },
        ],
      },
      {
        text: 'Tools and libraries',
        collapsed: true,
        items: [
          { text: 'FD option management', link: '/reference/CODEBASE#fd-option-manager' },
          { text: 'Shared modules', link: '/reference/CODEBASE#shared-modules' },
        ],
      },
      {
        text: 'Contributing',
        collapsed: true,
        items: [
          { text: 'Contributor guide', link: '/guide/contributing' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: 'On this page',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/aaron-fredrick/FD-Calculator/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/aaron-fredrick/FD-Calculator' },
    ],

    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },

    footer: {
      message: 'FD Cal documentation. Verify bank-specific terms independently.',
      copyright: 'Open-source project documentation',
    },
  },
})
