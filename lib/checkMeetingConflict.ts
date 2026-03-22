export type MeetingTimeInput = {
    start: Date | string | number;
    end: Date | string | number;
    id?: string;
  };
  
  export type MeetingSuggestion = {
    start: Date;
    end: Date;
  };
  
  export type CheckMeetingConflictResult = {
    hasConflict: boolean;
    conflicts: MeetingTimeInput[];
    suggestion?: MeetingSuggestion;
  };
  
  function toMs(value: Date | string | number, fieldName: string): number {
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid ${fieldName}: ${String(value)}`);
    }
    return ms;
  }
  
  function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    // Treat intervals as [start, end). If one ends exactly when another starts, it's not a conflict.
    return aStart < bEnd && aEnd > bStart;
  }
  
  export function checkMeetingConflict(
    existingMeetings: MeetingTimeInput[],
    proposedMeeting: MeetingTimeInput,
    options?: { bufferMinutes?: number }
  ): CheckMeetingConflictResult {
    const bufferMinutes = options?.bufferMinutes ?? 15;
    const bufferMs = Math.max(0, bufferMinutes) * 60_000;
  
    const proposedStartMs = toMs(proposedMeeting.start, "proposedMeeting.start");
    const proposedEndMs = toMs(proposedMeeting.end, "proposedMeeting.end");
    const durationMs = proposedEndMs - proposedStartMs;
    if (!(durationMs > 0)) {
      throw new Error("proposedMeeting.end must be after proposedMeeting.start");
    }
  
    const normalized = existingMeetings
      .map((m) => {
        const startMs = toMs(m.start, "existingMeeting.start");
        const endMs = toMs(m.end, "existingMeeting.end");
        if (!(endMs > startMs)) {
          throw new Error("existingMeeting.end must be after existingMeeting.start");
        }
        return { startMs, endMs, original: m };
      })
      .sort((a, b) => a.startMs - b.startMs);
  
    const conflicts = normalized
      .filter((m) => overlaps(proposedStartMs, proposedEndMs, m.startMs, m.endMs))
      .map((m) => m.original);
  
    if (conflicts.length === 0) {
      return { hasConflict: false, conflicts: [] };
    }
  
    let candidateStartMs = proposedStartMs;
  
    // Find the next slot (same duration) that doesn't overlap any existing meeting.
    // If it overlaps, push it to "that meeting's end + buffer" and try again.
    for (let guard = 0; guard < normalized.length + 50; guard++) {
      const candidateEndMs = candidateStartMs + durationMs;
  
      const overlapping = normalized.filter((m) =>
        overlaps(candidateStartMs, candidateEndMs, m.startMs, m.endMs)
      );
  
      if (overlapping.length === 0) {
        return {
          hasConflict: true,
          conflicts,
          suggestion: { start: new Date(candidateStartMs), end: new Date(candidateEndMs) },
        };
      }
  
      const latestEndMs = Math.max(...overlapping.map((m) => m.endMs));
      candidateStartMs = latestEndMs + bufferMs;
    }
  
    // Should be unreachable unless input is pathological; return a conservative suggestion.
    const fallbackStartMs = Math.max(
      proposedStartMs,
      ...normalized.map((m) => m.endMs + bufferMs)
    );
    return {
      hasConflict: true,
      conflicts,
      suggestion: {
        start: new Date(fallbackStartMs),
        end: new Date(fallbackStartMs + durationMs),
      },
    };
  }
  
  