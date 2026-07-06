/**
 * Logging primitives, mirroring the shape used by other first-party SDKs so
 * that a custom logger is a drop-in `(level, message, extra) => void`.
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export type Logger = (level: LogLevel, message: string, extra: Record<string, unknown>) => void

const LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
}

/** Returns true when `level` is at or above the configured `threshold`. */
export function logLevelSatisfies(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold]
}

/** Default logger: writes to the matching `console` method as a single line. */
export const makeConsoleLogger =
  (name: string): Logger =>
  (level, message, extra) => {
    const line = `${name} ${level}: ${message}`
    const payload = Object.keys(extra).length > 0 ? [line, extra] : [line]
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(...payload)
        break
      case LogLevel.WARN:
        console.warn(...payload)
        break
      case LogLevel.ERROR:
        console.error(...payload)
        break
    }
  }
