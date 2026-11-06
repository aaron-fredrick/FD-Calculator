# FD Cal browser app

This static application source imports the same runtime-neutral configuration validator, Greedy/Absolute R+ and GSS strategies, and HTML report generator as the Node.js CLI.

## Local preview (PowerShell)

From the repository root:

```powershell
py -m http.server 8000
```

Open http://localhost:8000/src/web/. A static HTTP server is required because the browser loads ES modules and CSV datasets. No build step, npm dependencies, backend, API key or account-data upload is required.

The app supports Absolute R+, Greedy and GSS for scoped date-range simulations. Absolute R remains CLI-only. Goal mode is visible but disabled while its planner is under development. Scenario inputs stay in the browser until exported as JSON; the generated HTML report is portable and works offline.
