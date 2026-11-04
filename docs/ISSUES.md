# Issues, support and label workflow

This guide explains how to report a problem or request, how GitHub labels are applied, and how maintainers process issues. It is intended for both FD Cal users and contributors.

## Choosing the right issue form

Use **[New issue](https://github.com/aaron-fredrick/FD-Calculator/issues/new/choose)** and select the form that best matches the request:

| Form | Use it for | Automatically applied labels |
|---|---|---|
| Bug report | Incorrect calculations, broken behaviour, crashes, or regressions | `bug`, `_triage` |
| Feature request | A new capability or improvement | `enhancement`, `_triage` |
| Documentation | Missing, incorrect, outdated, or unclear documentation | `documentation`, `_triage` |
| Support request | Help using FD Cal or understanding an unexpected result | `support`, `_triage` |

Search [existing issues](https://github.com/aaron-fredrick/FD-Calculator/issues) before opening a new one. Include reproducible steps and a minimal example where possible.

### Public support tickets

The support form creates a **public GitHub issue**, not a private support conversation. Anyone can read the issue and its attachments. Never post bank account numbers, credentials, personal identifiers, private documents, or unredacted financial records. Use fictional or anonymised values in examples.

## How labels are organised

Labels fall into two groups.

### Public-facing category labels

These identify what an issue is about. The issue forms apply the matching category automatically:

| Label | Meaning |
|---|---|
| `bug` | Something is not working as expected |
| `enhancement` | A feature request or product improvement |
| `documentation` | Documentation correction or improvement |
| `support` | A request for help using the project |

### Maintainer workflow labels

Labels prefixed with an underscore (`_`) are internal workflow markers. Maintainers use them to communicate review and implementation status:

| Label | Meaning | Typical use |
|---|---|---|
| `_triage` | Awaiting maintainer review | Applied automatically to every new issue; remove after initial review |
| `_confirmed` | Issue verified | The report is reproducible or the request is accepted for consideration |
| `_in-progress` | Currently being worked on | A maintainer or contributor has started implementation |
| `_blocked` | Blocked by a dependency or another issue | Work cannot proceed until the blocker is resolved |
| `_completed` | Work completed | The requested work has been completed; normally close the issue when appropriate |
| `_duplicate` | Duplicate issue | Another issue already tracks the same underlying matter |
| `_invalid` | Invalid submission | The report is not actionable, is malformed, or is outside the project's scope |
| `_wontfix` | Will not be implemented | The maintainers have decided not to take the issue forward |

The underscore is a naming convention that makes workflow labels easy to distinguish from user-facing categories. It does not itself enforce permissions or behaviour.

## Typical issue lifecycle

New issues start with one category label and `_triage`. Maintainers then review the report and update its workflow label as appropriate.

```text
Issue submitted
  category + _triage
        |
        v
Maintainer review
  remove _triage
        |
        +--> Needs verification / accepted for consideration
        |      add _confirmed
        |             |
        |             v
        |      Work begins: replace/add _in-progress
        |             |
        |             +--> Waiting on dependency: _blocked
        |             |
        |             v
        |      Work completed: _completed, then close when appropriate
        |
        +--> Duplicate: _duplicate, link the canonical issue, close as duplicate
        |
        +--> Not actionable / invalid: _invalid, explain why, close when appropriate
        |
        +--> Not planned: _wontfix, explain the decision, close when appropriate
```

This is a guide, not a rigid state machine. Not every issue needs every status. For example, a documentation typo may move directly from triage to completed. Maintainers should remove obsolete workflow labels when the status changes, so an issue does not misleadingly show several conflicting states. The category label should normally remain.

When closing an issue, use GitHub's appropriate close reason (completed or not planned) in addition to workflow labels where useful. A label alone does not close an issue or prove that a change was released.

## Who can apply labels?

- GitHub applies the category and `_triage` labels configured in the issue form when a user submits it.
- Repository maintainers and collaborators with sufficient repository permissions manage labels after submission.
- Ordinary public users can submit issues and participate in the discussion, but cannot change repository issue labels themselves.
- The underscore prefix is organisational only; GitHub does not treat underscore-prefixed labels as private or permission-restricted.

## Maintainer and contributor guidance

1. Review the issue for duplicates, completeness, reproducibility, and scope.
2. Remove `_triage` once the initial review is complete.
3. Keep the category label and use the workflow label(s) that accurately describe the current status.
4. For duplicates, link the canonical issue before closing.
5. For blocked work, link or describe the dependency.
6. When implementation is complete, reference the relevant commit or pull request and close the issue when the work is actually resolved.
7. Do not mark an issue `_confirmed` merely because it was submitted; verify the report or explicitly accept the proposal first.

## Updating issue forms

The YAML forms live in [`.github/ISSUE_TEMPLATE/`](https://github.com/aaron-fredrick/FD-Calculator/tree/main/.github/ISSUE_TEMPLATE). Each form's top-level `labels` field controls the labels GitHub applies on submission. Keep these names synchronised with labels configured in the repository; a misspelled or nonexistent label will not provide the intended categorisation.

When adding or renaming a category label, update the corresponding issue form and this guide together. Workflow labels are assigned by maintainers during issue processing; they should not be automatically added to every new issue unless the workflow policy is deliberately changed.
