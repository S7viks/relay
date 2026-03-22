import type { Logger } from "./logger.js";
import type { OrchestrationEvent } from "./events.js";

export interface ObservationSink {
  emit(event: OrchestrationEvent): void;
}

export class MemoryTimelineSink implements ObservationSink {
  readonly events: OrchestrationEvent[] = [];

  emit(event: OrchestrationEvent): void {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function createPinoStructuredSink(logger: Logger): ObservationSink {
  return {
    emit(e: OrchestrationEvent) {
      logger.info(
        {
          evt: e.name,
          traceId: e.traceId,
          subtaskId: e.subtaskId,
          phase: e.phase,
          payload: e.payload,
        },
        e.name,
      );
    },
  };
}

export class MultiSink implements ObservationSink {
  constructor(private readonly sinks: ObservationSink[]) {}

  emit(event: OrchestrationEvent): void {
    for (const s of this.sinks) {
      s.emit(event);
    }
  }
}
