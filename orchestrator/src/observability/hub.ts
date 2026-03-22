import type { SubtaskId, TraceId } from "../domain/ids.js";
import type { Logger } from "./logger.js";
import type { OrchestrationEvent, OrchestrationEventPhase } from "./events.js";
import type { ObservationSink } from "./sinks.js";
import { MultiSink, createPinoStructuredSink } from "./sinks.js";

export class ObservationHub {
  private readonly sink: ObservationSink;

  constructor(logger: Logger, extraSinks: ObservationSink[] = []) {
    this.sink = new MultiSink([createPinoStructuredSink(logger), ...extraSinks]);
  }

  emit(args: {
    name: string;
    traceId: TraceId;
    subtaskId?: SubtaskId;
    phase: OrchestrationEventPhase;
    payload?: Record<string, unknown>;
  }): void {
    const event: OrchestrationEvent = {
      name: args.name,
      ts: new Date().toISOString(),
      traceId: args.traceId,
      ...(args.subtaskId !== undefined ? { subtaskId: args.subtaskId } : {}),
      phase: args.phase,
      payload: args.payload ?? {},
    };
    this.sink.emit(event);
  }
}
