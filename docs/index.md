---
layout: home

hero:
  name: FD Cal
  text: Fixed-deposit planning, made transparent.
  tagline: Understand the calculation engine, compare planning strategies, and follow how a simulation reaches its result.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Explore strategies
      link: /STRATEGIES

features:
  - title: One calculation engine
    details: The CLI and browser application share the same financial models, simulation lifecycle and strategy implementations.
  - title: Understand each strategy
    details: Compare Greedy, Absolute R+, GSS and Absolute R by their scoped decision process, search limits and optimality guarantees.
  - title: Trace the architecture
    details: Follow the boundaries between simulation, FD option management, strategies, reporting and runtime adapters.
---

<div class="home-callout">
  <strong>Using FD Cal?</strong>
  <span>Open the <a href="https://aaron-fredrick.github.io/FD-Calculator/web/">web application</a> to configure and run a scenario.</span>
</div>

<style>
.home-callout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.8rem;
  align-items: center;
  margin: 2rem auto 0;
  padding: 1rem 1.2rem;
  max-width: 720px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}
.home-callout strong {
  color: var(--vp-c-text-1);
}
</style>
