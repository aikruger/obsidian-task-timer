export const DEBUG = true; // set to false before release

export function tlog(scope: string, msg: string, data?: unknown) {
  if (!DEBUG) return;
  if (data !== undefined) {
    console.debug(`[ttimer:${scope}] ${msg}`, data);
  } else {
    console.debug(`[ttimer:${scope}] ${msg}`);
  }
}

export function twarn(scope: string, msg: string, data?: unknown) {
  if (!DEBUG) return;
  if (data !== undefined) {
    console.warn(`[ttimer:${scope}] ⚠️ ${msg}`, data);
  } else {
    console.warn(`[ttimer:${scope}] ⚠️ ${msg}`);
  }
}

export function terr(scope: string, msg: string, data?: unknown) {
  if (!DEBUG) return;
  if (data !== undefined) {
    console.error(`[ttimer:${scope}] ❌ ${msg}`, data);
  } else {
    console.error(`[ttimer:${scope}] ❌ ${msg}`);
  }
}
