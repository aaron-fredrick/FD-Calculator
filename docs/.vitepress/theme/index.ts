import DefaultTheme from 'vitepress/theme'
import BenchmarkChart from './components/BenchmarkChart.vue'
import BenchmarkHeatmap from './components/BenchmarkHeatmap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BenchmarkChart', BenchmarkChart)
    app.component('BenchmarkHeatmap', BenchmarkHeatmap)
  },
}
