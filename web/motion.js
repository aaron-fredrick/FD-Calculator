export const MOTION_TIMING = Object.freeze({
  enter: 350,
  exit: 280,
  stagger: 30
});

let strategyTransitionSequence = 0;

export function animateRemoval(button, card, onComplete) {
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  card.classList.add("is-removing");
  card.setAttribute("aria-busy", "true");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onComplete();
  };

  card.addEventListener("animationend", event => {
    if (event.target === card && event.animationName === "entry-remove") finish();
  });
  setTimeout(finish, MOTION_TIMING.exit + 70);
}

export function animateNewRows(container, selector, existingIds) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  let staggerIndex = 0;
  container.querySelectorAll(selector).forEach(card => {
    if (existingIds.has(card.dataset.id)) return;

    card.style.setProperty("--motion-delay", (staggerIndex++ * MOTION_TIMING.stagger) + "ms");
    card.classList.add("is-entering");
    card.addEventListener("animationend", event => {
      if (event.target !== card || event.animationName !== "fd-row-enter") return;
      card.classList.remove("is-entering");
      card.style.removeProperty("--motion-delay");
    }, { once: true });
  });
}

export function animateEntrance(element) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") return;

  const animation = element.animate(
    [
      { opacity: 0, transform: "translateY(10px) scale(.99)", filter: "blur(2px)" },
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" }
    ],
    { duration: MOTION_TIMING.enter, easing: "cubic-bezier(.16,1,.3,1)" }
  );
  animation.onfinish = () => animation.cancel();
}

export function transitionStrategySettings(activeId) {
  const panelIds = ["greedy-settings", "gss-settings", "gaml-settings-panel"];
  const panels = panelIds.map(id => document.getElementById(id));
  const active = document.getElementById(activeId);
  const sequence = ++strategyTransitionSequence;

  panels.forEach(panel => panel.getAnimations?.().forEach(animation => animation.cancel()));

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof active.animate !== "function") {
    panels.forEach(panel => {
      const selected = panel === active;
      panel.hidden = !selected;
      panel.inert = !selected;
      if (selected) panel.removeAttribute("aria-hidden");
      else panel.setAttribute("aria-hidden", "true");
    });
    return;
  }

  active.hidden = false;
  active.inert = false;
  active.removeAttribute("aria-hidden");

  panels.filter(panel => panel !== active && !panel.hidden).forEach(panel => {
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");

    const animation = panel.animate(
      [
        { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: "translateY(-5px) scale(.99)", filter: "blur(1px)" }
      ],
      { duration: MOTION_TIMING.exit, easing: "ease-in", fill: "both" }
    );
    animation.onfinish = () => {
      if (sequence === strategyTransitionSequence && panel !== active) {
        panel.hidden = true;
        animation.cancel();
      }
    };
  });

  panels.filter(panel => panel !== active && panel.hidden).forEach(panel => {
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
  });

  const entering = active.animate(
    [
      { opacity: 0, transform: "translateY(7px) scale(.985)", filter: "blur(1.5px)" },
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" }
    ],
    { duration: MOTION_TIMING.enter, easing: "cubic-bezier(.16,1,.3,1)" }
  );
  entering.onfinish = () => entering.cancel();
}
