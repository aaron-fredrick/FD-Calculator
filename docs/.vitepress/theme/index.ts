import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import BenchmarkChart from './components/BenchmarkChart.vue'
import BenchmarkHeatmap from './components/BenchmarkHeatmap.vue'
import DocsAnalyticsConsent from './components/DocsAnalyticsConsent.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => h(DocsAnalyticsConsent),
  }),
  enhanceApp({ app }) {
    app.component('BenchmarkChart', BenchmarkChart)
    app.component('BenchmarkHeatmap', BenchmarkHeatmap)
  },
}
