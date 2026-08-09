/** Model registry - prefix /general-requests. */

const PREFIX = "/general-requests";

export class ModelsResource {
  constructor(transport) {
    this._t = transport;
  }

  /**
   * GET /general-requests/models - the models this API key may use.
   *
   * Returns { models: [{ id, context_window }, ...], default: id }. The listing
   * is scoped to your key: a server may serve models this key cannot reach, and
   * those are not listed. These ids are exactly the values accepted by the
   * `model` option elsewhere in this client; anything else is rejected with a
   * 400. A single-model deployment reports one entry, usually "default".
   *
   * Requires engine 2.4.0 or newer.
   */
  async list() {
    return this._t.requestJSON("GET", `${PREFIX}/models`);
  }
}
