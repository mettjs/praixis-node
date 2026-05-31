/** Vector / RAG endpoints - prefix /rag-db. */

import { toParts } from "../files.js";
import { streamEvents, collectStream } from "../stream.js";

const PREFIX = "/rag-db";

export class RagResource {
  constructor(transport) {
    this._t = transport;
  }

  /**
   * POST /rag-db/upload - ingest one or more documents into a collection.
   * Each file is { filename, content, contentType? } or a Blob/File.
   */
  async upload(files, { collectionName = "main", chunkSize = 2000, chunkOverlap = 150, chunkingStrategy = "semantic" } = {}) {
    return this._t.upload(`${PREFIX}/upload`, {
      files: toParts(files, "files"),
      fields: [
        { name: "collection_name", value: collectionName },
        { name: "chunk_size", value: String(chunkSize) },
        { name: "chunk_overlap", value: String(chunkOverlap) },
        { name: "chunking_strategy", value: chunkingStrategy },
      ],
    });
  }

  _askBody(question, { collectionName, sessionId, nResults = 5, systemPrompt, metadataFilter } = {}) {
    const body = { collection_name: collectionName, question, n_results: nResults };
    if (sessionId !== undefined) body.session_id = sessionId;
    if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
    if (metadataFilter !== undefined) body.metadata_filter = metadataFilter;
    return body;
  }

  /**
   * POST /rag-db/ask - answer a question grounded in a collection. The server
   * streams the answer; this buffers it and returns
   * { answer, sources, search_query, session_id }.
   */
  async ask(question, opts = {}) {
    const { markers, body: answer } = await collectStream(
      this._t.requestStream("POST", `${PREFIX}/ask`, { body: this._askBody(question, opts) }),
    );
    return {
      answer,
      sources: markers.sources ?? [],
      search_query: markers.search_query ?? null,
      session_id: markers.session_id ?? null,
    };
  }

  /**
   * POST /rag-db/ask - stream the grounded answer incrementally, yielding
   * `{ type: "session_id" | "search_query" | "sources" | "token", value }` events.
   */
  askStream(question, opts = {}) {
    return streamEvents(this._t.requestStream("POST", `${PREFIX}/ask`, { body: this._askBody(question, opts) }));
  }

  /** POST /rag-db/embed - return the embedding vector for `text`. */
  async embed(text) {
    return this._t.requestJSON("POST", `${PREFIX}/embed`, { body: { text } });
  }

  /** GET /rag-db/list - collections owned by the calling app. */
  async listCollections() {
    const data = await this._t.requestJSON("GET", `${PREFIX}/list`);
    return data?.active_collections ?? [];
  }

  /** GET /rag-db/{collectionName}/files - files in a collection. */
  async listFiles(collectionName) {
    return this._t.requestJSON("GET", `${PREFIX}/${encodeURIComponent(collectionName)}/files`);
  }

  /** DELETE /rag-db/delete/{collectionName} - remove an entire collection. */
  async deleteCollection(collectionName) {
    return this._t.requestJSON("DELETE", `${PREFIX}/delete/${encodeURIComponent(collectionName)}`);
  }

  /** DELETE /rag-db/{collectionName}/files/{filename} - remove one file. */
  async deleteFile(collectionName, filename) {
    return this._t.requestJSON(
      "DELETE",
      `${PREFIX}/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}`,
    );
  }

  /** POST /rag-db/knowledge_base/compare - compare two stored documents. */
  async compare(collectionName, file1, file2) {
    return this._t.requestJSON("POST", `${PREFIX}/knowledge_base/compare`, {
      body: { collection_name: collectionName, file_1: file1, file_2: file2 },
    });
  }

  /** GET /rag-db/knowledge_base/{collectionName}/files/{filename}/summary. */
  async summarizeDocument(collectionName, filename) {
    return this._t.requestJSON(
      "GET",
      `${PREFIX}/knowledge_base/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/summary`,
    );
  }
}
