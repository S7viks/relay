import type { TraceId } from "../domain/ids.js";

export interface RetrievalChunk {
  id: string;
  text: string;
  score: number;
}

export interface RagContext {
  traceId: TraceId;
  query: string;
  chunks: RetrievalChunk[];
}

/**
 * Optional verification hook: implement and inject into the orchestrator pipeline.
 */
export interface RagVerifier {
  retrieve(query: string, traceId: TraceId): Promise<RagContext>;
}
