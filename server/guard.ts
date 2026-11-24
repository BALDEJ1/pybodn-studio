/**
 * What the Studio server lets through to Next.js. Every request and every WebSocket upgrade is
 * checked here first, so nothing of Next.js, its development pages included, answers a request
 * that fails.
 *
 * - The host must be this computer at the port the request came in on. A site that points its
 *   own name at 127.0.0.1 (DNS rebinding) sends its own name and is refused.
 * - The request must carry the cookie that the link printed at start sets. Without it, another
 *   program or another user of this computer could read and change the memory file.
 * - A write must come from Studio's own page, as JSON, with a known length within the limit.
 */
import { timingSafeEqual } from "node:crypto"
import type { IncomingHttpHeaders } from "node:http"

export const COOKIE_NAME = "pybodn_studio"

/** The library allows 16 MB of metadata, plus the text of a record. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024

export type RequestFacts = {
  method: string
  /** The path and query, as the request line has them. */
  url: string
  headers: IncomingHttpHeaders
  /** The port on this computer that the connection came in on. */
  port: number
}

export type Verdict =
  | { kind: "pass" }
  | { kind: "login"; location: string; cookie: string }
  | { kind: "reject"; status: number; reason: string }

const PASS: Verdict = { kind: "pass" }
const READS = new Set(["GET", "HEAD"])

const FOREIGN_HOST = reject(
  403,
  "Studio answers only at 127.0.0.1 or localhost."
)
const NOT_SIGNED_IN = reject(
  401,
  "Open the link that Studio printed in the terminal when it started."
)
const FOREIGN_PAGE = reject(
  403,
  "Studio accepts changes only from its own page."
)
const NOT_JSON = reject(415, "Send the body as JSON.")
const UNKNOWN_LENGTH = reject(411, "Send the body with its length.")
const TOO_LARGE = reject(413, "The request is too large.")

export function checkRequest(facts: RequestFacts, token: string): Verdict {
  const host = allowedHost(facts)
  if (host === null) return FOREIGN_HOST
  if (facts.method === "OPTIONS") return FOREIGN_PAGE

  const address = new URL(facts.url, `http://${host}`)
  if (READS.has(facts.method) && address.searchParams.has("token")) {
    return signIn(address, token)
  }
  if (!hasSessionCookie(facts.headers.cookie, token)) return NOT_SIGNED_IN
  if (READS.has(facts.method)) return PASS
  return checkWrite(facts.headers, host)
}

export function checkUpgrade(facts: RequestFacts, token: string): Verdict {
  const host = allowedHost(facts)
  if (host === null) return FOREIGN_HOST
  if (!hasSessionCookie(facts.headers.cookie, token)) return NOT_SIGNED_IN
  if (facts.headers.origin !== `http://${host}`) return FOREIGN_PAGE
  return PASS
}

/** The headers every answer carries, refusals included. */
export function safetyHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  }
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")
    ? { ...headers, "Cache-Control": "no-store" }
    : headers
}

function reject(status: number, reason: string): Verdict {
  return { kind: "reject", status, reason }
}

function allowedHost(facts: RequestFacts): string | null {
  const host = facts.headers.host
  const allowed = [`127.0.0.1:${facts.port}`, `localhost:${facts.port}`]
  return host !== undefined && allowed.includes(host) ? host : null
}

function signIn(address: URL, token: string): Verdict {
  if (!sameSecret(address.searchParams.get("token") ?? "", token))
    return NOT_SIGNED_IN
  const rest = new URLSearchParams(address.searchParams)
  rest.delete("token")
  const query = rest.size > 0 ? `?${rest}` : ""
  // A path that starts with two slashes would send the browser to another site.
  const path = `/${address.pathname.replace(/^\/+/, "")}`
  return {
    kind: "login",
    location: `${path}${query}`,
    cookie: `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/`,
  }
}

function hasSessionCookie(header: string | undefined, token: string): boolean {
  if (header === undefined) return false
  return header.split(";").some((pair) => {
    const [name, ...value] = pair.trim().split("=")
    return name === COOKIE_NAME && sameSecret(value.join("="), token)
  })
}

/** Compare in a time that does not depend on how much of the guess is right. */
function sameSecret(guess: string, token: string): boolean {
  const a = Buffer.from(guess)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

function checkWrite(headers: IncomingHttpHeaders, host: string): Verdict {
  if (headers.origin !== `http://${host}`) return FOREIGN_PAGE
  const mediaType = (headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  if (mediaType !== "application/json") return NOT_JSON
  if (headers["transfer-encoding"] !== undefined) return UNKNOWN_LENGTH
  const length = Number(headers["content-length"] ?? "0")
  if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) return TOO_LARGE
  return PASS
}
