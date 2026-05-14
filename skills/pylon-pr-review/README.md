# pylon-pr-review

Interactive Claude Code skill that runs Pylon's PR review pipeline inside a Claude Code conversation.

## What it does

Given a GitHub PR number, dispatches five specialist subagents in parallel (security, bugs, performance, code-smells, architecture), dedupes their findings, applies a critic rubric, peer-reviews via `codex exec`, serves an interactive HTML report, and posts the findings you select via `gh`.

## Requirements

- `bun` on PATH (https://bun.sh)
- `gh` on PATH, authenticated (`gh auth status`)
- `codex` on PATH, authenticated
- `git` on PATH

## Install

```
./install.sh
```

This symlinks the skill directory into `~/.claude/skills/pylon-pr-review/`.

## Use

Inside Claude Code, ask: "Review PR 1234" (or paste a PR URL). The agent will follow the stage walkthrough in `SKILL.md`.

## Development

```
bun install           # No deps; placeholder for tooling parity
bun test              # Run all tests
bun run lint          # Biome check
bun run typecheck     # tsc --noEmit
```

## Layout

- `SKILL.md` is the slash-command file Claude Code loads.
- `bin/pr-review` is the CLI invoked by the agent during stages.
- `scripts/` holds the implementation (server, dedupe, render, setup, cleanup).
- `templates/styles.css` is the report stylesheet.
- `fixtures/` holds canned PR data for tests.

## Run directory layout

Each invocation creates `~/.pylon-review/pr-<n>-<ts>/` with `pr.json`, `diff.patch`, `findings/`, `findings.deduped.json`, `findings.kept.json`, `findings.final.json`, `screen/`, `state/`, `log.jsonl`. On completion the directory is renamed to `<run-dir>.archived-<timestamp>` rather than deleted, so logs survive for postmortem.
