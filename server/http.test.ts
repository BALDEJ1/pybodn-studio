import { EventEmitter, once } from "node:events"
import {
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { connect, type Socket } from "node:net"
import { afterEach, describe, expect, test } from "vitest"

import { COOKIE_NAME } from "./guard.ts"
import { createStudioServer, listenOnLoopback } from "./http.ts"

const TOKEN = "a-long-random-token-made-at-start"
const SIGNED_IN = `${COOKIE_NAME}=${TOKEN}`

type Sent = {
  status: number
  headers: IncomingMessage["headers"]
  body: string
}

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => closeServer(server)))
})

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  return new Promise((resolve) => server.close(() => resolve()))
}

/** A Studio server around a stand-in for Next.js that records what reaches it. */
async function startStudio(
  respond: (req: IncomingMessage, res: ServerResponse) => void = (_, res) =>
    res.end("from next")
) {
  const reached: string[] = []
  const upgrades = new EventEmitter()
  const upgraded: string[] = []
  upgrades.on("upgrade", (req: IncomingMessage, socket: Socket) => {
    upgraded.push(req.url ?? "")
    socket.end(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
    )
  })
  const server = createStudioServer({
    token: TOKEN,
    upgrades,
    handle: async (req, res) => {
      reached.push(`${req.method} ${req.url}`)
      respond(req, res)
    },
  })
  servers.push(server)
  const port = await listenOnLoopback(server, 0)
  return { port, reached, upgraded, server }
}

function send(
  port: number,
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {}
): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: { host: `127.0.0.1:${port}`, ...options.headers },
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk: string) => (body += chunk))
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        )
      }
    )
    outgoing.on("error", reject)
    outgoing.end(options.body)
  })
}

/** Ask for a WebSocket upgrade and return the first line the server answers with. */
async function askUpgrade(
  port: number,
  headers: Record<string, string>
): Promise<string> {
  const socket = connect(port, "127.0.0.1")
  await once(socket, "connect")
  const lines = Object.entries({
    host: `127.0.0.1:${port}`,
    connection: "Upgrade",
    upgrade: "websocket",
    "sec-websocket-version": "13",
    "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    ...headers,
  }).map(([name, value]) => `${name}: ${value}`)
  socket.write(`GET /_next/hmr HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`)
  let answer = ""
  socket.setEncoding("utf8")
  for await (const chunk of socket) {
    answer += chunk
    if (answer.includes("\r\n")) break
  }
  socket.destroy()
  return answer.split("\r\n")[0]
}

describe("listening", () => {
  test("Studio listens on 127.0.0.1 only", async () => {
    const { server } = await startStudio()

    const address = server.address()

    expect(typeof address === "object" && address?.address).toBe("127.0.0.1")
  })

  test("a port in use stops the start with a clear reason", async () => {
    const { port } = await startStudio()
    const second = createStudioServer({
      token: TOKEN,
      upgrades: new EventEmitter(),
      handle: async () => {},
    })

    await expect(listenOnLoopback(second, port)).rejects.toThrow(
      `Port ${port} is in use`
    )
  })
})

describe("requests", () => {
  test("a signed-in request reaches Next.js with the safety headers", async () => {
    const { port, reached } = await startStudio()

    const sent = await send(port, "/", { headers: { cookie: SIGNED_IN } })

    expect(sent.status).toBe(200)
    expect(sent.body).toBe("from next")
    expect(reached).toEqual(["GET /"])
    expect(sent.headers["x-frame-options"]).toBe("DENY")
    expect(sent.headers["content-security-policy"]).toBe(
      "frame-ancestors 'none'"
    )
    expect(sent.headers["x-content-type-options"]).toBe("nosniff")
    expect(sent.headers["referrer-policy"]).toBe("no-referrer")
  })

  test("answers from the API are never cached", async () => {
    const { port } = await startStudio()

    const sent = await send(port, "/api/overview", {
      headers: { cookie: SIGNED_IN },
    })

    expect(sent.headers["cache-control"]).toBe("no-store")
  })

  test("a refused request never reaches Next.js", async () => {
    const { port, reached } = await startStudio()

    const sent = await send(port, "/_next/static/chunks/main.js")

    expect(sent.status).toBe(401)
    expect(reached).toEqual([])
    expect(sent.headers["x-frame-options"]).toBe("DENY")
    expect(sent.headers["cache-control"]).toBe("no-store")
  })

  test("a foreign host never reaches Next.js, even a page of its own", async () => {
    const { port, reached } = await startStudio()

    const sent = await send(port, "/__nextjs_original-stack-frame", {
      headers: { host: `evil.test:${port}`, cookie: SIGNED_IN },
    })

    expect(sent.status).toBe(403)
    expect(reached).toEqual([])
  })

  test("the link from the terminal sets the cookie, which then lets the page in", async () => {
    const { port, reached } = await startStudio()

    const login = await send(port, `/?token=${TOKEN}`)
    const cookie = String(login.headers["set-cookie"]).split(";")[0]
    const page = await send(port, login.headers.location ?? "", {
      headers: { cookie },
    })

    expect(login.status).toBe(303)
    expect(login.headers.location).toBe("/")
    expect(login.headers["set-cookie"]).toEqual([
      `${COOKIE_NAME}=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`,
    ])
    expect(page.status).toBe(200)
    expect(reached).toEqual(["GET /"])
  })

  test("an error inside Next.js gives 500 and leaves the server running", async () => {
    const { port } = await startStudio(() => {
      throw new Error("record text that must not reach the browser")
    })

    const failed = await send(port, "/", { headers: { cookie: SIGNED_IN } })
    const next = await send(port, "/", { headers: { cookie: SIGNED_IN } })

    expect(failed.status).toBe(500)
    expect(failed.body).not.toContain("record text")
    expect(next.status).toBe(500)
  })
})

describe("WebSocket upgrades", () => {
  test("an upgrade from Studio's own page reaches Next.js", async () => {
    const { port, upgraded } = await startStudio()

    const answer = await askUpgrade(port, {
      cookie: SIGNED_IN,
      origin: `http://127.0.0.1:${port}`,
    })

    expect(answer).toBe("HTTP/1.1 101 Switching Protocols")
    expect(upgraded).toEqual(["/_next/hmr"])
  })

  test.each([
    ["a foreign origin", { cookie: SIGNED_IN, origin: "http://evil.test" }],
    ["no cookie", { origin: "http://127.0.0.1" }],
  ])("an upgrade with %s is refused before Next.js", async (_, headers) => {
    const { port, upgraded } = await startStudio()
    const fixed = {
      ...headers,
      origin: headers.origin.replace("127.0.0.1", `127.0.0.1:${port}`),
    }

    const answer = await askUpgrade(port, fixed)

    expect(answer).toMatch(/^HTTP\/1\.1 40[13] /)
    expect(upgraded).toEqual([])
  })
})
