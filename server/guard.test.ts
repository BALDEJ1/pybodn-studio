import { describe, expect, test } from "vitest"

import {
  COOKIE_NAME,
  MAX_BODY_BYTES,
  checkRequest,
  checkUpgrade,
  type RequestFacts,
} from "./guard.ts"

const TOKEN = "a-long-random-token-made-at-start"
const PORT = 3000
const HOST = `127.0.0.1:${PORT}`
const ORIGIN = `http://${HOST}`
const SIGNED_IN = `${COOKIE_NAME}=${TOKEN}`

function facts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    method: "GET",
    url: "/",
    port: PORT,
    headers: { host: HOST, cookie: SIGNED_IN },
    ...overrides,
  }
}

function write(headers: RequestFacts["headers"] = {}): RequestFacts {
  return facts({
    method: "POST",
    url: "/api/memories",
    headers: {
      host: HOST,
      cookie: SIGNED_IN,
      origin: ORIGIN,
      "content-type": "application/json",
      "content-length": "2",
      ...headers,
    },
  })
}

describe("the host", () => {
  test.each([HOST, `localhost:${PORT}`])("accepts %s", (host) => {
    expect(
      checkRequest(facts({ headers: { host, cookie: SIGNED_IN } }), TOKEN)
    ).toEqual({
      kind: "pass",
    })
  })

  test.each([
    ["a site that points its name at this computer", `evil.test:${PORT}`],
    ["another port", "127.0.0.1:4000"],
    ["no port", "127.0.0.1"],
    ["the network address of this computer", `192.168.1.20:${PORT}`],
    ["IPv6 loopback, which Studio does not listen on", `[::1]:${PORT}`],
  ])("rejects %s", (_, host) => {
    expect(
      checkRequest(facts({ headers: { host, cookie: SIGNED_IN } }), TOKEN)
    ).toMatchObject({
      kind: "reject",
      status: 403,
    })
  })

  test("rejects a request without a host", () => {
    expect(
      checkRequest(facts({ headers: { cookie: SIGNED_IN } }), TOKEN)
    ).toMatchObject({
      kind: "reject",
      status: 403,
    })
  })

  test("compares with the port the connection came in on", () => {
    const request = facts({
      port: 51234,
      headers: { host: "127.0.0.1:51234", cookie: SIGNED_IN },
    })

    expect(checkRequest(request, TOKEN)).toEqual({ kind: "pass" })
  })
})

describe("the token", () => {
  test("a request without the cookie is refused", () => {
    expect(
      checkRequest(facts({ headers: { host: HOST } }), TOKEN)
    ).toMatchObject({
      kind: "reject",
      status: 401,
    })
  })

  test("a cookie with another token is refused", () => {
    const request = facts({
      headers: { host: HOST, cookie: `${COOKIE_NAME}=guess` },
    })

    expect(checkRequest(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 401,
    })
  })

  test("the right cookie among others is accepted", () => {
    const request = facts({
      headers: { host: HOST, cookie: `theme=dark; ${SIGNED_IN}; x=1` },
    })

    expect(checkRequest(request, TOKEN)).toEqual({ kind: "pass" })
  })

  test("the link from the terminal signs in and drops the token from the address", () => {
    const request = facts({
      url: `/?ns=user%3Aalice&token=${TOKEN}`,
      headers: { host: HOST },
    })

    const verdict = checkRequest(request, TOKEN)

    expect(verdict).toMatchObject({
      kind: "login",
      location: "/?ns=user%3Aalice",
    })
    expect(verdict.kind === "login" && verdict.cookie).toBe(
      `${COOKIE_NAME}=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`
    )
  })

  test("a wrong token in the link is refused without a cookie", () => {
    const request = facts({ url: "/?token=guess", headers: { host: HOST } })

    expect(checkRequest(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 401,
    })
  })

  test.each(["//evil.test/", "///evil.test", "//evil.test/path?x=1"])(
    "signing in from %s never sends the browser to another site",
    (path) => {
      const separator = path.includes("?") ? "&" : "?"
      const request = facts({
        url: `${path}${separator}token=${TOKEN}`,
        headers: { host: HOST },
      })

      const verdict = checkRequest(request, TOKEN)

      expect(verdict.kind).toBe("login")
      const location = verdict.kind === "login" ? verdict.location : ""
      expect(location.startsWith("/")).toBe(true)
      expect(location.startsWith("//")).toBe(false)
    }
  )

  test("the token in the address of a write does not sign in", () => {
    const request = write({ cookie: undefined })
    const withToken = { ...request, url: `/api/memories?token=${TOKEN}` }

    expect(checkRequest(withToken, TOKEN)).toMatchObject({
      kind: "reject",
      status: 401,
    })
  })
})

describe("writes", () => {
  test("a write from Studio's own page passes", () => {
    expect(checkRequest(write(), TOKEN)).toEqual({ kind: "pass" })
  })

  test.each(["POST", "PATCH", "DELETE", "PUT", "PROPFIND"])(
    "%s without an origin is refused",
    (method) => {
      const request = { ...write({ origin: undefined }), method }

      expect(checkRequest(request, TOKEN)).toMatchObject({
        kind: "reject",
        status: 403,
      })
    }
  )

  test.each([
    "http://evil.test",
    "http://localhost:3000",
    "https://127.0.0.1:3000",
    "null",
  ])("a write from %s is refused", (origin) => {
    expect(checkRequest(write({ origin }), TOKEN)).toMatchObject({
      kind: "reject",
      status: 403,
    })
  })

  test("the origin must match the host the page was opened at", () => {
    const request = write({
      host: `localhost:${PORT}`,
      origin: `http://localhost:${PORT}`,
    })

    expect(checkRequest(request, TOKEN)).toEqual({ kind: "pass" })
  })

  test("OPTIONS is refused, so other sites get no permission to call", () => {
    const request = { ...facts(), method: "OPTIONS" }

    expect(checkRequest(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 403,
    })
  })

  test.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    undefined,
  ])("a write sent as %s is refused", (type) => {
    expect(checkRequest(write({ "content-type": type }), TOKEN)).toMatchObject({
      kind: "reject",
      status: 415,
    })
  })

  test("JSON with a character set passes", () => {
    const request = write({ "content-type": "Application/JSON; charset=utf-8" })

    expect(checkRequest(request, TOKEN)).toEqual({ kind: "pass" })
  })

  test("a body larger than the limit is refused before it is read", () => {
    const request = write({ "content-length": String(MAX_BODY_BYTES + 1) })

    expect(checkRequest(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 413,
    })
  })

  test("a body at the limit passes", () => {
    const request = write({ "content-length": String(MAX_BODY_BYTES) })

    expect(checkRequest(request, TOKEN)).toEqual({ kind: "pass" })
  })

  test("a body sent in chunks, whose size is unknown up front, is refused", () => {
    const request = write({
      "content-length": undefined,
      "transfer-encoding": "chunked",
    })

    expect(checkRequest(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 411,
    })
  })

  test("a read needs neither an origin nor JSON", () => {
    expect(checkRequest(facts({ url: "/api/overview" }), TOKEN)).toEqual({
      kind: "pass",
    })
  })
})

describe("WebSocket upgrades", () => {
  function upgrade(headers: RequestFacts["headers"] = {}): RequestFacts {
    return facts({
      url: "/_next/hmr",
      headers: {
        host: HOST,
        cookie: SIGNED_IN,
        origin: ORIGIN,
        upgrade: "websocket",
        ...headers,
      },
    })
  }

  test("an upgrade from Studio's own page passes", () => {
    expect(checkUpgrade(upgrade(), TOKEN)).toEqual({ kind: "pass" })
  })

  test.each([
    ["a foreign origin", { origin: "http://evil.test" }],
    ["no origin", { origin: undefined }],
    ["no cookie", { cookie: undefined }],
    ["a foreign host", { host: `evil.test:${PORT}` }],
  ])("an upgrade with %s is refused", (_, headers) => {
    expect(checkUpgrade(upgrade(headers), TOKEN)).toMatchObject({
      kind: "reject",
    })
  })

  test("the token in the address of an upgrade does not sign in", () => {
    const request = {
      ...upgrade({ cookie: undefined }),
      url: `/_next/hmr?token=${TOKEN}`,
    }

    expect(checkUpgrade(request, TOKEN)).toMatchObject({
      kind: "reject",
      status: 401,
    })
  })
})
