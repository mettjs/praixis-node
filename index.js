/**
 * Praixis Engine Node.js client.
 *
 * A zero-dependency client built on the global `fetch` (Node 18+), so upstream
 * package releases can never break it.
 *
 *   import { PraixisClient } from "praixis";
 *
 *   const client = new PraixisClient("http://localhost:8080", "my-api-key");
 *   const reply = await client.chat.send("Hello");
 *   console.log(reply.response);
 */

export { PraixisClient } from "./src/client.js";
export {
  PraixisError,
  APIError,
  APIConnectionError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from "./src/errors.js";
