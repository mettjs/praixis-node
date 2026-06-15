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

  /** DELETE /general-requests/chat/{sessionId} - clear a session. */
  async clearHistory(sessionId) {
    return this._t.requestJSON("DELETE", `${PREFIX}/chat/${encodeURIComponent(sessionId)}`);
  }
}
