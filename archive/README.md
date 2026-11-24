> **ARCHIVED LEGACY IMPLEMENTATION — NOT THE ACTIVE APPLICATION**
>
> This directory preserves the earlier Python implementation for historical reference and migration comparison. The active application is the JavaScript code under the repository's `src/` directory, used by the current browser app and Node.js CLI. Do not use this archive as the source of truth for current runtime behaviour, deployment, data schemas or supported features. Historical commands and configuration examples below describe the archived Python version only.

# FD Calculator

Simulate fixed-deposit (FD) investment plans across multiple banks. Compare a fast Greedy heuristic, a horizon-aware Goal-Aware Maturity Ladder (GAML), and the broader Absolute search.

## 1. Run it

Requirements: Python 3.13+ and [uv](https://docs.astral.sh/uv/).

```powershell
uv run fd_cal.py
```

The remainder of this file documents the archived Python application only.