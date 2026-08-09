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
  /** Which configured model ran — every generating endpoint emits it. */
  | { type: "model"; value: string }
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
  /** Registry id of the model that answered. Absent before engine 2.4.0. */
  model?: string;
}

/** Buffered response from `chat.summarizeFile` and `rag.summarizeDocument`. */
export interface SummaryResponse {
  /** The summarized file's name. */
  filename: string;
  /** The summary. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
  /** Registry id of the model that produced it. Absent before engine 2.4.0. */
  model?: string;
}

/** Buffered response from `rag.compare`. */
export interface ComparisonResponse {
  file_1: string;
  file_2: string;
  /** The comparison. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
  /** Registry id of the model that produced it. Absent before engine 2.4.0. */
  model?: string;
}

export interface SessionHistory {
  session_id: string;
  history: ChatMessage[];
}

/**
 * Response of `chat.getUsage`. Counters cover the streamed answer (chat and
 * RAG), RAG query reformulation, and compaction calls; they expire with the
 * session.
 */
export interface SessionUsage {
  session_id: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /**
   * Estimated size of the current history against the server's context budget
   * (~4 chars/token) — how close the session is to auto-compacting.
   */
  estimated_context_tokens: number;
}

/** Response of `chat.compact`. */
export interface CompactionResult {
  status: string;
  session_id: string;
  messages_before: number;
  messages_after: number;
  estimated_tokens_before: number;
  estimated_tokens_after: number;
}

/**
 * Response of `chat.undoLastExchange`. The removed exchange is the last user
 * message plus the assistant reply that followed it (just the user message
 * when generation failed).
 */
export interface UndoResult {
  status: string;
  session_id: string;
  removed_messages: number;
  /** The user message that was removed — handy for a retry. */
  undone_prompt: string;
  messages_remaining: number;
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

/** Response of `rag.uploadText`. */
export interface TextUploadResponse {
  status: string;
  collection_name: string;
  filename: string;
  chunks_stored: number;
  improved_search: boolean;
}

export interface FileChunk {
  chunk_index: number;
  content: string;
}

/**
 * Response of `rag.getChunks` — the document's stored chunks in order,
 * exactly as retrieval sees them.
 */
export interface FileChunks {
  status: string;
  collection_name: string;
  filename: string;
  total_chunks: number;
  chunks: FileChunk[];
}

/**
 * Response of `rag.questionStatus`. `generation_pending` is true while a
 * background generation pass is running.
 */
export interface QuestionStatus {
  collection_name: string;
  filename: string;
  total_chunks: number;
  questions_stored: number;
  generation_pending: boolean;
}

/**
 * Response of `rag.regenerateQuestions`. `status` is "scheduled"; generation
 * runs in the background — poll `questionStatus` for progress. `chunks` is
 * how many chunks will be processed.
 */
export interface QuestionRegeneration {
  status: string;
  collection_name: string;
  filename: string;
  chunks: number;
}

export interface AskResponse {
  session_id: string;
  /** The (possibly reformulated) query the server used for retrieval. */
  search_query: string;
  /** Source filenames that contributed context. */
  sources: string[];
  /** The answer. For `responseFormat: "json"`, the model's raw JSON string. */
  content: string;
  /** Registry id of the model that answered. Absent before engine 2.4.0. */
  model?: string;
}

/** One entry of `models.list()`. */
export interface ModelInfo {
  /** Registry id — the value to pass as `model`. */
  id: string;
  /** That model's token budget; sessions are compacted against it. */
  context_window: number;
}

/** Response of `models.list()`, scoped to the calling API key. */
export interface ModelListResponse {
  models: ModelInfo[];
  /** The id used when a request names no model. */
  default: string;
}

/** One ranked chunk from `rag.search`. */
export interface SearchResult {
  /** Filename the chunk came from. */
  source: string;
  /** The chunk's raw text. */
  text: string;
  /** Ranking score; read against `score_type`. */
  score: number;
}

/** Buffered response from `rag.search` — retrieval only, no LLM synthesis. */
export interface SearchResponse {
  collection_name: string;
  query: string;
  n_results: number;
  results: SearchResult[];
  /**
   * How to read each result's `score`: "rrf" (hybrid pgvector backend, small
   * values, higher is better) or "similarity" (dense Chroma backend, 0–1).
   */
  score_type: "rrf" | "similarity";
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
  /**
   * Registry id of the model to answer with (see `models.list()`); omit for the
   * key's default. A session stays on the model it was last given.
   */
  model?: string;
  responseFormat?: ResponseFormat;
}

export interface SummarizeFileOptions {
  task?: string;
  tone?: string;
  /** Registry id of the model to use; omit for the key's default. */
  model?: string;
  responseFormat?: ResponseFormat;
}

/** Options for `rag.compare` / `rag.compareStream` and `rag.summarizeDocument` / `rag.summarizeDocumentStream`. */
export interface ResponseFormatOptions {
  /** Registry id of the model to use; omit for the key's default. */
  model?: string;
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

/** Options for `rag.uploadText` — same knobs as `UploadOptions`. */
export interface UploadTextOptions {
  collectionName?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  chunkingStrategy?: ChunkingStrategy;
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
  /**
   * Registry id of the model to write the answer (see `models.list()`); omit
   * for the key's default. Query reformulation always runs on the server's own
   * utility model regardless.
   */
  model?: string;
  responseFormat?: ResponseFormat;
}

export interface SearchOptions {
  collectionName: string;
  nResults?: number;
}

type Dict = Record<string, unknown>;

export class ChatResource {
  send(prompt: string, opts?: ChatOptions): Promise<ChatResponse>;
  stream(prompt: string, opts?: ChatOptions): AsyncGenerator<StreamEvent>;
  summarizeFile(file: FileInput, opts?: SummarizeFileOptions): Promise<SummaryResponse>;
  summarizeFileStream(file: FileInput, opts?: SummarizeFileOptions): AsyncGenerator<StreamEvent>;
  listSessions(): Promise<string[]>;
  getHistory(sessionId: string): Promise<SessionHistory>;
  getUsage(sessionId: string): Promise<SessionUsage>;
  compact(sessionId: string): Promise<CompactionResult>;
  undoLastExchange(sessionId: string): Promise<UndoResult>;
  clearHistory(sessionId: string): Promise<SessionDeleted>;
}

export class ModelsResource {
  /** GET /general-requests/models — the models this API key may use. */
  list(): Promise<ModelListResponse>;
}

export class RagResource {
  upload(files: FileInput | FileInput[], opts?: UploadOptions): Promise<UploadResponse>;
  uploadText(text: string, filename: string, opts?: UploadTextOptions): Promise<TextUploadResponse>;
  getChunks(collectionName: string, filename: string): Promise<FileChunks>;
  questionStatus(collectionName: string, filename: string): Promise<QuestionStatus>;
  regenerateQuestions(collectionName: string, filename: string): Promise<QuestionRegeneration>;
  ask(question: string, opts: AskOptions): Promise<AskResponse>;
  askStream(question: string, opts: AskOptions): AsyncGenerator<StreamEvent>;
  search(query: string, opts: SearchOptions): Promise<SearchResponse>;
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
  models: ModelsResource;
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
