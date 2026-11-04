type Level = 'info' | 'warn' | 'error';

/** One JSON object per line, ready for whatever log collector production uses. */
const runtime = globalThis as { process?: { env?: Record<string, string | undefined> }; document?: unknown };
// Tests stay quiet, and so does the browser demo, where the console belongs to the visitor.
const quiet = runtime.process?.env?.NODE_ENV === 'test' || runtime.document !== undefined;

function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (quiet && level !== 'error') return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
