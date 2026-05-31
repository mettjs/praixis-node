/**
 * Error types raised by the Praixis client.
 *
 * The hierarchy is intentionally small so callers can catch broadly
 * (`PraixisError`) or narrowly (`AuthenticationError`) without depending on
 * any third-party error classes.
 */

export class PraixisError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** The request never reached the server (DNS, refused, timeout, TLS). */
export class APIConnectionError extends PraixisError {
  constructor(message, { cause } = {}) {
    super(message);
    if (cause) this.cause = cause;
  }
}

/** The server returned a non-2xx response. */
export class APIError extends PraixisError {
  constructor(statusCode, body, detail) {
    super(`API error (status ${statusCode}): ${detail ?? body}`);
    this.statusCode = statusCode;
    this.body = body;
    this.detail = detail ?? body;
  }
}

/** A 401 or 403 response - missing or invalid API key. */
export class AuthenticationError extends APIError {}

/** A 404 response - the requested resource does not exist. */
export class NotFoundError extends APIError {}

/** A 429 response - the per-route rate limit was exceeded. */
export class RateLimitError extends APIError {}

/** Return the most specific APIError subclass for a status code. */
export function errorForStatus(statusCode, body, detail) {
  if (statusCode === 401 || statusCode === 403) return new AuthenticationError(statusCode, body, detail);
  if (statusCode === 404) return new NotFoundError(statusCode, body, detail);
  if (statusCode === 429) return new RateLimitError(statusCode, body, detail);
  return new APIError(statusCode, body, detail);
}
