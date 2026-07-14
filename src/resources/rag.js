/** Vector / RAG endpoints - prefix /rag-db. */

import { toParts } from "../files.js";
import { streamEvents } from "../stream.js";

const PREFIX = "/rag-db";

export class RagResource {
  constructor(transport) {
    this._t = transport;
  }

  /**
   * POST /rag-db/upload - ingest one or more documents into a collection.
   * Each file is { filename, content, contentType? } or a File. The filename
   * extension is the primary format signal (.pdf/.docx/.txt); contentType is
   * the server's fallback for extension-less names.
   */
  async upload(files, { collectionName = "main", chunkSize = 2000, chunkOverlap = 150, chunkingStrategy = "semantic", improvedSearch = false } = {}) {
    return this._t.upload(`${PREFIX}/upload`, {
      files: toParts(files, "files"),
      fields: [
        { name: "collection_name", value: collectionName },
        { name: "chunk_size", value: String(chunkSize) },
        { name: "chunk_overlap", value: String(chunkOverlap) },
        { name: "chunking_strategy", value: chunkingStrategy },
        { name: "improved_search", value: String(improvedSearch) },
      ],
    });
  }

  /**
   * POST /rag-db/upload_text - ingest raw text as a document. For callers that
   * already hold the content (scraped pages, database records) — no file
   * wrapping needed. Runs the same pipeline as `upload` after text extraction,
   * so the stored document works with every other endpoint. `filename` becomes
   * the document's stored identity; re-using one replaces the prior document.
   * Returns { status, collection_name, filename, chunks_stored, improved_search }.
   */
  async uploadText(text, filename, { collectionName = "main", chunkSize = 2000, chunkOverlap = 150, chunkingStrategy = "semantic", improvedSearch = false } = {}) {
    return this._t.requestJSON("POST", `${PREFIX}/upload_text`, {
      body: {
        text,
        filename,
        collection_name: collectionName,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        chunking_strategy: chunkingStrategy,
        improved_search: improvedSearch,
      },
    });
  }

  /**
   * GET /rag-db/{collectionName}/files/{filename}/chunks - a document's stored
   * chunks in order ({ chunk_index, content } each) — exactly what retrieval
   * sees, useful for debugging why a search returned what it did. Returns
   * { status, collection_name, filename, total_chunks, chunks }.
   */
  async getChunks(collectionName, filename) {
    return this._t.requestJSON(
      "GET",
      `${PREFIX}/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/chunks`,
    );
  }

  /**
   * GET /rag-db/{collectionName}/files/{filename}/questions - the
   * hypothetical-question index's status for a document. Returns
   * { collection_name, filename, total_chunks, questions_stored,
   * generation_pending }; `generation_pending` is true while a background
   * generation pass is running — poll this after `regenerateQuestions` (or an
   * upload with `improvedSearch: true`).
   */
  async questionStatus(collectionName, filename) {
    return this._t.requestJSON(
      "GET",
      `${PREFIX}/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/questions`,
    );
  }

  /**
   * POST /rag-db/{collectionName}/files/{filename}/questions - backfill or
   * rebuild the hypothetical-question index for a stored document;
   * `improvedSearch` is no longer locked in at upload time. A fresh question
   * set is generated in the background, and the existing index is replaced
   * only once the new pass succeeds (poll `questionStatus` for
   * progress). Returns { status: "scheduled", collection_name, filename,
   * chunks }. Rejects with an APIError of status 409 while a pass is already
   * running, or 400 when question indexing is disabled server-side.
   */
  async regenerateQuestions(collectionName, filename) {
    return this._t.requestJSON(
      "POST",
      `${PREFIX}/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/questions`,
    );
  }

  _askBody(question, { collectionName, sessionId, nResults = 5, systemPrompt, metadataFilter, responseFormat = "text" } = {}) {
    const body = { collection_name: collectionName, question, n_results: nResults, response_format: responseFormat };
    if (sessionId !== undefined) body.session_id = sessionId;
    if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
    if (metadataFilter !== undefined) body.metadata_filter = metadataFilter;
    return body;
  }

  /**
   * POST /rag-db/ask - answer a question grounded in a collection, in one call.
   * Sends `stream: false` and returns the server's buffered JSON:
   * { session_id, search_query, sources, content }. For `responseFormat: "json"`,
   * `content` is the model's raw JSON string — parse it yourself.
   */
  async ask(question, opts = {}) {
    return this._t.requestJSON("POST", `${PREFIX}/ask`, {
      body: { ...this._askBody(question, opts), stream: false },
    });
  }

  /**
   * POST /rag-db/ask - stream the grounded answer incrementally, yielding
   * `{ type: "session_id" | "search_query" | "sources" | "token", value }` events.
   */
  askStream(question, opts = {}) {
    return streamEvents(this._t.requestStream("POST", `${PREFIX}/ask`, { body: this._askBody(question, opts) }));
  }

  /**
   * POST /rag-db/search - retrieval only: ranked raw chunks, no LLM. Returns the
   * server's buffered JSON: { collection_name, query, n_results, results, score_type },
   * where each result is { source, text, score }. Unlike `ask` it does not reformulate
   * the query or call the model — pass a standalone query. Use it when you want the
   * evidence and its scores to reason over yourself instead of a finished answer.
   * `score_type` is "rrf" (hybrid pgvector backend) or "similarity" (dense Chroma backend).
   */
  async search(query, { collectionName, nResults = 5 } = {}) {
    return this._t.requestJSON("POST", `${PREFIX}/search`, {
      body: { collection_name: collectionName, query, n_results: nResults },
    });
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

  /**
   * POST /rag-db/knowledge_base/compare - compare two stored documents in one
   * call. Returns the server's buffered JSON: { file_1, file_2, content }.
   */
  async compare(collectionName, file1, file2, { responseFormat = "text" } = {}) {
    return this._t.requestJSON("POST", `${PREFIX}/knowledge_base/compare`, {
      body: { collection_name: collectionName, file_1: file1, file_2: file2, response_format: responseFormat },
    });
  }

  /**
   * POST /rag-db/knowledge_base/compare - stream the comparison incrementally,
   * yielding `{ type: "error" | "token", value }` events.
   */
  compareStream(collectionName, file1, file2, { responseFormat = "text" } = {}) {
    return streamEvents(
      this._t.requestStream("POST", `${PREFIX}/knowledge_base/compare`, {
        body: { collection_name: collectionName, file_1: file1, file_2: file2, response_format: responseFormat, stream: true },
      }),
    );
  }

  /**
   * GET /rag-db/knowledge_base/{collectionName}/files/{filename}/summary - in
   * one call. Returns the server's buffered JSON: { filename, content }.
   */
  async summarizeDocument(collectionName, filename, { responseFormat = "text" } = {}) {
    return this._t.requestJSON(
      "GET",
      `${PREFIX}/knowledge_base/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/summary`,
      { params: { response_format: responseFormat } },
    );
  }

  /**
   * GET .../summary - stream the document summary incrementally, yielding
   * `{ type: "file" | "progress" | "error" | "token", value }` events.
   */
  summarizeDocumentStream(collectionName, filename, { responseFormat = "text" } = {}) {
    return streamEvents(
      this._t.requestStream(
        "GET",
        `${PREFIX}/knowledge_base/${encodeURIComponent(collectionName)}/files/${encodeURIComponent(filename)}/summary`,
        { params: { response_format: responseFormat, stream: true } },
      ),
    );
  }
}
