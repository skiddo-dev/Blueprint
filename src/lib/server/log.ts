// Minimal structured logger: one JSON object per line, easy to filter in the
// Container Apps log stream (level/path/id fields). This is the single sink — to
// forward errors to an APM / error tracker (Application Insights, Sentry, …)
// later, add that call inside emit() and nothing else has to change.
type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function emit(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
}
