/**
 * Parser for the Praixis Engine's streamed responses.
 *
 * Chat, RAG `ask`, and file-summary endpoints are served as `text/event-stream`
 * bodies that are NOT JSON. They begin with zero or more single-line markers and
 * are followed by the raw generated content:
 *
 *   [SESSION_ID:<id>]\n
 *   [SEARCH_QUERY:<query>]\n     (RAG ask only)
 *   [SOURCES:<a.txt,b.txt>]\n    (RAG ask only)
 *   [FILE:<filename>]\n          (file summary only)
 *   [PROGRESS:<message>]\n       (file summary, large docs; may repeat)
 *   [ERROR:<message>]\n          (in-stream failure; always before content)
 *   ...content tokens...
 *
 * Markers are emitted on their own `\n`-terminated lines before any content, so
 * we peel complete marker lines off the head of the stream and treat everything
 * from the first non-marker byte onward as content.
 */

const MARKER_KEYS = ["SESSION_ID", "SEARCH_QUERY", "SOURCES", "FILE", "PROGRESS", "ERROR"];

/** A complete leading marker line: `[KEY:value]\n`. */
const MARKER_RE = new RegExp(`^\\[(${MARKER_KEYS.join("|")}):([^\\n]*)\\]\\n`);

/** A buffer that is still a possible (incomplete) marker line: no `\n` yet. */
const PARTIAL_MARKER_RE = /^\[[A-Z_]*(:[^\n]*)?$/;

/** Server marker key -> public event type. */
const EVENT_TYPE = {
  SESSION_ID: "session_id",
  SEARCH_QUERY: "search_query",
  SOURCES: "sources",
  FILE: "file",
  PROGRESS: "progress",
  ERROR: "error",
};

function markerEvent(key, value) {
  if (key === "SOURCES") return { type: "sources", value: value ? value.split(",") : [] };
  return { type: EVENT_TYPE[key], value };
}

/**
 * Turn an async iterable of decoded text chunks into an async iterable of events:
 *
 *   { type: "session_id" | "search_query" | "file" | "progress" | "error", value: string }
 *   { type: "sources", value: string[] }
 *   { type: "token", value: string }   // a piece of the generated content
 *
 * @param {AsyncIterable<string>} chunks
 * @returns {AsyncGenerator<{ type: string, value: string | string[] }>}
 */
export async function* streamEvents(chunks) {
  let buffer = "";
  let inContent = false;

  const drainMarkers = function* () {
    let m;
    while ((m = MARKER_RE.exec(buffer))) {
      yield markerEvent(m[1], m[2]);
      buffer = buffer.slice(m[0].length);
    }
  };

  for await (const chunk of chunks) {
    if (inContent) {
      if (chunk) yield { type: "token", value: chunk };
      continue;
    }
    buffer += chunk;
    yield* drainMarkers();
    // The buffer no longer starts with a complete marker. If it can't still grow
    // into one either, the marker section is over: the rest is content.
    if (buffer && !PARTIAL_MARKER_RE.test(buffer)) {
      yield { type: "token", value: buffer };
      buffer = "";
      inContent = true;
    }
  }

  // End of stream: peel any trailing complete markers, emit the remainder.
  yield* drainMarkers();
  if (buffer) yield { type: "token", value: buffer };
}

/**
 * Drain a {@link streamEvents} iterable into the buffered shape used by the
 * non-streaming methods: `{ markers, body }`, where `markers` maps event type ->
 * value (`progress` collects into an array) and `body` is the joined content.
 *
 * @param {AsyncIterable<string>} chunks
 * @returns {Promise<{ markers: Record<string, string | string[]>, body: string }>}
 */
export async function collectStream(chunks) {
  const markers = {};
  let body = "";
  for await (const ev of streamEvents(chunks)) {
    if (ev.type === "token") {
      body += ev.value;
    } else if (ev.type === "progress") {
      (markers.progress ??= []).push(ev.value);
    } else {
      markers[ev.type] = ev.value;
    }
  }
  return { markers, body };
}
