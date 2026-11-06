<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ rows: { type: Array, required: true } })
const strategy = ref('Greedy')
const metric = ref('net_interest')
const selected = ref(null)
const matrix = computed(() => props.rows.filter(row => row.category === 'capital_horizon' && row.strategy === strategy.value))
const capitals = computed(() => [...new Set(matrix.value.map(row => row.capital))].sort((a,b) => a-b))
const horizons = computed(() => [...new Set(matrix.value.map(row => row.months))].sort((a,b) => a-b))
const values = computed(() => matrix.value.map(row => Number(row[metric.value])).filter(Number.isFinite))
const min = computed(() => Math.min(...values.value))
const max = computed(() => Math.max(...values.value))
const lookup = (capital, months) => matrix.value.find(row => row.capital === capital && row.months === months)
const alpha = value => {
  const span = max.value - min.value || 1
  return 0.12 + 0.68 * (Number(value) - min.value) / span
}
const format = value => metric.value === 'delta_pct_vs_greedy'
  ? Number(value).toFixed(2) + '%'
  : 'LKR ' + Number(value).toLocaleString('en-LK', { maximumFractionDigits: 2 })
</script>

<template>
  <section class="benchmark-heatmap">
    <header>
      <div><strong>Capital × investment horizon</strong><p>Each cell is a measured simulation result, not an interpolated estimate.</p></div>
      <div class="selectors">
        <label>Strategy <select v-model="strategy"><option>Greedy</option><option>Absolute R+</option><option>GSS</option></select></label>
        <label>Metric <select v-model="metric"><option value="net_interest">Net interest (LKR)</option><option value="delta_pct_vs_greedy">Difference vs Greedy (%)</option></select></label>
      </div>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Capital ↓ / Horizon →</th><th v-for="months in horizons" :key="months">{{ months }} months</th></tr></thead>
        <tbody>
          <tr v-for="capital in capitals" :key="capital">
            <th>LKR {{ Number(capital).toLocaleString('en-LK') }}</th>
            <td v-for="months in horizons" :key="months">
              <button v-if="lookup(capital, months)" type="button"
                :style="{ backgroundColor: 'color-mix(in srgb, var(--vp-c-brand-1) ' + (alpha(lookup(capital, months)[metric]) * 100) + '%, var(--vp-c-bg-alt))' }"
                :aria-pressed="selected === lookup(capital, months)"
                @click="selected = lookup(capital, months)"
                @mouseenter="selected = lookup(capital, months)">
                {{ format(lookup(capital, months)[metric]) }}
              </button>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="selected" class="cell-detail">
      **{{ strategy }}** · LKR {{ Number(selected.capital).toLocaleString('en-LK') }} · {{ selected.months }} months:
      {{ format(selected[metric]) }}. Runtime {{ Number(selected.duration_ms).toLocaleString('en-LK') }} ms; {{ selected.bookings }} bookings.
    </p>
  </section>
</template>

<style scoped>
.benchmark-heatmap { margin: 1.5rem 0 2rem; padding: 1rem; border: 1px solid var(--vp-c-border); border-radius: 12px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); }
header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
header strong { font-size: 1rem; }
header p { margin: .2rem 0 0; color: var(--vp-c-text-2); font-size: .8rem; }
.selectors { display: flex; gap: .6rem; flex-wrap: wrap; }
label { display: grid; gap: .2rem; color: var(--vp-c-text-2); font-size: .72rem; }
select { border: 1px solid var(--vp-c-border); border-radius: 7px; padding: .4rem; color: var(--vp-c-text-1); background: var(--vp-c-bg); }
.table-wrap { overflow-x: auto; margin-top: 1rem; }
table { width: 100%; min-width: 440px; border-collapse: separate; border-spacing: 5px; font-size: .82rem; }
th { padding: .55rem; text-align: left; color: var(--vp-c-text-2); font-weight: 600; }
td { min-width: 115px; }
td button { width: 100%; min-height: 48px; border: 1px solid var(--vp-c-border); border-radius: 7px; color: var(--vp-c-text-1); font: inherit; font-weight: 650; cursor: pointer; }
td button[aria-pressed="true"] { outline: 2px solid var(--vp-c-brand-1); outline-offset: 1px; }
.cell-detail { margin: .8rem 0 0; padding: .7rem; border-radius: 8px; background: var(--vp-c-bg-alt); color: var(--vp-c-text-2); font-size: .82rem; }
</style>
