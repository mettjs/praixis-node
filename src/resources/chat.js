/** Core AI endpoints - prefix /general-requests. */

import { toPart } from "../files.js";
import { streamEvents } from "../stream.js";

const PREFIX = "/general-requests";
const DEFAULT_TASK = "Summarize the key points of this document.";
const DEFAULT_TONE = "Professional and objective";

export class ChatResource {
  constructor(transport) {
    this._t = transport;
  }

  _chatBody(prompt, { systemPrompt, sessionId, responseFormat = "text" } = {}) {
    const body = { prompt, response_format: responseFormat };
    if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
    if (sessionId !== undefined) body.session_id = sessionId;
    return body;
  }

  _summaryArgs(file, { task = DEFAULT_TASK, tone = DEFAULT_TONE, responseFormat = "text" } = {}) {
    return {
      files: [toPart(file, "file")],
      fields: [
        { name: "task", value: task },
        { name: "tone", value: tone },
        { name: "response_format", value: responseFormat },
      ],
    };
  }

  /**
   * POST /general-requests/chat - send a prompt and get the full reply in one
   * call. Omit `sessionId` to start a new conversation. Sends `stream: false`
   * and returns the server's buffered JSON: { session_id, content }. For
   * `responseFormat: "json"`, `content` is the model's raw JSON string — parse
   * it yourself.
   */
  async send(prompt, opts = {}) {
    return this._t.requestJSON("POST", `${PREFIX}/chat`, {
      body: { ...this._chatBody(prompt, opts), stream: false },
    });
  }

  /**
   * POST /general-requests/chat - stream the reply incrementally, yielding
   * `{ type: "session_id" | "token", value }` events as they arrive.
   */
  stream(prompt, opts = {}) {
    return streamEvents(this._t.requestStream("POST", `${PREFIX}/chat`, { body: this._chatBody(prompt, opts) }));
  }

  /**
   * POST /general-requests/file_summary - summarize one uploaded file in one
   * call. `file` is { filename, content, contentType? } or a File. The filename
   * extension is the primary format signal (.pdf/.docx/.txt); contentType is
   * the server's fallback for extension-less names. Sends `stream: false` and
   * returns the server's buffered JSON: { filename, content }.
   */
  async summarizeFile(file, opts = {}) {
    const args = this._summaryArgs(file, opts);
    args.fields.push({ name: "stream", value: "false" });
    return this._t.upload(`${PREFIX}/file_summary`, args);
  }

  /**
   * POST /general-requests/file_summary - stream the summary incrementally,
   * yielding `{ type: "file" | "progress" | "error" | "token", value }` events.
   */
  summarizeFileStream(file, opts = {}) {
    return streamEvents(this._t.uploadStream(`${PREFIX}/file_summary`, this._summaryArgs(file, opts)));
  }

  /** GET /general-requests/chat/sessions/active - active session IDs. */
  async listSessions() {
    const data = await this._t.requestJSON("GET", `${PREFIX}/chat/sessions/active`);
    return data?.active_sessions ?? [];
  }

  /** GET /general-requests/chat/{sessionId} - a session's message history. */
  async getHistory(sessionId) {
    return this._t.requestJSON("GET", `${PREFIX}/chat/${encodeURIComponent(sessionId)}`);
  }

  /**
   * GET /general-requests/chat/{sessionId}/usage - a session's token usage.
   * Returns { session_id, requests, prompt_tokens, completion_tokens,
   * total_tokens, estimated_context_tokens }. Counters cover the streamed
   * answer (chat and RAG), RAG query reformulation, and compaction calls, and
   * expire with the session. `estimated_context_tokens` is the current history
   * size against the server's context budget — how close the session is to
   * auto-compacting.
   */
  async getUsage(sessionId) {
    return this._t.requestJSON("GET", `${PREFIX}/chat/${encodeURIComponent(sessionId)}/usage`);
  }

  /**
   * POST /general-requests/chat/{sessionId}/compact - compact a session now.
   * Folds older exchanges into an LLM-written summary (the server also does
   * this automatically near its context budget). Returns { status, session_id,
   * messages_before, messages_after, estimated_tokens_before,
   * estimated_tokens_after }. Rejects with an APIError of status 400 when there
   * is nothing to fold yet, or 503 when the GPU pool is saturated.
   */
  async compact(sessionId) {
    return this._t.requestJSON("POST", `${PREFIX}/chat/${encodeURIComponent(sessionId)}/compact`);
  }

  /**
   * DELETE /general-requests/chat/{sessionId}/last - undo the last exchange.
   * Removes the most recent user message and the assistant reply that followed
   * it (or just the user message if generation failed), so you can retry or
   * regenerate. Compaction summaries are kept. Returns { status, session_id,
   * removed_messages, undone_prompt, messages_remaining }; `undone_prompt` is
   * the removed user message. Rejects with an APIError of status 400 when the
   * session has no user messages left to undo.
   */
  async undoLastExchange(sessionId) {
    return this._t.requestJSON("DELETE", `${PREFIX}/chat/${encodeURIComponent(sessionId)}/last`);
  }

  /** DELETE /general-requests/chat/{sessionId} - clear a session. */
  async clearHistory(sessionId) {
    return this._t.requestJSON("DELETE", `${PREFIX}/chat/${encodeURIComponent(sessionId)}`);
  }
}
