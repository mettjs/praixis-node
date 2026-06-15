# Praixis Engine — Node.js Client

A lightweight, **zero-dependency** Node.js client for the Praixis Engine API.
It is built on the global `fetch` (Node 18+), so an upstream package release
can never break it.

- Promise-based, async/await API
- No runtime dependencies
- Ships hand-authored TypeScript declarations (`index.d.ts`) — no build step
- Resource-grouped: `client.chat`, `client.rag`

> The companion Python client lives in its own repository.

## Installation

```bash
npm install praixis
```

Requires Node.js 18+. The package is ESM (`"type": "module"`).

## Authentication

Every request authenticates with your app API key, sent as the `X-API-Key`
header. The server's admin panel (`/api/system/*`, HTTP Basic) is intentionally
not exposed by this client — admin tasks belong in the browser UI, and embedding
admin credentials in app code is an anti-pattern.

```js
import { PraixisClient } from "praixis";

const client = new PraixisClient("http://localhost:8080", "your-api-key", {
  timeoutMs: 30000, // optional, default 30s
});
```

## Chat

```js
// Start a conversation
const reply = await client.chat.send("Hello, world!");
console.log(reply.session_id, reply.content);

// Continue it
await client.chat.send("And again?", { sessionId: reply.session_id });

// JSON-mode response, custom system prompt. `content` is still a string — the
// model's raw JSON text — which you parse yourself.
const r = await client.chat.send("List 3 colors", { responseFormat: "json", systemPrompt: "Be terse" });
const colors = JSON.parse(r.content);

// Sessions
await client.chat.listSessions();        // -> [sessionId, ...]
await client.chat.getHistory(sessionId); // -> { session_id, history: [...] }
await client.chat.clearHistory(sessionId);

// Summarize an uploaded file ({ filename, content[, contentType] } or a File).
// Give the filename a .pdf/.docx/.txt extension — it's the primary format
// signal; contentType is only the fallback for extension-less names.
await client.chat.summarizeFile({ filename: "notes.txt", content: "raw text here" });
```

### Streaming

The server's generative endpoints accept a `stream` toggle. The buffered methods
(`send`, `ask`, `summarizeFile`, `compare`, `summarizeDocument`) send
`stream: false` and return the server's native JSON — the right default for
scripts and backends. The answer is always under `content`.

For token-by-token output, use the streaming variants, which return an async
iterator of events. Marker events (`session_id`, `search_query`, `sources`,
`file`, `progress`, `error`) arrive before the `token` events that carry content:

```js
for await (const event of client.chat.stream("Tell me a story")) {
  if (event.type === "token") process.stdout.write(event.value);
  else if (event.type === "session_id") console.log("session:", event.value);
}

// Every buffered method has a streaming sibling:
//   client.rag.askStream(question, { collectionName })       -> session_id, search_query, sources, then tokens
//   client.chat.summarizeFileStream(file)                    -> file, [progress...], then tokens
//   client.rag.compareStream(coll, f1, f2)                   -> tokens
//   client.rag.summarizeDocumentStream(coll, filename)       -> file, then tokens
```

## RAG

```js
// Ingest one or many documents into a collection
await client.rag.upload({ filename: "manual.txt", content: "..." }, { collectionName: "docs" });
await client.rag.upload(
  [
    { filename: "a.txt", content: "..." },
    { filename: "b.txt", content: "..." },
  ],
  { collectionName: "docs" },
);

// Improved search: generate hypothetical questions in the background so plain,
// conversational queries match formal/technical text better. The document is
// searchable immediately; matching improves once generation finishes.
await client.rag.upload({ filename: "ley.pdf", content: "..." }, { collectionName: "docs", improvedSearch: true });
```

> **File inputs.** Every upload method takes `{ filename, content, contentType? }`
> or a `File`. The `filename` is required — the server uses it as the document's
> stored identity and as the primary format signal, so give it a `.pdf`/`.docx`/
> `.txt` extension. When the extension is missing, the server falls back to the
> part's Content-Type (inferred from the extension when `contentType` is
> omitted), then to the file's magic bytes. A plain `Blob` is rejected because it
> has no name.

```js
// Ask a question grounded in a collection
const ans = await client.rag.ask("What does the manual say about setup?", { collectionName: "docs" });
console.log(ans.content, ans.sources, ans.search_query);

// Restrict retrieval to one source document. Only the `source` key is honored;
// any other keys are ignored (not an error).
await client.rag.ask("What is the notice period?", {
  collectionName: "docs",
  metadataFilter: { source: "policy.pdf" },
});

// Embeddings, listing, deletion, compare, summarize. compare/summarizeDocument
// return { ..., content } and accept an optional { responseFormat }.
await client.rag.embed("some text");
await client.rag.listCollections();
await client.rag.listFiles("docs");
await client.rag.deleteFile("docs", "a.txt");
await client.rag.deleteCollection("docs");
const cmp = await client.rag.compare("docs", "a.txt", "b.txt");   // { file_1, file_2, content }
const docSum = await client.rag.summarizeDocument("docs", "manual.txt"); // { filename, content }
```

## Error handling

```js
import { APIError, AuthenticationError, NotFoundError, RateLimitError, APIConnectionError } from "praixis";

try {
  await client.chat.send("hi");
} catch (err) {
  if (err instanceof AuthenticationError) { /* 401 / 403 */ }
  else if (err instanceof NotFoundError) { /* 404 */ }
  else if (err instanceof RateLimitError) { /* 429 */ }
  else if (err instanceof APIError) { console.log(err.statusCode, err.detail); }
  else if (err instanceof APIConnectionError) { /* never reached the server */ }
}
```

All errors inherit from `PraixisError`.

## Testing

The suite runs against a standard-library mock HTTP server — no network, no
dependencies:

```bash
npm test        # node --test
```

## Privacy note

This client transmits whatever you pass to it (prompts, documents, session IDs)
to the configured Praixis Engine server. Those payloads may contain personal
data — handle them according to your own privacy obligations. The client stores
nothing locally and adds no telemetry.

## License

MIT — see [LICENSE](./LICENSE).
