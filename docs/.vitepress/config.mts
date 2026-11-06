import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'FD Cal',
  description: 'Documentation for FD Cal — fixed-deposit planning, strategies and the shared calculation engine.',
  base: '/FD-Calculator/docs/',
  outDir: '../site/docs',
  lastUpdated: true,
  sitemap: {
    hostname: 'https://aaron-fredrick.github.io/FD-Calculator/docs/',
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#0b0e13' }],
    ['meta', { name: 'color-scheme', content: 'dark light' }],
    ['meta', { name: 'robots', content: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' }],
    ['meta', { name: 'author', content: 'FD Cal contributors' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'FD Cal' }],
    ['meta', { property: 'og:locale', content: 'en_LK' }],
    ['meta', { property: 'og:image', content: 'https://aaron-fredrick.github.io/FD-Calculator/og-image.svg' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:type', content: 'image/svg+xml' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://aaron-fredrick.github.io/FD-Calculator/og-image.svg' }],
  ],
  transformPageData(pageData) {
    const relativePath = pageData.relativePath.replace(/\\/g, '/');
    const route = relativePath === 'index.md'
      ? ''
      : relativePath.replace(/index\.md$/, '').replace(/\.md$/, '.html');
    const canonical = 'https://aaron-fredrick.github.io/FD-Calculator/docs/' + route;
    const description = pageData.frontmatter.description || 'FD Cal documentation for fixed-deposit planning, investment strategies, bank product data and the shared simulation engine.';
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:title', content: pageData.title + ' | FD Cal Documentation' }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { name: 'twitter:title', content: pageData.title + ' | FD Cal Documentation' }],
      ['meta', { name: 'twitter:description', content: description }],
    );
  },
  cleanUrls: false,
  appearance: true,

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
          {
            text: 'Scoped Range',
            collapsed: false,
            items: [
              { text: 'Greedy', link: '/strategies/GREEDY' },
              { text: 'GSS', link: '/strategies/GSS' },
              { text: 'Absolute R', link: '/strategies/ABSOLUTE' },
              { text: 'Absolute R+', link: '/strategies/ABSOLUTE-PLUS' },
              { text: 'Scoped benchmark', link: '/strategies/benchmarks#scoped-range' },
            ],
          },
          {
            text: 'Goal',
            collapsed: false,
            items: [
              { text: 'Goal status', link: '/strategies/benchmarks#goal' },
              { text: 'Rework plan', link: '/strategies/goal-mode-rework-plan' },
            ],
          },
        ],
      },
      {
        text: 'Architecture',
        collapsed: true,
        items: [
          { text: 'Simulation lifecycle', link: '/SIMULATION-LIFECYCLE' },
          { text: 'Simulation/strategy boundary plan', link: '/architecture/SIMULATION-STRATEGY-BOUNDARY-PLAN' },
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
