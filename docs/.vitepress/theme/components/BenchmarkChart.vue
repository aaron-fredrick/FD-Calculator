<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  category: { type: String, required: true },
  title: { type: String, default: '' },
  xLabel: { type: String, default: 'Scenario factor' },
  groupKey: { type: String, default: 'category' },
  xKey: { type: String, default: 'value' },
  seriesKey: { type: String, default: 'strategy' },
  seriesName: { type: String, default: 'Absolute R+' },
  chartType: { type: String, default: 'line' },
  xTickStep: { type: Number, default: null },
  metrics: {
    type: Array,
    default: () => [
      { key: 'net_interest', label: 'Net interest (LKR)', format: 'currency' },
      { key: 'delta_pct_vs_greedy', label: 'Difference vs Greedy (%)', format: 'percent' },
      { key: 'duration_ms', label: 'Runtime (ms)', format: 'number' },
      { key: 'bookings', label: 'Bookings', format: 'number' },
      { key: 'validity_pct', label: 'Simulation validity (%)', format: 'percent' },
      { key: 'outflow_unpaid', label: 'Unpaid outflows (LKR)', format: 'currency' }
    ]
  }
})

const metricKey = ref(props.metrics[0]?.key ?? 'net_interest')
const activePoint = ref(null)
const hiddenSeries = ref(new Set())
const palette = ['#56b4e9', '#55c99a', '#bd93f9', '#e69f00']
const rows = computed(() => props.rows.filter(row => row[props.groupKey] === props.category))
const metric = computed(() => props.metrics.find(item => item.key === metricKey.value) ?? props.metrics[0])
const seriesNames = computed(() => [...new Set(rows.value.map(row => row[props.seriesKey] ?? props.seriesName))])
const xValues = computed(() => {
  const values = [...new Set(rows.value.map(row => row[props.xKey]))]
  return values.sort((a, b) => {
    const an = Number(a), bn = Number(b)
    return Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a).localeCompare(String(b))
  })
})
const numericX = computed(() => xValues.value.length > 1 && xValues.value.every(value => Number.isFinite(Number(value))))
const validNumber = value => value !== null && value !== undefined && Number.isFinite(Number(value))
const validValues = computed(() => rows.value.map(row => row[metric.value?.key]).filter(validNumber).map(Number))
const yMax = computed(() => Math.max(1, ...validValues.value) * 1.12)
const yMin = computed(() => Math.min(0, ...validValues.value))
const left = 92, right = 960, top = 38, bottom = 374
const xTickValues = computed(() => xValues.value.filter(value =>
  props.xTickStep === null || !numericX.value || Number(value) % props.xTickStep === 0
))
const xPos = value => {
  if (xValues.value.length <= 1) return (left + right) / 2
  if (numericX.value) {
    const min = Number(xValues.value[0]), max = Number(xValues.value.at(-1))
    return left + (Number(value) - min) * (right - left) / (max - min || 1)
  }
  if (props.chartType === 'bar') {
    return left + (xValues.value.indexOf(value) + 0.5) * (right - left) / xValues.value.length
  }
  return left + xValues.value.indexOf(value) * (right - left) / (xValues.value.length - 1)
}
const yPos = value => bottom - (Number(value) - yMin.value) * (bottom - top) / (yMax.value - yMin.value || 1)
const series = computed(() => seriesNames.value.map((name, index) => {
  const pointRows = rows.value
    .filter(row => (row[props.seriesKey] ?? props.seriesName) === name)
    .sort((a, b) => xValues.value.indexOf(a[props.xKey]) - xValues.value.indexOf(b[props.xKey]))
  const points = pointRows.filter(row => validNumber(row[metric.value?.key]))
  const segments = []
  let segment = []
  for (const xValue of xValues.value) {
    const point = pointRows.find(row => row[props.xKey] === xValue)
    if (point && validNumber(point[metric.value?.key])) segment.push(point)
    else if (segment.length) {
      segments.push(segment)
      segment = []
    }
  }
  if (segment.length) segments.push(segment)
  return { name, color: palette[index % palette.length], index, points, segments }
}))
const barWidth = computed(() => Math.min(22, (right - left) / Math.max(1, xValues.value.length) / (seriesNames.value.length + 1)))
const format = value => {
  if (!validNumber(value)) return '—'
  if (metric.value?.format === 'currency') return 'LKR ' + Number(value).toLocaleString('en-LK', { maximumFractionDigits: 2 })
  if (metric.value?.format === 'percent') return Number(value).toFixed(2) + '%'
  return Number(value).toLocaleString('en-LK', { maximumFractionDigits: 2 })
}
const categoryLabels = {
  none: 'No outflow',
  strict_50k_at_6m: 'LKR 50k at 6m',
  strict_staggered_20k: 'LKR 20k at 6/12/18m',
  standard_only: 'Standard-only',
  eligible: 'eFD eligible',
  monthly_10k: 'LKR 10k monthly',
  lump_100k: 'LKR 100k at 6m'
}
const xFormat = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-LK') : (categoryLabels[value] ?? String(value))
const yTicks = computed(() => Array.from({ length: 5 }, (_, index) => yMin.value + (yMax.value - yMin.value) * index / 4))
function toggle(name) {
  const next = new Set(hiddenSeries.value)
  next.has(name) ? next.delete(name) : next.add(name)
  hiddenSeries.value = next
}
</script>

<template>
  <section class="benchmark-chart" :aria-label="title || category">
    <header class="chart-header">
      <div>
        <h3 v-if="title">{{ title }}</h3>
        <p>Hover a point for exact values. Select a metric or toggle a strategy.</p>
      </div>
      <label class="metric-picker">
        <span>Metric</span>
        <select v-model="metricKey">
          <option v-for="item in metrics" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </label>
    </header>
    <div class="chart-legend" role="group" aria-label="Toggle chart series">
      <button
        v-for="item in series"
        :key="item.name"
        type="button"
        :aria-pressed="!hiddenSeries.has(item.name)"
        :class="{ muted: hiddenSeries.has(item.name) }"
        @click="toggle(item.name)"
      ><i :style="{ background: item.color }"></i>{{ item.name }}</button>
    </div>
    <div class="chart-plot">
      <svg viewBox="0 0 1000 440" role="img" :aria-label="(title || category) + ', ' + metric.label">
        <rect x="72" y="18" width="904" height="378" rx="10" class="plot-surface" />
        <g v-for="tick in yTicks" :key="tick">
          <line :x1="left" :x2="right" :y1="yPos(tick)" :y2="yPos(tick)" class="grid-line" />
          <text :x="left - 12" :y="yPos(tick) + 4" text-anchor="end" class="axis-text">{{ format(tick) }}</text>
        </g>
        <g v-for="value in xValues" :key="String(value)">
          <line :x1="xPos(value)" :x2="xPos(value)" :y1="bottom" :y2="bottom + 6" class="axis-line" />
          <text v-if="xTickValues.includes(value)" :x="xPos(value)" :y="bottom + 28" text-anchor="middle" class="axis-text">{{ xFormat(value) }}</text>
        </g>
        <g v-for="item in series" :key="item.name" v-show="!hiddenSeries.has(item.name)">
          <g v-if="chartType === 'bar'">
            <rect
              v-for="point in item.points" :key="String(point[xKey]) + item.name"
              :x="xPos(point[xKey]) - (barWidth * series.length) / 2 + item.index * barWidth"
              :y="Math.min(yPos(point[metric.key]), yPos(0))" :width="barWidth * .86"
              :height="Math.abs(yPos(point[metric.key]) - yPos(0))"
              :fill="item.color" class="data-bar" :class="{ 'invalid-point': point.valid === false }"
              tabindex="0" role="button"
              @mouseenter="activePoint = { row: point, name: item.name, color: item.color }"
              @focus="activePoint = { row: point, name: item.name, color: item.color }"
              @mouseleave="activePoint = null" @blur="activePoint = null"
            />
          </g>
          <g v-else>
          <polyline
            v-for="(segment, segmentIndex) in item.segments"
            :key="item.name + '-segment-' + segmentIndex"
            :points="segment.map(point => xPos(point[xKey]) + ',' + yPos(point[metric.key])).join(' ')"
            fill="none" :stroke="item.color" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
          />
          <g v-for="point in item.points" :key="String(point[xKey]) + item.name">
            <circle
              :cx="xPos(point[xKey])" :cy="yPos(point[metric.key])" r="6"
              :fill="item.color" class="data-point" :class="{ 'invalid-point': point.valid === false }"
              tabindex="0" role="button"
              @mouseenter="activePoint = { row: point, name: item.name, color: item.color }"
              @focus="activePoint = { row: point, name: item.name, color: item.color }"
              @mouseleave="activePoint = null"
              @blur="activePoint = null"
            />
          </g>
          </g>
        </g>
        <text x="516" y="432" text-anchor="middle" class="axis-title">{{ xLabel }}</text>
      </svg>
      <aside v-if="activePoint" class="chart-tooltip" aria-live="polite">
        <strong><i :style="{ background: activePoint.color }"></i>{{ activePoint.name }}</strong>
        <span>{{ xLabel }}: {{ xFormat(activePoint.row[xKey]) }}</span>
        <b>{{ metric.label }}: {{ format(activePoint.row[metric.key]) }}</b>
        <span v-if="activePoint.row.valid !== undefined">Simulation validity: {{ activePoint.row.valid ? 'Valid' : 'Invalid' }}</span>
        <span v-if="activePoint.row.outflow_unpaid > 0">Unpaid obligation: {{ format(activePoint.row.outflow_unpaid) }}</span>
        <span v-if="activePoint.row.strategy_error" class="chart-error">{{ activePoint.row.strategy_error }}</span>
        <span v-if="activePoint.row.delta_pct_vs_greedy !== null && Number.isFinite(Number(activePoint.row.delta_pct_vs_greedy))">vs Greedy: {{ Number(activePoint.row.delta_pct_vs_greedy).toFixed(2) }}%</span>
        <span v-if="activePoint.row.outflow_scheduled_total > 0 && activePoint.row.outflow_unpaid === null">Scheduled obligations: {{ format(activePoint.row.outflow_scheduled_total) }} (payment totals unavailable)</span>
        <span v-if="activePoint.row.duration_ms !== undefined">Runtime: {{ Number(activePoint.row.duration_ms).toLocaleString('en-LK') }} ms</span>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.benchmark-chart { margin: 1.5rem 0 2rem; padding: 1rem; border: 1px solid var(--vp-c-border); border-radius: 12px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); }
.chart-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.chart-header h3 { margin: 0; font-size: 1.05rem; font-weight: 650; }
.chart-header p { margin: .25rem 0 0; color: var(--vp-c-text-2); font-size: .82rem; }
.metric-picker { display: grid; gap: .25rem; color: var(--vp-c-text-2); font-size: .75rem; }
.metric-picker select { max-width: 230px; border: 1px solid var(--vp-c-border); border-radius: 7px; padding: .4rem .55rem; color: var(--vp-c-text-1); background: var(--vp-c-bg); }
.chart-legend { display: flex; flex-wrap: wrap; gap: .5rem 1rem; margin: .9rem 0 .25rem; }
.chart-legend button { display: inline-flex; align-items: center; gap: .4rem; border: 0; padding: .2rem 0; color: var(--vp-c-text-1); background: transparent; font: inherit; font-size: .8rem; cursor: pointer; }
.chart-legend button.muted { opacity: .38; }
.chart-legend i, .chart-tooltip i { width: .65rem; height: .65rem; display: inline-block; border-radius: 50%; }
.chart-plot { position: relative; width: 100%; }
.chart-plot svg { display: block; width: 100%; height: auto; overflow: visible; }
.plot-surface { fill: var(--vp-c-bg-alt); stroke: var(--vp-c-border); }
.grid-line { stroke: var(--vp-c-divider); stroke-dasharray: 3 5; }
.axis-line { stroke: var(--vp-c-text-3); }
.axis-text { fill: var(--vp-c-text-2); font-size: 12px; }
.axis-title { fill: var(--vp-c-text-2); font-size: 13px; }
.data-point, .data-bar { stroke: var(--vp-c-bg-alt); stroke-width: 2; cursor: crosshair; }
.data-point:focus { outline: none; stroke: var(--vp-c-text-1); stroke-width: 3; }
.invalid-point { stroke: #d64b4b; stroke-width: 3; }
.chart-tooltip { position: absolute; top: .5rem; right: .5rem; z-index: 2; display: grid; gap: .25rem; min-width: 190px; max-width: min(260px, 55%); padding: .65rem .75rem; border: 1px solid var(--vp-c-border); border-radius: 8px; background: var(--vp-c-bg); box-shadow: var(--vp-shadow-3); font-size: .78rem; }
.chart-tooltip strong { display: flex; align-items: center; gap: .4rem; }
.chart-tooltip span { color: var(--vp-c-text-2); }
.chart-tooltip .chart-error { color: #d64b4b; overflow-wrap: anywhere; }
@media (max-width: 640px) { .benchmark-chart { padding: .7rem; } .axis-text { font-size: 16px; } .chart-tooltip { top: auto; bottom: 2.5rem; max-width: 65%; } }
</style>
