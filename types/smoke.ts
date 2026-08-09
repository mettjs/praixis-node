/**
 * Type-level smoke test for the hand-authored `index.d.ts`.
 *
 * The runtime is plain JavaScript, so nothing generates or verifies the
 * declarations — they drift silently unless something consumes them. This file
 * is that consumer: it is never shipped and never executed, it only has to
 * compile under `tsc --noEmit`. Exercise the public surface here whenever it
 * changes, and a declaration that stops matching reality fails CI.
 */
import {
  PraixisClient,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  APIConnectionError,
  PraixisError,
  type StreamEvent,
  type ChatResponse,
  type SearchResponse,
  type AskResponse,
  type ModelListResponse,
} from "praixis";

const client = new PraixisClient("http://localhost:8080", "praixis_key", {
  timeoutMs: 30_000,
});

// baseURL is readonly — assigning to it must not compile.
// @ts-expect-error readonly property
client.baseURL = "http://elsewhere";

async function models(): Promise<void> {
  const listing: ModelListResponse = await client.models.list();
  const _first: string = listing.models[0].id;
  const _window: number = listing.models[0].context_window;
  const _default: string = listing.default;

  // model= is accepted everywhere a model can answer.
  await client.chat.send("hi", { model: listing.default });
  await client.chat.summarizeFile({ filename: "a.txt", content: "x" }, { model: "fast" });
  await client.rag.ask("q", { collectionName: "docs", model: "fast" });
  // Buffered bodies name the model that ran — all four response shapes carry it.
  const cmp = await client.rag.compare("docs", "a.pdf", "b.pdf", { model: "fast" });
  const _cmpModel: string | undefined = cmp.model;
  const docSum = await client.rag.summarizeDocument("docs", "a.pdf", { model: "fast" });
  const _docModel: string | undefined = docSum.model;
  const fileSum = await client.chat.summarizeFile({ filename: "a.txt", content: "x" }, { model: "fast" });
  const _fileModel: string | undefined = fileSum.model;
  const asked = await client.rag.ask("q", { collectionName: "docs", model: "fast" });
  const _askModel: string | undefined = asked.model;
  for await (const event of client.chat.stream("hi", { model: "fast" })) {
    if (event.type === "model") {
      const _which: string = event.value;
    }
  }
}

async function chat(): Promise<void> {
  const reply: ChatResponse = await client.chat.send("hello", {
    sessionId: "s1",
    systemPrompt: "be brief",
    responseFormat: "json",
  });
  const _content: string = reply.content;

  for await (const event of client.chat.stream("hello")) {
    // StreamEvent is a discriminated union: narrowing must give string | string[].
    const ev: StreamEvent = event;
    if (ev.type === "sources") {
      const _sources: string[] = ev.value;
    } else {
      const _value: string = ev.value;
    }
  }

  // Node's FileInput takes the object form or a File — never a path string
  // (unlike the Python SDK, which can read from disk). Asserting that here is
  // the point: it is the declaration's contract with real callers.
  await client.chat.summarizeFile(
    { filename: "report.pdf", content: "raw text" },
    { task: "summarize", tone: "neutral" },
  );
  // @ts-expect-error a bare path string is not a FileInput
  await client.chat.summarizeFile("./report.pdf");
  const _sessions: string[] = await client.chat.listSessions();
  await client.chat.getUsage("s1");
  await client.chat.compact("s1");
  await client.chat.undoLastExchange("s1");
  await client.chat.clearHistory("s1");
}

async function rag(): Promise<void> {
  await client.rag.uploadText("some text", "notes.txt", {
    collectionName: "main",
    improvedSearch: true,
    chunkingStrategy: "semantic",
  });
  await client.rag.upload(
    [
      { filename: "a.txt", content: "alpha" },
      { filename: "b.txt", content: new Uint8Array([1, 2, 3]) },
    ],
    { collectionName: "main" },
  );

  const answer: AskResponse = await client.rag.ask("how many days?", {
    collectionName: "main",
    nResults: 5,
  });
  const _answerContent: string = answer.content;

  for await (const event of client.rag.askStream("q", { collectionName: "main" })) {
    const _t: StreamEvent["type"] = event.type;
  }

  const results: SearchResponse = await client.rag.search("q", { collectionName: "main" });
  for (const hit of results.results) {
    const _score: number = hit.score;
    const _source: string = hit.source;
  }

  await client.rag.getChunks("main", "notes.txt");
  await client.rag.questionStatus("main", "notes.txt");
  await client.rag.regenerateQuestions("main", "notes.txt");
  await client.rag.compare("main", "a.txt", "b.txt", { responseFormat: "text" });
  await client.rag.summarizeDocument("main", "notes.txt");
  await client.rag.deleteFile("main", "notes.txt");
  await client.rag.deleteCollection("main");
}

// The error hierarchy must actually be a hierarchy — these assignments encode it.
function errors(e: unknown): void {
  if (e instanceof AuthenticationError) {
    const _api: APIError = e;
    const _status: number = e.statusCode;
  }
  if (e instanceof NotFoundError || e instanceof RateLimitError) {
    const _base: PraixisError = e;
  }
  if (e instanceof APIConnectionError) {
    const _cause: unknown = e.cause;
  }
}

void chat;
void models;
void rag;
void errors;
