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
 * An event yielded by the streaming methods (`chat.stream`, `chat.summarizeFileStream`,
 * `rag.askStream`, `rag.compareStream`, `rag.summarizeDocumentStream`). Markers
 * arrive before `token` events.
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
  /** The session this turn belongs to (new or continued). */
  session_id: string;
  /** The reply. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
}

/** Buffered response from `chat.summarizeFile` and `rag.summarizeDocument`. */
export interface SummaryResponse {
  /** The summarized file's name. */
  filename: string;
  /** The summary. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
}

/** Buffered response from `rag.compare`. */
export interface ComparisonResponse {
  file_1: string;
  file_2: string;
  /** The comparison. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
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
  session_id: string;
  /** The (possibly reformulated) query the server used for retrieval. */
  search_query: string;
  /** Source filenames that contributed context. */
  sources: string[];
  /** The answer. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
}

/**
 * One uploadable file. `filename` is required — the server uses it as the
 * document's stored identity and (primarily) to detect the format, so prefer
 * a `.pdf`/`.docx`/`.txt` extension. `contentType` is inferred from the
 * extension when omitted and serves as the server's fallback signal for
 * extension-less names. A plain `Blob` is not accepted (it has no name);
 * pass a `File` or the object form instead.
 */
export type FileInput =
  | { filename: string; content: string | Uint8Array | Blob; contentType?: string }
  | File;

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
  responseFormat?: ResponseFormat;
}

/** Options for `rag.compare` / `rag.compareStream` and `rag.summarizeDocument` / `rag.summarizeDocumentStream`. */
export interface ResponseFormatOptions {
  responseFormat?: ResponseFormat;
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
  /**
   * Restrict retrieval to a single source document. The only honored key is
   * `source`, e.g. `{ source: "policy.pdf" }`; any other keys are ignored.
   */
  metadataFilter?: Record<string, unknown>;
  responseFormat?: ResponseFormat;
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
  compare(collectionName: string, file1: string, file2: string, opts?: ResponseFormatOptions): Promise<ComparisonResponse>;
  compareStream(collectionName: string, file1: string, file2: string, opts?: ResponseFormatOptions): AsyncGenerator<StreamEvent>;
  summarizeDocument(collectionName: string, filename: string, opts?: ResponseFormatOptions): Promise<SummaryResponse>;
  summarizeDocumentStream(collectionName: string, filename: string, opts?: ResponseFormatOptions): AsyncGenerator<StreamEvent>;
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
