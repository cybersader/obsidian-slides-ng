---
name: obsidian-cli
description: Interact with Obsidian via the official CLI (1.12+). Read/write files, reload plugins, query Bases, run JS eval, take screenshots, manage properties, and more.
---

# Obsidian CLI

Control Obsidian from the terminal. Requires Obsidian 1.12+ running with CLI enabled.

## slides-ng quick reference

```bash
OBS="/mnt/c/Users/Cybersader/AppData/Local/Obsidian/Obsidian.com"
VAULT=obsidian-slides-ng
PID=slides-ng

# Reload the plugin after a build
$OBS vault=$VAULT plugin:reload id=$PID

# Verify it loaded
$OBS vault=$VAULT eval "code=app.plugins.plugins['slides-ng'] ? 'loaded' : 'not loaded'"

# Open the preview view via command palette ID
$OBS vault=$VAULT command id=slides-ng:open-preview

# Check view leaves of the preview type
$OBS vault=$VAULT eval "code=app.workspace.getLeavesOfType('slides-ng-preview').length"

# Capture errors / console
$OBS vault=$VAULT dev:errors
$OBS vault=$VAULT dev:console limit=20

# Screenshot the current Obsidian window
$OBS vault=$VAULT dev:screenshot
# cp /mnt/c/Users/Cybersader/AppData/Local/Temp/obsidian-screenshot*.png test-results/
```

The auto-reload esbuild hook (`bun run dev:reload`) invokes the same
`plugin:reload` under the hood — see `esbuild.config.mjs`.

The remainder of this file is the workspace-shared reference for the full
CLI surface area. The examples use `tasknotes` / `tasknotes-dev-vault` as
sample identifiers; substitute your own vault + plugin id when adapting.

---

## Setup

**Binary path (WSL2):**
```bash
OBSIDIAN="/mnt/c/Users/Cybersader/AppData/Local/Obsidian/Obsidian.com"
```

> **Use `Obsidian.com` (not `.exe`)** — the `.com` file is a terminal redirector that gives proper stdin/stdout. Without it, `Obsidian.exe` (a GUI app) returns exit code 255 and many commands produce no output. The `.com` file requires Catalyst license and lives alongside `Obsidian.exe` in `AppData/Local/Obsidian/`.

**Obsidian must be running.** The first CLI command launches it if not.

**WSL2 notes:**
- Target vaults by name: `vault=tasknotes-dev-vault`
- Screenshots save to Windows temp dir; copy to project with glob: `cp /mnt/c/Users/Cybersader/AppData/Local/Temp/obsidian-screenshot*.png test-results/`

---

## Targeting a Vault

```bash
# If your CWD is inside a vault, it auto-detects
$OBS command

# Target by name
$OBS vault=tasknotes-dev-vault command

# vault= must come BEFORE the command
$OBS vault="My Vault" search query="test"
```

---

## Key Commands for Plugin Development

### Plugin Management
```bash
# List all plugins
$OBS vault=tasknotes-dev-vault plugins

# Get plugin info
$OBS vault=tasknotes-dev-vault plugin id=tasknotes

# Reload plugin after build (replaces Hot Reload)
$OBS vault=tasknotes-dev-vault plugin:reload id=tasknotes

# Enable/disable
$OBS vault=tasknotes-dev-vault plugin:enable id=tasknotes
$OBS vault=tasknotes-dev-vault plugin:disable id=tasknotes
```

### Execute JavaScript in Obsidian
```bash
# Run JS in the app context — access app.vault, app.metadataCache, etc.
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getFiles().length"

# Get active file
$OBS vault=tasknotes-dev-vault eval "code=app.workspace.getActiveFile()?.path"

# Check plugin settings
$OBS vault=tasknotes-dev-vault eval "code=JSON.stringify(app.plugins.plugins.tasknotes?.settings?.taskIdentificationMethod)"
```

### Developer Tools
```bash
# Take screenshot
$OBS vault=tasknotes-dev-vault dev:screenshot path=screenshot.png

# Console messages
$OBS vault=tasknotes-dev-vault dev:console limit=10

# Captured errors
$OBS vault=tasknotes-dev-vault dev:errors

# DOM inspection
$OBS vault=tasknotes-dev-vault dev:dom "selector=.tasknotes-settings" text

# CSS inspection
$OBS vault=tasknotes-dev-vault dev:css "selector=.tn-prop-row"

# Toggle devtools
$OBS vault=tasknotes-dev-vault devtools

# Mobile emulation
$OBS vault=tasknotes-dev-vault dev:mobile on
```

### File Operations
```bash
# Read a file
$OBS vault=tasknotes-dev-vault read file=Recipe
$OBS vault=tasknotes-dev-vault read path="TaskNotes/Tasks/My Task.md"

# Create a file
$OBS vault=tasknotes-dev-vault create name="New Task" content="---\nstatus: open\n---" silent

# Append/prepend content
$OBS vault=tasknotes-dev-vault append file=Recipe content="- [ ] New step"

# List files
$OBS vault=tasknotes-dev-vault files folder=TaskNotes/Tasks

# File info
$OBS vault=tasknotes-dev-vault file file=Recipe
```

### Properties (Frontmatter)
```bash
# List all properties in vault
$OBS vault=tasknotes-dev-vault properties all counts

# Read a property
$OBS vault=tasknotes-dev-vault property:read name=status file="My Task"

# Set a property
$OBS vault=tasknotes-dev-vault property:set name=status value=done file="My Task"

# Remove a property
$OBS vault=tasknotes-dev-vault property:remove name=obsolete file="My Task"
```

### Bases (Database Views)
```bash
# List all .base files
$OBS vault=tasknotes-dev-vault bases

# Query a base view
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=json
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=csv
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=paths

# List views in a base
$OBS vault=tasknotes-dev-vault base:views
```

### Search
```bash
# Full-text search
$OBS vault=tasknotes-dev-vault search query="meeting notes"
$OBS vault=tasknotes-dev-vault search query="TODO" matches

# Open search pane
$OBS vault=tasknotes-dev-vault search:open query="bug fix"
```

### Tasks (Markdown Checkboxes)
```bash
# List tasks
$OBS vault=tasknotes-dev-vault tasks todo
$OBS vault=tasknotes-dev-vault tasks daily

# Toggle a task
$OBS vault=tasknotes-dev-vault task ref="Recipe.md:8" toggle
```

### Tags
```bash
# List all tags with counts
$OBS vault=tasknotes-dev-vault tags all counts sort=count
```

### Navigation
```bash
# Open a file
$OBS vault=tasknotes-dev-vault open file="My Task" newtab

# Daily note
$OBS vault=tasknotes-dev-vault daily

# Execute an Obsidian command
$OBS vault=tasknotes-dev-vault command id=app:open-settings
$OBS vault=tasknotes-dev-vault commands  # list all command IDs
```

---

## Common Workflows

### Build + Reload Plugin (no Hot Reload needed)
```bash
bun run build && $OBS vault=tasknotes-dev-vault plugin:reload id=tasknotes
```

### Inspect Plugin State
```bash
# Check if plugin is loaded
$OBS vault=tasknotes-dev-vault plugin id=tasknotes

# Inspect plugin settings at runtime
$OBS vault=tasknotes-dev-vault eval "code=JSON.stringify(app.plugins.plugins.tasknotes?.settings, null, 2)"

# Count task files
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getMarkdownFiles().filter(f => f.path.startsWith('TaskNotes/')).length"
```

### Debug UI Issues
```bash
# Screenshot current state (saves to Windows temp, copy to project)
$OBS vault=tasknotes-dev-vault dev:screenshot
# Then: cp /mnt/c/Users/Cybersader/AppData/Local/Temp/obsidian-screenshot*.png test-results/

# Check console errors
$OBS vault=tasknotes-dev-vault dev:errors

# Inspect DOM
$OBS vault=tasknotes-dev-vault dev:dom "selector=.modal-container" text

# Inspect computed CSS
$OBS vault=tasknotes-dev-vault dev:css "selector=.tn-prop-row"
```

### Query Base View Results
```bash
# Get task list as JSON for analysis
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=json

# Get just the file paths
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=paths
```

### Test Plugin UI via eval
Use `eval` to trigger plugin actions and inspect state without custom commands:
```bash
# Open a modal (e.g., Bulk Task Creation from a Bases view)
$OBS vault=tasknotes-dev-vault eval "code=app.commands.executeCommandById('tasknotes:bulk-task-creation')"

# Check if a modal is open
$OBS vault=tasknotes-dev-vault eval "code=document.querySelector('.tn-bulk-modal') ? 'open' : 'closed'"

# Inspect plugin runtime state
$OBS vault=tasknotes-dev-vault eval "code=JSON.stringify(Object.keys(app.plugins.plugins.tasknotes), null, 2)"

# Read a task file's frontmatter
$OBS vault=tasknotes-dev-vault eval "code=JSON.stringify(app.metadataCache.getCache('TaskNotes/Tasks/My Task.md')?.frontmatter, null, 2)"

# Count DOM elements matching a selector
$OBS vault=tasknotes-dev-vault eval "code=document.querySelectorAll('.tn-prop-row').length"

# Get inner text of a UI element
$OBS vault=tasknotes-dev-vault eval "code=document.querySelector('.tn-bulk-modal__custom-props-active')?.innerHTML?.substring(0,200) ?? 'not found'"
```

### Build + Reload + Screenshot workflow
```bash
# Full cycle: build, reload, screenshot
bun run build && $OBS vault=tasknotes-dev-vault plugin:reload id=tasknotes && sleep 1 && $OBS vault=tasknotes-dev-vault dev:screenshot
```

---

## Parameter Syntax

- **Parameters**: `key=value` (quote values with spaces: `key="value with spaces"`)
- **Flags**: just the word (e.g., `silent`, `verbose`, `total`)
- **Multiline**: use `\n` for newlines, `\t` for tabs
- **Copy output**: append `--copy` to any command
- **File targeting**: `file=<name>` (wikilink resolution) or `path=<exact/path.md>`

---

## Troubleshooting & WSL2 Gotchas

### Exit Code 1 with No Output

Many CLI commands silently return exit code 1 from WSL2. Common causes:

1. **Obsidian not running**: The CLI requires a running Obsidian instance. If Obsidian is closed, commands fail silently.
2. **Vault name mismatch**: `vault=` must match the exact vault name in Obsidian's vault switcher (case-sensitive).
3. **Command not available**: Some commands only work with specific Obsidian versions or features enabled.

### Commands That Reliably Work from WSL2

These are confirmed working:
```bash
OBS="/mnt/c/Users/Cybersader/AppData/Local/Obsidian/Obsidian.com"

# Plugin info (NOT reload — see below)
$OBS vault=tasknotes-dev-vault plugin id=tasknotes

# Eval — most versatile, always works
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getFiles().length"

# File operations
$OBS vault=tasknotes-dev-vault read path="TaskNotes/Tasks/My Task.md"
$OBS vault=tasknotes-dev-vault files folder=TaskNotes/Tasks

# List commands
$OBS vault=tasknotes-dev-vault commands
$OBS vault=tasknotes-dev-vault bases

# Developer tools
$OBS vault=tasknotes-dev-vault dev:errors
$OBS vault=tasknotes-dev-vault dev:console limit=10
```

### Commands That May Silently Fail

These sometimes return exit code 1 with no output:
```bash
# plugin:reload — may fail silently, verify with eval afterward
$OBS vault=tasknotes-dev-vault plugin:reload id=tasknotes

# base:query — file parameter must use wikilink-style name (no .base extension, no path)
$OBS vault=tasknotes-dev-vault base:query file="All Tasks" format=json
# If it fails, try without quotes or with different file resolution

# dev:screenshot — saves to Windows temp, returns nothing to stdout
$OBS vault=tasknotes-dev-vault dev:screenshot
```

### Quoting Issues in eval

The `eval` command is sensitive to quote nesting. WSL2 shell quoting adds another layer:

```bash
# GOOD — double quotes around code=, avoid single quotes inside
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getFiles().length"

# GOOD — use template literals or avoid nested quotes
$OBS vault=tasknotes-dev-vault eval "code=JSON.stringify(app.plugins.plugins.tasknotes?.settings)"

# BAD — nested single quotes cause "Invalid or unexpected token"
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getFiles().filter(f => f.path.includes('Tasks'))"

# WORKAROUND — use escaped double quotes or bracket notation
$OBS vault=tasknotes-dev-vault eval "code=app.vault.getFiles().filter(f => f.path.includes(\"Tasks\")).length"
```

### Verifying plugin:reload Actually Worked

Since `plugin:reload` may silently fail, verify with eval:
```bash
# Reload then verify
$OBS vault=tasknotes-dev-vault plugin:reload id=tasknotes && \
$OBS vault=tasknotes-dev-vault eval "code=app.plugins.plugins.tasknotes ? 'loaded' : 'not loaded'"
```

### Best Practices for Agents

1. **Prefer `eval` over specialized commands** — `eval` is the most reliable and versatile
2. **Don't retry on exit code 1** — if a command fails, try an alternative approach (e.g., eval)
3. **Don't waste context on repeated failures** — if the CLI is unresponsive, fall back to manual testing
4. **Use `2>&1` to capture stderr** — sometimes error messages go to stderr
5. **Set timeout** — CLI commands can hang if Obsidian is unresponsive; use a 10-second timeout

---

## Full Command Reference

See https://help.obsidian.md/cli for the complete docs.

### Categories
| Category | Key Commands |
|----------|-------------|
| **General** | `help`, `version`, `reload`, `restart` |
| **Files** | `files`, `file`, `open`, `create`, `read`, `append`, `prepend`, `move`, `delete` |
| **Properties** | `properties`, `property:set`, `property:read`, `property:remove`, `aliases` |
| **Bases** | `bases`, `base:query`, `base:views`, `base:create` |
| **Search** | `search`, `search:open` |
| **Tags** | `tags`, `tag` |
| **Tasks** | `tasks`, `task` |
| **Links** | `backlinks`, `links`, `unresolved`, `orphans`, `deadends` |
| **Plugins** | `plugins`, `plugin`, `plugin:enable`, `plugin:disable`, `plugin:install`, `plugin:uninstall`, `plugin:reload` |
| **Daily** | `daily`, `daily:read`, `daily:append`, `daily:prepend` |
| **History** | `diff`, `history`, `history:read`, `history:restore` |
| **Workspace** | `workspace`, `tabs`, `tab:open`, `recents` |
| **Dev** | `devtools`, `dev:console`, `dev:errors`, `dev:screenshot`, `dev:dom`, `dev:css`, `dev:mobile`, `dev:debug`, `dev:cdp`, `eval` |
| **Themes** | `themes`, `theme`, `theme:set`, `theme:install`, `snippets`, `snippet:enable` |
| **Sync** | `sync`, `sync:status`, `sync:history` |
| **Publish** | `publish:site`, `publish:list`, `publish:status`, `publish:add` |
| **Templates** | `templates`, `template:read`, `template:insert` |
| **Vault** | `vault`, `vaults`, `vault:open` |
