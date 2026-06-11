/**
 * Low-level HTTP transport built on the global `fetch` (Node 18+).
 *
 * Depends on nothing outside the Node runtime, so the client cannot be broken by
 * an upstream package release. Every request authenticates with the app-level
 * `X-API-Key` header; admin (`/api/system`) endpoints are intentionally not
 * exposed by this SDK.
 */

import { APIConnectionError, errorForStatus } from "./errors.js";

export class Transport {
  constructor(baseURL, apiKey = "", { timeoutMs = 30000 } = {}) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  _url(path, params) {
    const url = new URL(this.baseURL + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  _authHeader() {
    return this.apiKey ? { "X-API-Key": this.apiKey } : {};
  }

  async _raise(resp) {
    const body = await resp.text().catch(() => "");
    let detail;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && "detail" in parsed) {
        // FastAPI validation errors surface `detail` as a list/object; keep it
        // readable instead of stringifying to "[object Object]".
        detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      // not JSON; leave detail undefined
    }
    return errorForStatus(resp.status, body, detail);
  }

  /** Perform the fetch with a timeout and raise on a non-2xx status. */
  async _fetch(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resp;
    try {
      resp = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      const reason = err?.name === "AbortError" ? "request timed out" : err?.message;
      throw new APIConnectionError(`failed to reach ${this.baseURL}: ${reason}`, { cause: err });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw await this._raise(resp);
    return resp;
  }

  /** Build the fetch init for a (possibly JSON-bodied) request. */
  _jsonInit(method, body) {
    const headers = this._authHeader();
    let payload;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return { method, headers, body: payload };
  }

  /** Build the fetch init for a multipart/form-data POST (fetch sets the boundary). */
  _formInit(files, fields) {
    const form = new FormData();
    for (const { name, value } of fields) form.append(name, value);
    for (const { field, filename, content, contentType } of files) {
      // A File/Blob with no declared type would put application/octet-stream on
      // the part; re-wrap it so the contentType inferred in files.js is sent.
      const blob = content instanceof Blob && content.type ? content : new Blob([content], { type: contentType });
      form.append(field, blob, filename);
    }
    return { method: "POST", headers: this._authHeader(), body: form };
  }

  /** Read a response body as JSON (or null for an empty body). */
  async _readJSON(resp) {
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  /** Read a response body as an async iterable of decoded text chunks. */
  async *_streamChunks(url, init) {
    const resp = await this._fetch(url, init);
    if (!resp.body) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of resp.body) {
        const piece = decoder.decode(chunk, { stream: true });
        if (piece) yield piece;
      }
    } catch (err) {
      throw new APIConnectionError(`stream from ${this.baseURL} interrupted: ${err?.message}`, { cause: err });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  }

  /** Send a JSON request and return the decoded JSON response (or null). */
  async requestJSON(method, path, { body, params } = {}) {
    return this._readJSON(await this._fetch(this._url(path, params), this._jsonInit(method, body)));
  }

  /**
   * Stream a request body as decoded text chunks, for the server's streamed
   * (`text/event-stream`) endpoints which are not JSON.
   */
  requestStream(method, path, { body, params } = {}) {
    return this._streamChunks(this._url(path, params), this._jsonInit(method, body));
  }

  /**
   * Send a multipart/form-data POST and return the decoded JSON response.
   * `files` is an array of { field, filename, content, contentType }; `fields`
   * an array of { name, value }.
   */
  async upload(path, { files = [], fields = [], params } = {}) {
    return this._readJSON(await this._fetch(this._url(path, params), this._formInit(files, fields)));
  }

  /** Like {@link upload} but streams the response as decoded text chunks. */
  uploadStream(path, { files = [], fields = [], params } = {}) {
    return this._streamChunks(this._url(path, params), this._formInit(files, fields));
  }
}
