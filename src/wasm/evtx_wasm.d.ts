/* tslint:disable */
/* eslint-disable */
/**
 * Utility function to get basic file info without creating a parser instance
 */
export function quick_file_info(data: Uint8Array): any;
/**
 * Compute distinct values + counts for common facets across **all** records.
 * Returned object shape (JSON):
 * {
 *   level:    { "0": 123, "4": 456, ... },
 *   provider: { "Microsoft-Windows-Security-Auditing": 789, ... },
 *   channel:  { "Security": 789, ... },
 *   event_id: { "4688": 321, ... }
 * }
 */
export function compute_buckets(data: Uint8Array): any;
export function main(): void;
export class ArrowChunkIPC {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly ipc: Uint8Array;
  readonly rows: number;
}
export class EvtxWasmParser {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Parse a specific chunk
   */
  parse_chunk(chunk_index: number): any;
  /**
   * Get file header information
   */
  get_file_info(): any;
  /**
   * Serialise a single chunk into Arrow IPC format (Stream, single batch)
   * Returns an object with the binary IPC bytes and the row count.
   */
  chunk_arrow_ipc(chunk_index: number): ArrowChunkIPC;
  /**
   * Get a specific record by its ID
   */
  get_record_by_id(record_id: bigint): any;
  /**
   * Parse records with an optional limit
   */
  parse_with_limit(limit?: number | null): any;
  /**
   * Parse records from a specific chunk with offset/limit.
   * `chunk_index` – zero-based index of the chunk.
   * `start` – zero-based record offset within the chunk to begin at.
   * `limit` – maximum number of records to return (0 = no limit).
   */
  parse_chunk_records(chunk_index: number, start: number, limit?: number | null): any;
  constructor(data: Uint8Array);
  /**
   * Parse all records in the file
   */
  parse_all(): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_arrowchunkipc_free: (a: number, b: number) => void;
  readonly __wbg_evtxwasmparser_free: (a: number, b: number) => void;
  readonly arrowchunkipc_ipc: (a: number) => any;
  readonly arrowchunkipc_rows: (a: number) => number;
  readonly compute_buckets: (a: number, b: number) => [number, number, number];
  readonly evtxwasmparser_chunk_arrow_ipc: (a: number, b: number) => [number, number, number];
  readonly evtxwasmparser_get_file_info: (a: number) => [number, number, number];
  readonly evtxwasmparser_get_record_by_id: (a: number, b: bigint) => [number, number, number];
  readonly evtxwasmparser_new: (a: number, b: number) => [number, number, number];
  readonly evtxwasmparser_parse_all: (a: number) => [number, number, number];
  readonly evtxwasmparser_parse_chunk: (a: number, b: number) => [number, number, number];
  readonly evtxwasmparser_parse_chunk_records: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly evtxwasmparser_parse_with_limit: (a: number, b: number) => [number, number, number];
  readonly main: () => void;
  readonly quick_file_info: (a: number, b: number) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
