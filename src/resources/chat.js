/** Core AI endpoints - prefix /general-requests. */

import { toPart } from "../files.js";
import { streamEvents, collectStream } from "../stream.js";

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

  _summaryArgs(file, { task = DEFAULT_TASK, tone = DEFAULT_TONE } = {}) {
    return {
      files: [toPart(file, "file")],
      fields: [
        { name: "task", value: task },
        { name: "tone", value: tone },
      ],
    };
  }

  /**
   * POST /general-requests/chat - send a prompt and get the full reply.
   * Omit `sessionId` to start a new conversation. The server streams the reply;
   * this buffers it and returns { session_id, response, response_format }.
   */
  async send(prompt, opts = {}) {
    const { markers, body } = await collectStream(
      this._t.requestStream("POST", `${PREFIX}/chat`, { body: this._chatBody(prompt, opts) }),
    );
    const responseFormat = opts.responseFormat ?? "text";
    let response = body;
    if (responseFormat === "json") {
      try {
        response = JSON.parse(body);
      } catch {
        // server didn't return valid JSON; hand back the raw text
      }
    }
    return { session_id: markers.session_id ?? null, response, response_format: responseFormat };
  }

  /**
   * POST /general-requests/chat - stream the reply incrementally, yielding
   * `{ type: "session_id" | "token", value }` events as they arrive.
   */
  stream(prompt, opts = {}) {
    return streamEvents(this._t.requestStream("POST", `${PREFIX}/chat`, { body: this._chatBody(prompt, opts) }));
  }

  /**
   * POST /general-requests/file_summary - summarize one uploaded file.
   * `file` is { filename, content, contentType? } or a File. The filename
   * extension is the primary format signal (.pdf/.docx/.txt); contentType is
   * the server's fallback for extension-less names.
   */
  async summarizeFile(file, opts = {}) {
    const { markers, body } = await collectStream(
      this._t.uploadStream(`${PREFIX}/file_summary`, this._summaryArgs(file, opts)),
    );
    const result = { filename: markers.file ?? null, summary: body };
    if (markers.error !== undefined) result.error = markers.error;
    return result;
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
