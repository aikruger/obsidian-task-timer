import { App } from "obsidian";
import { PluginStore, SegmentEntry } from "../types/store";
import { buildToken, parseTokenFromLine } from "../types/token";
import { resolveTokenLocation } from "./resolve-location";
import { writeLineToFile } from "../utils/file-write";
import { LiveTokenIndex } from "./hydration";

export function extractTaskText(line: string): string {
  // Simplistic extraction, removing markdown tasks and tokens
  return line.replace(/^[\s>]*[-*]\s+\[( |x|X)\]\s*/, "").replace(/⏱\(ttimer:[^\)]+\)/g, "").trim();
}

export async function startTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] startTimer: id=${id}`);

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.error(`[ttimer] startTimer: cannot resolve token location for id=${id}`);
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token) {
    console.error(`[ttimer] startTimer: token not found on resolved line, id=${id}`);
    return;
  }

  if (token.state === "running") {
    console.log(`[ttimer] startTimer: already running, no-op`);
    return;
  }
  if (token.state === "archived") {
    console.warn(`[ttimer] startTimer: token is archived, cannot start`);
    return;
  }

  const newToken = buildToken(id, "running", token.baseMs);
  const newLine = line.replace(token.raw, newToken);

  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] startTimer: token updated in file id=${id} newToken="${newToken}"`);

  if (tokenIndex[id]) {
    tokenIndex[id].token.state = "running";
    tokenIndex[id].token.baseMs = token.baseMs;
  }

  // Append open segment to store
  const seg: SegmentEntry = {
    id,
    seq: (store.segments[id]?.length ?? 0),
    startedAt: Date.now(),
    filePath: file.path,
    taskTextSnapshot: store.meta[id]?.taskTextSnapshot ?? extractTaskText(line),
  };
  store.segments[id] = [...(store.segments[id] ?? []), seg];
  store.meta[id] = { ...store.meta[id]!, line: lineNo };

  await saveStore();
  console.log(`[ttimer] startTimer: open segment appended seq=${seg.seq} startedAt=${seg.startedAt}`);
}

export async function pauseTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] pauseTimer: id=${id}`);

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.error(`[ttimer] pauseTimer: cannot resolve token location for id=${id}`);
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token || token.state !== "running") {
    console.warn(`[ttimer] pauseTimer: token not running (state=${token?.state}), no-op`);
    return;
  }

  const now = Date.now();
  const segments = store.segments[id] ?? [];
  const openSegIndex = [...segments].map((s, i) => ({ s, i })).reverse().find(({ s }) => !s.endedAt);

  if (!openSegIndex) {
    console.warn(`[ttimer] pauseTimer: no open segment found for id=${id}`);
  }

  let elapsed = 0;
  if (openSegIndex) {
    elapsed = now - openSegIndex.s.startedAt;
    const updatedSegments = [...segments];
    updatedSegments[openSegIndex.i] = { ...openSegIndex.s, endedAt: now };
    store.segments[id] = updatedSegments;
    console.log(`[ttimer] pauseTimer: closed segment seq=${openSegIndex.s.seq} endedAt=${now} elapsed=${elapsed}ms`);
  }

  const newBaseMs = token.baseMs + elapsed;
  const newToken = buildToken(id, "paused", newBaseMs);
  const newLine = line.replace(token.raw, newToken);

  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] pauseTimer: token updated newToken="${newToken}"`);

  if (tokenIndex[id]) {
    tokenIndex[id].token.state = "paused";
    tokenIndex[id].token.baseMs = newBaseMs;
  }

  await saveStore();
}

export async function stopTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] stopTimer: id=${id}`);

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.error(`[ttimer] stopTimer: cannot resolve token location for id=${id}`);
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token) return;

  if (token.state === "stopped" || token.state === "archived") {
    console.log(`[ttimer] stopTimer: already stopped/archived, no-op`);
    return;
  }

  const now = Date.now();
  let newBaseMs = token.baseMs;

  if (token.state === "running") {
    const segments = store.segments[id] ?? [];
    const openSegIndex = [...segments].map((s, i) => ({ s, i })).reverse().find(({ s }) => !s.endedAt);
    if (openSegIndex) {
      const elapsed = now - openSegIndex.s.startedAt;
      const updatedSegments = [...segments];
      updatedSegments[openSegIndex.i] = { ...openSegIndex.s, endedAt: now };
      store.segments[id] = updatedSegments;
      newBaseMs = token.baseMs + elapsed;
      console.log(`[ttimer] stopTimer: closed running segment elapsed=${elapsed}ms newBaseMs=${newBaseMs}`);
    }
  }

  const newToken = buildToken(id, "stopped", newBaseMs);
  const newLine = line.replace(token.raw, newToken);

  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] stopTimer: token updated newToken="${newToken}"`);

  if (tokenIndex[id]) {
    tokenIndex[id].token.state = "stopped";
    tokenIndex[id].token.baseMs = newBaseMs;
  }

  await saveStore();
}

export async function archiveTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex,
  reason: "manual" | "task-completed" = "manual"
): Promise<void> {
  console.log(`[ttimer] archiveTimer: id=${id} reason=${reason}`);

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.warn(`[ttimer] archiveTimer: token location not found for id=${id} — updating store meta only`);
    if (store.meta[id]) {
      store.meta[id].archivedAt = Date.now();
      await saveStore();
    }
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token || token.state === "archived") {
    console.log(`[ttimer] archiveTimer: already archived or token missing, updating store meta only`);
    if (store.meta[id]) store.meta[id].archivedAt = Date.now();
    await saveStore();
    return;
  }

  const now = Date.now();
  let newBaseMs = token.baseMs;

  if (token.state === "running") {
    const segments = store.segments[id] ?? [];
    const openSegIndex = [...segments].map((s, i) => ({ s, i })).reverse().find(({ s }) => !s.endedAt);
    if (openSegIndex) {
      const elapsed = now - openSegIndex.s.startedAt;
      const updatedSegments = [...segments];
      updatedSegments[openSegIndex.i] = { ...openSegIndex.s, endedAt: now };
      store.segments[id] = updatedSegments;
      newBaseMs = token.baseMs + elapsed;
      console.log(`[ttimer] archiveTimer: force-closed running segment elapsed=${elapsed}ms`);
    }
  }

  const newToken = buildToken(id, "archived", newBaseMs);
  const newLine = line.replace(token.raw, newToken);

  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] archiveTimer: token updated newToken="${newToken}"`);

  if (store.meta[id]) store.meta[id].archivedAt = now;

  if (tokenIndex[id]) {
    tokenIndex[id].token.state = "archived";
    tokenIndex[id].token.baseMs = newBaseMs;
  }

  await saveStore();
  console.log(`[ttimer] archiveTimer: complete for id=${id}`);
}

export async function deleteTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] deleteTimer: id=${id}`);

  const location = await resolveTokenLocation(id, app, store);

  if (location) {
    const { file, lineNo, line } = location;
    const token = parseTokenFromLine(line);
    if (token) {
      // Remove the token text from the line, trim trailing space
      const newLine = line.replace(token.raw, "").replace(/\s+$/, "");
      await writeLineToFile(file, lineNo, newLine, app);
      console.log(`[ttimer] deleteTimer: token removed from file id=${id}`);
    } else {
      console.warn(`[ttimer] deleteTimer: token not found on resolved line id=${id}`);
    }
  } else {
    console.warn(`[ttimer] deleteTimer: location not resolved for id=${id}, removing from store only`);
  }

  // Clean up store
  delete store.segments[id];
  delete store.meta[id];

  // Clean up token index
  if (tokenIndex[id]) {
    delete tokenIndex[id];
    console.log(`[ttimer] deleteTimer: removed from tokenIndex id=${id}`);
  }

  await saveStore();
  console.log(`[ttimer] deleteTimer: complete id=${id}`);
}
export async function unarchiveTimer(
  id: string,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] unarchiveTimer: id=${id}`);

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.error(`[ttimer] unarchiveTimer: cannot resolve token location for id=${id}`);
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token) {
    console.error(`[ttimer] unarchiveTimer: no token found on line for id=${id}`);
    return;
  }
  if (token.state !== "archived") {
    console.warn(`[ttimer] unarchiveTimer: token is not archived (state=${token.state}), no-op`);
    return;
  }

  // Transition archived → stopped (keeps accumulated time)
  const newToken = buildToken(id, "stopped", token.baseMs);
  const newLine = line.replace(token.raw, newToken);
  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] unarchiveTimer: token updated in file id=${id} newToken="${newToken}"`);

  // Update in-memory index
  if (tokenIndex[id]) {
    tokenIndex[id].token.state = "stopped";
  }

  // Clear archivedAt from meta
  if (store.meta[id]) {
    store.meta[id] = { ...store.meta[id]!, archivedAt: undefined };
  }

  await saveStore();
  console.log(`[ttimer] unarchiveTimer: completed id=${id}`);
}

export async function setCountdown(
  id: string,
  targetMs: number,
  store: PluginStore,
  saveStore: () => Promise<void>,
): Promise<void> {
  console.log(`[ttimer] setCountdown: id=${id} targetMs=${targetMs}`);
  if (!store.meta[id]) {
    console.error(`[ttimer] setCountdown: no meta entry for id=${id}`);
    return;
  }
  store.meta[id] = {
    ...store.meta[id]!,
    countdownTargetMs: targetMs,
    overtimeStartedAt: undefined,
  };
  await saveStore();
  console.log(`[ttimer] setCountdown: saved targetMs=${targetMs} for id=${id}`);
}

export async function editElapsed(
  id: string,
  newTotalMs: number,
  app: App,
  store: PluginStore,
  saveStore: () => Promise<void>,
  tokenIndex: LiveTokenIndex
): Promise<void> {
  console.log(`[ttimer] editElapsed: id=${id} newTotalMs=${newTotalMs}`);

  if (newTotalMs < 0) {
    console.error(`[ttimer] editElapsed: negative value rejected id=${id}`);
    return;
  }

  const location = await resolveTokenLocation(id, app, store);
  if (!location) {
    console.error(`[ttimer] editElapsed: cannot resolve location for id=${id}`);
    return;
  }

  const { file, lineNo, line } = location;
  const token = parseTokenFromLine(line);
  if (!token) {
    console.error(`[ttimer] editElapsed: no token found on line for id=${id}`);
    return;
  }

  // Replace all segments with a single synthetic closed segment capturing the full new time
  const syntheticStart = Date.now() - newTotalMs;
  const newSeg: SegmentEntry = {
    id,
    seq: 0,
    startedAt: syntheticStart,
    endedAt: Date.now(),
    filePath: file.path,
    taskTextSnapshot: store.meta[id]?.taskTextSnapshot ?? extractTaskText(line),
  };
  store.segments[id] = [newSeg];

  // If still running, add a new open segment starting now
  if (token.state === "running") {
    const openSeg: SegmentEntry = {
      id,
      seq: 1,
      startedAt: Date.now(),
      filePath: file.path,
      taskTextSnapshot: store.meta[id]?.taskTextSnapshot ?? extractTaskText(line),
    };
    store.segments[id].push(openSeg);
  }

  // Update baseMs in the file token to 0 (segments now hold all data)
  const newToken = buildToken(id, token.state, 0);
  const newLine = line.replace(token.raw, newToken);
  await writeLineToFile(file, lineNo, newLine, app);
  console.log(`[ttimer] editElapsed: wrote new token and replaced segments for id=${id}`);

  if (tokenIndex[id]) {
    tokenIndex[id].token.baseMs = 0;
  }

  await saveStore();
  console.log(`[ttimer] editElapsed: complete id=${id} newTotalMs=${newTotalMs}`);
}
