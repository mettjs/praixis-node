/**
 * Tests for the Praixis Node client against a stdlib http mock server.
 * Run with: node --test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { PraixisClient, AuthenticationError, NotFoundError, APIError } from "../index.js";
import { streamEvents, collectStream } from "../src/stream.js";

/** Yield a string as one or more chunks, to exercise chunk-boundary handling. */
async function* fromChunks(...pieces) {
  for (const p of pieces) yield p;
}
async function toArray(iterable) {
  const out = [];
  for await (const v of iterable) out.push(v);
  return out;
}

test("collectStream splits markers from body", async () => {
  // single session marker
  assert.deepEqual(await collectStream(fromChunks("[SESSION_ID:abc]\nHello")), {
    markers: { session_id: "abc" },
    body: "Hello",
  });
  // RAG ask: session, query, comma-split sources
  assert.deepEqual(
    await collectStream(fromChunks("[SESSION_ID:s1]\n[SEARCH_QUERY:what is x?]\n[SOURCES:a.txt,b.txt]\nAnswer.")),
    { markers: { session_id: "s1", search_query: "what is x?", sources: ["a.txt", "b.txt"] }, body: "Answer." },
  );
  // file summary: repeated PROGRESS markers collect into an array
  assert.deepEqual(await collectStream(fromChunks("[FILE:r.txt]\n[PROGRESS:mapping]\n[PROGRESS:reducing]\nDone.")), {
    markers: { file: "r.txt", progress: ["mapping", "reducing"] },
    body: "Done.",
  });
  // an [ERROR] marker (always emitted before content) is surfaced
  assert.deepEqual(await collectStream(fromChunks("[FILE:r.txt]\n[PROGRESS:mapping]\n[ERROR:GPU busy]\n")), {
    markers: { file: "r.txt", progress: ["mapping"], error: "GPU busy" },
    body: "",
  });
  // brackets inside the content are not mistaken for markers
  assert.deepEqual(await collectStream(fromChunks("[SESSION_ID:z]\nSee item [3].")), {
    markers: { session_id: "z" },
    body: "See item [3].",
  });
  // no markers => everything is body
  assert.deepEqual(await collectStream(fromChunks("plain text")), { markers: {}, body: "plain text" });
});

test("streamEvents handles markers split across chunk boundaries", async () => {
  // The marker, its newline, and the content all arrive in separate pieces.
  const events = await toArray(streamEvents(fromChunks("[SESSION", "_ID:abc]", "\nHel", "lo wor", "ld")));
  assert.deepEqual(events, [
    { type: "session_id", value: "abc" },
    { type: "token", value: "Hel" },
    { type: "token", value: "lo wor" },
    { type: "token", value: "ld" },
  ]);
});

const API_KEY = "app-key";

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const apiOk = req.headers["x-api-key"] === API_KEY;
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    // Mirrors the server's streamed endpoints (chat, rag ask, file summary),
    // which return a text/event-stream body, not JSON.
    const sendStream = (code, text) => {
      res.writeHead(code, { "Content-Type": "text/event-stream" });
      res.end(text);
    };
    const readBody = () =>
      new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });

    if (!apiOk) return send(403, { detail: "API Key header missing." });

    if (req.method === "GET" && p === "/general-requests/chat/sessions/active") return send(200, { active_sessions: ["s1", "s2"] });
    if (req.method === "GET" && p === "/general-requests/chat/missing") return send(404, { detail: "not found" });
    if (req.method === "GET" && p.startsWith("/general-requests/chat/"))
      return send(200, { session_id: p.split("/").pop(), history: [{ role: "user", content: "hi" }] });
    if (req.method === "DELETE" && p.startsWith("/general-requests/chat/")) return send(200, { status: "success", detail: "Session deleted." });
    if (req.method === "GET" && p === "/rag-db/list")
      return send(200, { status: "success", total_documents: 1, active_collections: ["main"] });
    if (req.method === "DELETE" && p.startsWith("/rag-db/")) return send(200, { status: "success", message: "deleted" });

    if (req.method === "POST" && p === "/general-requests/chat") {
      const body = JSON.parse((await readBody()).toString());
      return sendStream(200, `[SESSION_ID:${body.session_id ?? "new-id"}]\necho:${body.prompt}`);
    }
    if (req.method === "POST" && p === "/general-requests/file_summary") {
      const raw = (await readBody()).toString();
      assert.match(req.headers["content-type"] || "", /multipart\/form-data/);
      assert.match(raw, /report\.txt/);
      return sendStream(200, "[FILE:report.txt]\nshort");
    }
    if (req.method === "POST" && p === "/rag-db/upload") {
      const raw = (await readBody()).toString();
      assert.equal((raw.match(/name="files"/g) || []).length, 2);
      assert.match(raw, /collection_name/);
      return send(200, {
        collection_name: "docs",
        processed: 2,
        succeeded: 2,
        results: [
          { filename: "a.txt", status: "success" },
          { filename: "b.txt", status: "success" },
        ],
      });
    }
    if (req.method === "POST" && p === "/rag-db/ask") {
      const body = JSON.parse((await readBody()).toString());
      return sendStream(200, `[SESSION_ID:${body.session_id ?? "new"}]\n[SEARCH_QUERY:${body.question}]\n[SOURCES:a.txt]\n42`);
    }
    if (req.method === "POST" && p === "/rag-db/embed") return send(200, { text: "hello", dimensions: 2, embedding: [0.1, 0.2] });

    return send(404, { detail: "not found" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test("praixis node client", async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const client = new PraixisClient(base, API_KEY);

  // chat
  const r = await client.chat.send("hi", { systemPrompt: "be brief" });
  assert.equal(r.response, "echo:hi");
  assert.equal(r.session_id, "new-id");
  assert.equal((await client.chat.send("again", { sessionId: "s9" })).session_id, "s9");
  assert.deepEqual(await client.chat.listSessions(), ["s1", "s2"]);
  const h = await client.chat.getHistory("abc");
  assert.equal(h.session_id, "abc");
  assert.equal(h.history.length, 1);
  assert.equal((await client.chat.clearHistory("abc")).status, "success");
  const sum = await client.chat.summarizeFile({ filename: "report.txt", content: "hello doc" });
  assert.equal(sum.summary, "short");
  assert.equal(sum.filename, "report.txt");

  // streaming chat: markers arrive as events, content as tokens
  const chatEvents = await toArray(client.chat.stream("hi"));
  assert.deepEqual(chatEvents[0], { type: "session_id", value: "new-id" });
  assert.equal(chatEvents.filter((e) => e.type === "token").map((e) => e.value).join(""), "echo:hi");

  // streaming file summary
  const sumEvents = await toArray(client.chat.summarizeFileStream({ filename: "report.txt", content: "x" }));
  assert.deepEqual(sumEvents[0], { type: "file", value: "report.txt" });
  assert.equal(sumEvents.filter((e) => e.type === "token").map((e) => e.value).join(""), "short");

  // rag
  const up = await client.rag.upload(
    [
      { filename: "a.txt", content: "aaa" },
      { filename: "b.txt", content: "bbb" },
    ],
    { collectionName: "docs" },
  );
  assert.equal(up.processed, 2);
  assert.equal(up.succeeded, 2);
  const ans = await client.rag.ask("q?", { collectionName: "docs", sessionId: "s2" });
  assert.equal(ans.answer, "42");
  assert.equal(ans.session_id, "s2");
  assert.deepEqual(ans.sources, ["a.txt"]);
  assert.equal(ans.search_query, "q?");

  // streaming ask: session/query/sources markers then answer tokens
  const askEvents = await toArray(client.rag.askStream("q?", { collectionName: "docs", sessionId: "s2" }));
  assert.deepEqual(askEvents.find((e) => e.type === "sources"), { type: "sources", value: ["a.txt"] });
  assert.equal(askEvents.filter((e) => e.type === "token").map((e) => e.value).join(""), "42");

  assert.equal((await client.rag.embed("hello")).dimensions, 2);
  assert.deepEqual(await client.rag.listCollections(), ["main"]);
  assert.equal((await client.rag.deleteCollection("docs")).status, "success");

  // api-key failure
  const badKey = new PraixisClient(base, "wrong");
  await assert.rejects(() => badKey.chat.send("hi"), (e) => e instanceof AuthenticationError && e.statusCode === 403);

  // 404 mapping
  await assert.rejects(() => client.chat.getHistory("missing"), (e) => e instanceof NotFoundError && e.statusCode === 404);

  assert.ok(AuthenticationError.prototype instanceof APIError);
});
