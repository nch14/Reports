import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

const marked = new Marked({ gfm: true, breaks: false });

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img", "del", "ins", "sup", "sub", "details", "summary", "input", "kbd", "mark",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    input: ["type", "checked", "disabled"],
    code: ["class"],
    th: ["align"],
    td: ["align"],
    "*": ["id"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    input: (tagName, attribs) =>
      attribs.type === "checkbox" ? { tagName, attribs: { ...attribs, disabled: "" } } : { tagName: "span", attribs: {} },
  },
};

/** Agent-written Markdown is untrusted: render it, then strip anything executable. */
export function renderMarkdown(source: string): string {
  return sanitizeHtml(marked.parse(source, { async: false }), SANITIZE);
}


/**
 * Headers for the sandboxed frame that hosts an HTML report. Scripts may run (for charts),
 * but the document gets an opaque origin, cannot reach the app's cookies or API, and
 * cannot make network requests other than loading images, styles, fonts and libraries
 * from well-known CDNs.
 */
export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
  "font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "img-src data: blob: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

// Reports the document height to the parent so the iframe can size itself.
const RESIZE_SCRIPT = `<script>(function(){function s(){parent.postMessage({type:"report-frame-height",height:document.documentElement.scrollHeight},"*")}addEventListener("load",s);new ResizeObserver(s).observe(document.documentElement);})();</script>`;

const BASE_STYLE = `<style>:root{color-scheme:light}body{margin:0;padding:16px;background:#fff;color:#1c1917;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}</style>`;

export function wrapHtmlReport(body: string): string {
  const isFullDocument = /<html[\s>]/i.test(body);
  if (isFullDocument) {
    // Inject before </body>, or append if the agent left it out.
    return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${RESIZE_SCRIPT}</body>`) : body + RESIZE_SCRIPT;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${BASE_STYLE}</head><body>${body}${RESIZE_SCRIPT}</body></html>`;
}
