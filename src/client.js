/** The top-level Praixis Engine client. */

import { Transport } from "./transport.js";
import { ChatResource } from "./resources/chat.js";
import { RagResource } from "./resources/rag.js";

export class PraixisClient {
  /**
   * @param {string} baseURL  Root URL, e.g. "http://localhost:8080".
   * @param {string} [apiKey] Sent as the `X-API-Key` header on every request.
   * @param {{ timeoutMs?: number }} [opts]
   */
  constructor(baseURL, apiKey = "", { timeoutMs = 30000 } = {}) {
    this._transport = new Transport(baseURL, apiKey, { timeoutMs });
    this.chat = new ChatResource(this._transport);
    this.rag = new RagResource(this._transport);
  }

  get baseURL() {
    return this._transport.baseURL;
  }
}
