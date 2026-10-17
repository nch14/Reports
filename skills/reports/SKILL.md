---
name: reports
description: Publish finished work as a report on the user's Reports site, where they browse reports as a timeline filtered by tag and project. Use when you finish an investigation, plan, review or summary the user should read later, or when they say "write a report", "file this", or "send me a report".
---

# Reports

The `reports` MCP server publishes to the user's private Reports site. They read reports in a browser, often hours later, browsing by date and filtering by tag, project and agent.

## Writing a report

1. Call `list_tags` to see the tags and projects already in use, and `list_reports` with a `query` or `project` to check for an existing report on the topic. If one exists, revise it with `update_report` (add a `note` describing the change) instead of publishing a duplicate.
2. `create_report` with:
   - `title`: the conclusion, not the activity ("Flaky login test is a cache race", not "Investigated tests").
   - `summary`: one or two sentences that stand alone in the list.
   - `project`: the repository or initiative name.
   - `tags`: two to four short lowercase tags. Reuse existing tags; only add a new one when nothing fits.
3. Body: conclusion first, then evidence, then details. Link files and commits. Assume the reader was not watching you work.
4. Use `format: "html"` only when layout or charts matter. HTML runs in a sandbox: scripts may load from cdnjs.cloudflare.com, cdn.jsdelivr.net or unpkg.com; network requests are blocked, so inline all data.
5. For long-running work, use `append_to_report` to add dated progress sections to one Markdown report.

Share the returned `url` with the user when you finish.
