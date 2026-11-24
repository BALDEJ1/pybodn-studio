const DEFAULT_PORT = 3000
const MAX_PORT = 65535

/** The port from the PORT variable, or 3000. */
export function readPort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(
      `PORT must be a whole number from 1 to ${MAX_PORT}, not ${JSON.stringify(value)}.`
    )
  }
  return port
}
