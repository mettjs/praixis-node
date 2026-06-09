/**
 * Type declarations for the Praixis Engine Node.js client.
 * Hand-authored - the runtime is plain JavaScript with zero dependencies.
 *
 * Only confirmed response shapes are typed; loosely-defined server responses
 * are returned as `Record<string, unknown>` so extra fields are never lost.
 */

export type ResponseFormat = "text" | "json";
export type ChunkingStrategy = "semantic" | "character";

/**
 * An event yielded by the streaming methods (`chat.stream`, `rag.askStream`,
 * `chat.summarizeFileStream`). Markers arrive before `token` events.
 */
export type StreamEvent =
  | { type: "session_id"; value: string }
  | { type: "search_query"; value: string }
  | { type: "sources"; value: string[] }
  | { type: "file"; value: string }
  | { type: "progress"; value: string }
  | { type: "error"; value: string }
  | { type: "token"; value: string };

export interface ChatMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface ChatResponse {
  /** From the stream's [SESSION_ID:...] marker; null if absent. */
  session_id: string | null;
  /** Assembled reply text for "text"; parsed JSON for "json" (raw text if it failed to parse). */
  response: unknown;
  response_format: string;
}

export interface SummaryResponse {
  /** From the stream's [FILE:...] marker; null if absent. */
  filename: string | null;
  /** Assembled summary text. */
  summary: string;
  /** Present only if the stream emitted an [ERROR:...] marker. */
  error?: string;
}

export interface SessionHistory {
  session_id: string;
  history: ChatMessage[];
}

export interface StatusMessage {
  status: string;
  message: string;
}

/** Returned by clearHistory - the server uses `detail` here, not `message`. */
export interface SessionDeleted {
  status: string;
  detail: string;
}

/** One per-file outcome from a multi-file upload. */
export interface UploadResult {
  filename: string | null;
  status: "success" | "error";
  detail?: string;
}

export interface UploadResponse {
  collection_name: string;
  processed: number;
  succeeded: number;
  results: UploadResult[];
}

export interface AskResponse {
  answer: string;
  /** Source filenames from the stream's [SOURCES:...] marker. */
  sources: string[];
  /** The (possibly reformulated) query from the [SEARCH_QUERY:...] marker. */
  search_query: string | null;
  session_id: string | null;
}

export type FileInput =
  | { filename: string; content: string | Uint8Array | Blob; contentType?: string }
  | Blob;

export interface ClientOptions {
  timeoutMs?: number;
}

export interface ChatOptions {
  systemPrompt?: string;
  sessionId?: string;
  responseFormat?: ResponseFormat;
}

export interface SummarizeFileOptions {
  task?: string;
  tone?: string;
}

export interface UploadOptions {
  collectionName?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  chunkingStrategy?: ChunkingStrategy;
  /**
   * Enable hypothetical-question indexing for better natural-language search on
   * the uploaded document(s). Questions are generated in the background after the
   * upload returns (the document is searchable immediately; matching improves
   * once generation finishes). Defaults to false.
   */
  improvedSearch?: boolean;
}

export interface AskOptions {
  collectionName: string;
  sessionId?: string;
  nResults?: number;
  systemPrompt?: string;
  metadataFilter?: Record<string, unknown>;
}

type Dict = Record<string, unknown>;

export class ChatResource {
  send(prompt: string, opts?: ChatOptions): Promise<ChatResponse>;
  stream(prompt: string, opts?: ChatOptions): AsyncGenerator<StreamEvent>;
  summarizeFile(file: FileInput, opts?: SummarizeFileOptions): Promise<SummaryResponse>;
  summarizeFileStream(file: FileInput, opts?: SummarizeFileOptions): AsyncGenerator<StreamEvent>;
  listSessions(): Promise<string[]>;
  getHistory(sessionId: string): Promise<SessionHistory>;
  clearHistory(sessionId: string): Promise<SessionDeleted>;
}

export class RagResource {
  upload(files: FileInput | FileInput[], opts?: UploadOptions): Promise<UploadResponse>;
  ask(question: string, opts: AskOptions): Promise<AskResponse>;
  askStream(question: string, opts: AskOptions): AsyncGenerator<StreamEvent>;
  embed(text: string): Promise<Dict>;
  listCollections(): Promise<unknown[]>;
  listFiles(collectionName: string): Promise<Dict>;
  deleteCollection(collectionName: string): Promise<StatusMessage>;
  deleteFile(collectionName: string, filename: string): Promise<StatusMessage>;
  compare(collectionName: string, file1: string, file2: string): Promise<Dict>;
  summarizeDocument(collectionName: string, filename: string): Promise<Dict>;
}

export class PraixisClient {
  constructor(baseURL: string, apiKey?: string, opts?: ClientOptions);
  readonly baseURL: string;
  chat: ChatResource;
  rag: RagResource;
}

export class PraixisError extends Error {}
export class APIConnectionError extends PraixisError {
  cause?: unknown;
}
export class APIError extends PraixisError {
  statusCode: number;
  body: string;
  detail: string;
}
export class AuthenticationError extends APIError {}
export class NotFoundError extends APIError {}
export class RateLimitError extends APIError {}
