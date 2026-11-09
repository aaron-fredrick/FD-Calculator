<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const STORAGE_KEY = 'fd-cal:privacy-preferences:v1'
const GTM_ID = 'GTM-TNC567R4'
const CLARITY_ID = 'zb1y50hjaw'
const route = useRoute()
const visible = ref(false)
const savedChoice = ref<boolean | null>(null)
const analytics = ref(false)
const error = ref('')
let gtmLoaded = false
let clarityLoaded = false
let active = false

const choiceLabel = computed(() => savedChoice.value === true ? 'Analytics enabled' : savedChoice.value === false ? 'Analytics rejected' : 'No analytics choice saved')

function readChoice(): boolean | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return value?.version === 1 && typeof value.analytics === 'boolean' ? value.analytics : null
  } catch {
    return null
  }
}

function initialiseConsentQueue() {
  const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] } }
  w.dataLayer = w.dataLayer || []
  w.gtag = w.gtag || function (...args: unknown[]) { w.dataLayer!.push(args) }
  w.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  w.clarity = w.clarity || Object.assign(function (...args: unknown[]) {
    w.clarity!.q = w.clarity!.q || []
    w.clarity!.q!.push(args)
  }, { q: [] })
}

function trackPageView() {
  if (!active) return
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void }
  w.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_path: window.location.pathname,
  })
}

function applyConsent(allow: boolean) {
  initialiseConsentQueue()
  const w = window as typeof window & {
    gtag?: (...args: unknown[]) => void
    clarity?: (...args: unknown[]) => void
  }
  w.gtag?.('consent', 'update', {
    analytics_storage: allow ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  active = allow
  w.clarity?.('consentv2', {
    analytics_Storage: allow ? 'granted' : 'denied',
    ad_Storage: 'denied',
  })
  if (!allow) return

  if (!gtmLoaded) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`
    script.dataset.fdCalAnalytics = 'true'
    document.head.append(script)
    gtmLoaded = true
  }
  if (!clarityLoaded) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`
    script.dataset.fdCalAnalytics = 'true'
    document.head.append(script)
    clarityLoaded = true
  }
  trackPageView()
}

function save(allow: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, necessary: true, analytics: allow }))
  } catch {
    error.value = 'Your preference could not be saved. Check browser storage permissions and try again.'
    return
  }
  savedChoice.value = allow
  analytics.value = allow
  applyConsent(allow)
  visible.value = false
  error.value = ''
}

function syncFromStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return
  const choice = readChoice()
  savedChoice.value = choice
  analytics.value = choice === true
  if (choice === null) {
    active = false
    visible.value = true
    applyConsent(false)
  } else {
    applyConsent(choice)
  }
}

onMounted(() => {
  initialiseConsentQueue()
  // Clarity's default input masking is reinforced for the local documentation search UI.
  document.querySelector('.VPNavBarSearch')?.classList.add('clarity-mask')
  const choice = readChoice()
  savedChoice.value = choice
  analytics.value = choice === true
  visible.value = choice === null
  if (choice === true) applyConsent(true)
  window.addEventListener('storage', syncFromStorage)
})

onUnmounted(() => window.removeEventListener('storage', syncFromStorage))

watch(() => route.path, () => trackPageView())
</script>

<template>
  <div class="docs-privacy-controls" aria-live="polite">
    <button class="docs-privacy-settings" type="button" @click="visible = !visible">
      Cookie preferences
    </button>

    <section v-if="visible" class="docs-privacy-panel" aria-labelledby="docs-privacy-title">
      <div class="docs-privacy-copy">
        <strong id="docs-privacy-title">Optional analytics</strong>
        <p>FD Cal uses Google Analytics and Microsoft Clarity only if you allow analytics. Necessary browser storage remains enabled. Advertising storage stays denied.</p>
        <p class="docs-privacy-status">{{ choiceLabel }}</p>
        <p v-if="error" class="docs-privacy-error" role="alert">{{ error }}</p>
      </div>
      <label class="docs-privacy-toggle">
        <input v-model="analytics" type="checkbox">
        Allow optional analytics
      </label>
      <div class="docs-privacy-actions">
        <button type="button" @click="save(false)">Reject</button>
        <button type="button" @click="save(analytics)">Save choice</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.docs-privacy-controls { position: fixed; z-index: 40; right: 18px; bottom: 16px; font-size: 13px; color: var(--vp-c-text-1); }
.docs-privacy-settings, .docs-privacy-actions button { min-height: 38px; padding: 8px 13px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: inherit; font: inherit; cursor: pointer; }
.docs-privacy-settings { box-shadow: 0 2px 12px #0002; }
.docs-privacy-panel { display: grid; gap: 12px; width: min(440px, calc(100vw - 28px)); margin-bottom: 9px; padding: 16px 0; border-top: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); box-shadow: 0 4px 22px #0002; }
.docs-privacy-copy { padding: 0 16px; }
.docs-privacy-copy p { margin: 6px 0 0; color: var(--vp-c-text-2); line-height: 1.5; }
.docs-privacy-copy .docs-privacy-status { font-size: 11px; }
.docs-privacy-error { color: var(--vp-c-danger-1) !important; }
.docs-privacy-toggle { display: flex; align-items: center; gap: 9px; padding: 0 16px; }
.docs-privacy-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px; }
.docs-privacy-actions button:last-child { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: white; }
@media (max-width: 640px) { .docs-privacy-controls { right: 10px; bottom: 10px; } .docs-privacy-panel { width: calc(100vw - 20px); } }
</style>
