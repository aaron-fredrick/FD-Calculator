/**
 * Strategy-independent search drivers used by Absolute and GAML.
 * Pure Node/browser-compatible orchestration; financial transitions are injected.
 */
import { SEARCH_EPSILON, selectDiverseBeam } from "./search-primitives.js";

function makeNode(parent, transition, rootSignature) {
  return {
    parent, date: String(transition.date), action: transition.action ?? null,
    state: transition.state,
    root_signature: rootSignature ?? parent?.root_signature ?? null,
    depth: (parent?.depth ?? -1) + 1,
  };
}

function reconstructPath(node) {
  const path = [];
  for (let current = node; current && current.action !== null; current = current.parent) {
    path.push({ date: current.date, action: current.action });
  }
  return path.reverse();
}

function validateCommon(options) {
  for (const name of ["expand", "isTerminal", "getKey", "upperBound", "scoreTerminal"]) {
    if (typeof options[name] !== "function") throw new TypeError("Search requires a " + name + " callback.");
  }
  if (!options.initialState) throw new TypeError("Search requires initialState.");
}

/** Exhaustive depth-first branch-and-bound. */
export function runExhaustiveSearch(options) {
  validateCommon(options);
  const epsilon = Number(options.epsilon ?? SEARCH_EPSILON);
  const diagnostics = {
    expanded_states: 0, terminal_states: 0, bound_pruned: 0,
    memo_pruned: 0, invalid_states: 0, max_depth: 0,
  };
  let bestScore = Number(options.initialBestScore ?? -Infinity);
  let bestNode = null;
  const memo = new Map();
  const root = {
    parent: null, date: String(options.startDate ?? ""), action: null,
    state: options.initialState, root_signature: null, depth: -1,
  };

  function visit(node) {
    diagnostics.expanded_states++;
    diagnostics.max_depth = Math.max(diagnostics.max_depth, node.depth + 1);
    const state = node.state;
    if (options.isValid && !options.isValid(state)) {
      diagnostics.invalid_states++;
      return;
    }
    if (options.isTerminal(state)) {
      diagnostics.terminal_states++;
      const score = Number(options.scoreTerminal(state));
      if (Number.isFinite(score) && score > bestScore + epsilon) {
        bestScore = score;
        bestNode = node;
      }
      return;
    }
    const bound = Number(options.upperBound(state));
    if (!Number.isFinite(bound) || bound <= bestScore + epsilon) {
      diagnostics.bound_pruned++;
      return;
    }
    const key = String(options.getKey(state));
    const previousBound = memo.get(key);
    if (previousBound !== undefined && previousBound >= bound - epsilon) {
      diagnostics.memo_pruned++;
      return;
    }
    memo.set(key, bound);
    for (const transition of options.expand(state) || []) {
      const signature = node.depth < 0
        ? (transition.root_signature ?? options.rootSignature?.(transition) ?? null)
        : node.root_signature;
      visit(makeNode(node, transition, signature));
    }
  }

  visit(root);
  return { score: bestScore, path: bestNode ? reconstructPath(bestNode) : null, diagnostics };
}

/** Layered best-first beam search with state deduplication and root diversity. */
export function runBeamSearch(options) {
  validateCommon(options);
  const width = Number(options.beamWidth ?? 256);
  if (!Number.isInteger(width) || width < 1) throw new RangeError("beamWidth must be a positive integer.");
  const epsilon = Number(options.epsilon ?? SEARCH_EPSILON);
  const maxExpanded = options.maxExpanded == null ? Infinity : Number(options.maxExpanded);
  if (!(maxExpanded > 0)) throw new RangeError("maxExpanded must be positive.");

  const diagnostics = {
    expanded_states: 0, terminal_states: 0, bound_pruned: 0,
    beam_pruned: 0, duplicate_pruned: 0, invalid_states: 0,
    layers: 0, optimality_proven: true,
  };
  let bestScore = Number(options.initialBestScore ?? -Infinity);
  let bestNode = null;
  let sequence = 0;
  let frontier = [{
    parent: null, date: String(options.startDate ?? ""), action: null,
    state: options.initialState, root_signature: null, depth: -1,
    score: Number(options.upperBound(options.initialState)), sequence: sequence++,
  }];

  while (frontier.length && diagnostics.expanded_states < maxExpanded) {
    diagnostics.layers++;
    const candidates = [];
    for (const node of frontier) {
      if (diagnostics.expanded_states >= maxExpanded) break;
      diagnostics.expanded_states++;
      const state = node.state;
      if (options.isValid && !options.isValid(state)) {
        diagnostics.invalid_states++;
        continue;
      }
      if (options.isTerminal(state)) {
        diagnostics.terminal_states++;
        const score = Number(options.scoreTerminal(state));
        if (Number.isFinite(score) && score > bestScore + epsilon) {
          bestScore = score;
          bestNode = node;
        }
        continue;
      }
      const bound = Number(options.upperBound(state));
      if (!Number.isFinite(bound) || bound <= bestScore + epsilon) {
        diagnostics.bound_pruned++;
        continue;
      }
      for (const transition of options.expand(state) || []) {
        const signature = node.depth < 0
          ? (transition.root_signature ?? options.rootSignature?.(transition) ?? null)
          : node.root_signature;
        const child = makeNode(node, transition, signature);
        child.score = Number(transition.priority ?? options.upperBound(child.state));
        child.sequence = sequence++;
        if (child.score <= bestScore + epsilon) diagnostics.bound_pruned++;
        else candidates.push(child);
      }
    }

    const bestByState = new Map();
    for (const candidate of candidates) {
      const key = String(options.getKey(candidate.state));
      const prior = bestByState.get(key);
      if (!prior || candidate.score > prior.score + epsilon) bestByState.set(key, candidate);
      else diagnostics.duplicate_pruned++;
    }
    const unique = [...bestByState.values()];
    const ranked = unique.map(candidate => ({
      ...candidate, state_key: String(options.getKey(candidate.state)),
      root_signature: candidate.root_signature,
    }));
    const selected = selectDiverseBeam(ranked, width);
    diagnostics.beam_pruned += Math.max(0, unique.length - selected.length);
    if (selected.length < unique.length) diagnostics.optimality_proven = false;
    frontier = selected;
  }

  if (frontier.length && diagnostics.expanded_states >= maxExpanded) {
    diagnostics.optimality_proven = false;
    diagnostics.beam_pruned += frontier.length;
  }
  return { score: bestScore, path: bestNode ? reconstructPath(bestNode) : null, diagnostics };
}
