import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { FORMATS, NotFoundError, type Agent, type Report, type Store } from "./store.js";

const MAX_BODY = 2_000_000;

export const INSTRUCTIONS = `This server publishes reports to a private site that one human (the owner) browses as a timeline, filtering by tag, project and agent. Use it for finished work they should read: investigation results, plans, summaries, reviews.

- Write for a reader who was not watching you work. Lead with the conclusion, then the evidence.
- Tag every report with a few short, reusable lowercase tags (e.g. "bug", "ci", "research"); check list_tags and reuse existing ones rather than inventing near-duplicates. Set project to the repository or initiative name.
- Use format "markdown" by default. Use "html" only when the report needs layout or interactive charts; it renders in a sandbox that can load scripts from cdnjs.cloudflare.com, cdn.jsdelivr.net or unpkg.com but cannot make network requests.
- Keep one report per topic. Revise it with update_report (each content change is kept as a version) or append_to_report for running logs, instead of filing duplicates.`;

const tags = z.array(z.string().min(1).max(40)).max(20);

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wraps a tool handler so lookup failures come back as tool errors the agent can read. */
function handle<A>(fn: (args: A) => CallToolResult): (args: A) => CallToolResult {
  return (args) => {
    try {
      return fn(args);
    } catch (err) {
      if (err instanceof NotFoundError) return fail(err.message);
      throw err;
    }
  };
}

export function createMcpServer(store: Store, agent: Agent, publicUrl: string): McpServer {
  const server = new McpServer({ name: "reports", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const url = (id: string) => `${publicUrl}/reports/${id}`;

  const summarize = (r: Report) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    project: r.project,
    tags: r.tags,
    format: r.format,
    version: r.version,
    author: r.agent_name,
    created_at: r.created_at,
    updated_at: r.updated_at,
    url: url(r.id),
  });


  server.registerTool(
    "create_report",
    {
      title: "Create report",
      description: "File a new report for the owner. Returns its id and a link to share.",
      inputSchema: {
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(MAX_BODY).describe("Markdown, or a full HTML document / fragment when format is html."),
        format: z.enum(FORMATS).default("markdown"),
        summary: z.string().max(500).optional().describe("One or two sentences shown in the report list."),
        project: z.string().max(80).optional().describe("Groups related reports, e.g. the repository name."),
        tags: tags.optional().describe("Short lowercase tags; reuse existing ones from list_tags."),
      },
    },
    handle((args) => ok(summarize(store.createReport(agent.id, args)))),
  );

  server.registerTool(
    "update_report",
    {
      title: "Update report",
      description:
        "Revise an existing report. Changing title, body or format records a new version; other fields update in place. Omitted fields are unchanged.",
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().min(1).max(MAX_BODY).optional(),
        format: z.enum(FORMATS).optional(),
        summary: z.string().max(500).optional(),
        project: z.string().max(80).optional(),
        tags: tags.optional().describe("Replaces the full tag list."),
        note: z.string().max(500).optional().describe("What changed in this version, shown in the history."),
      },
    },
    handle(({ id, ...input }) => ok(summarize(store.updateReport(agent.id, id, input)))),
  );

  server.registerTool(
    "append_to_report",
    {
      title: "Append to report",
      description: "Add a section to the end of a Markdown report, e.g. a progress update. Records a new version.",
      inputSchema: {
        id: z.string(),
        markdown: z.string().min(1).max(MAX_BODY),
        note: z.string().max(500).optional(),
      },
    },
    handle(({ id, markdown, note }) => {
      const report = store.getReport(id);
      if (report.format !== "markdown") return fail("append_to_report only works on markdown reports; use update_report.");
      const body = `${report.body.replace(/\s+$/, "")}\n\n${markdown}`;
      if (body.length > MAX_BODY) return fail("Report would exceed the maximum size.");
      return ok(summarize(store.updateReport(agent.id, id, { body, note })));
    }),
  );

  server.registerTool(
    "list_reports",
    {
      title: "List reports",
      description: "Find existing reports, newest first. Check here before creating a report on a topic that may already have one.",
      inputSchema: {
        query: z.string().optional().describe("Text to search for in title, summary and body."),
        project: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Only reports carrying all of these tags."),
        since: z
          .string()
          .refine((s) => !Number.isNaN(Date.parse(s)), "Expected an ISO date or timestamp")
          .optional()
          .describe("ISO date or timestamp; only reports created at or after it."),
        mine_only: z.boolean().default(false).describe("Only reports written with this agent's token."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    handle(({ mine_only, since, ...input }) => {
      const { reports, total } = store.listReports({ ...input, from: since && new Date(since).toISOString(), agentId: mine_only ? agent.id : undefined });
      return ok({ total, reports: reports.map(summarize) });
    }),
  );

  server.registerTool(
    "get_report",
    {
      title: "Get report",
      description: "Read a report's full body. Pass version to read an older version.",
      inputSchema: {
        id: z.string(),
        version: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    handle(({ id, version }) => {
      const report = store.getReport(id);
      const content = version ? store.getVersion(id, version) : report;
      return ok({
        ...summarize(report),
        shown_version: content.version,
        title: content.title,
        format: content.format,
        body: content.body,
        versions: store.listVersions(id).map((v) => ({ version: v.version, note: v.note, author: v.agent_name, created_at: v.created_at })),
      });
    }),
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "Tags and projects already in use, with counts. Check this before tagging a new report.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    handle(() => ok({ tags: store.listTags(), projects: store.listProjects() })),
  );

  return server;
}

/** Stateless Streamable HTTP: a fresh server and transport per request, bound to the calling agent. */
export async function handleMcpRequest(req: Request, store: Store, agent: Agent, publicUrl: string): Promise<Response> {
  const server = createMcpServer(store, agent, publicUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 8 * 1024 * 1024,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
