/**
 * The HTTP server in front of Next.js. It listens on 127.0.0.1 only and runs every request and
 * WebSocket upgrade through the guard before Next.js sees it.
 */
import type { EventEmitter } from "node:events"
import {
  STATUS_CODES,
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { Duplex } from "node:stream"

import {
  checkRequest,
  checkUpgrade,
  safetyHeaders,
  type RequestFacts,
} from "./guard.ts"

const LOOPBACK = "127.0.0.1"

export type StudioServerOptions = {
  /** The secret of this run, which the link printed at start carries. */
  token: string
  /** Next.js's request handler. */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  /**
   * Where upgrades that pass are sent. Next.js is given this in place of the server, so its
   * own listener for upgrades only ever hears the ones that passed.
   */
  upgrades: EventEmitter
}

export function createStudioServer(options: StudioServerOptions): Server {
  const server = createServer((req, res) => {
    void answer(req, res, options)
  })
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const verdict = checkUpgrade(factsOf(req), options.token)
    if (verdict.kind === "pass") {
      options.upgrades.emit("upgrade", req, socket, head)
      return
    }
    const status = verdict.kind === "reject" ? verdict.status : 403
    socket.end(
      `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`
    )
  })
  return server
}

/** Listen on 127.0.0.1 and return the port. Never moves to another port when this one is taken. */
export async function listenOnLoopback(
  server: Server,
  port: number
): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const fail = (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is in use. Stop the program that uses it, or start Studio on another ` +
                `port, for example: PORT=${port + 1} npm run dev`
            )
          : error
      )
    }
    server.once("error", fail)
    server.listen(port, LOOPBACK, () => {
      server.off("error", fail)
      resolve()
    })
  })
  const address = server.address()
  if (
    typeof address !== "object" ||
    address === null ||
    address.address !== LOOPBACK
  ) {
    server.close()
    throw new Error(
      `Studio must listen on ${LOOPBACK} only, but listens on ${String(address)}.`
    )
  }
  return address.port
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  options: StudioServerOptions
): Promise<void> {
  for (const [name, value] of Object.entries(safetyHeaders(req.url ?? "/"))) {
    res.setHeader(name, value)
  }
  const verdict = checkRequest(factsOf(req), options.token)
  if (verdict.kind === "reject") {
    sendText(res, verdict.status, verdict.reason)
    return
  }
  if (verdict.kind === "login") {
    res.writeHead(303, {
      Location: verdict.location,
      "Set-Cookie": [verdict.cookie],
      "Cache-Control": "no-store",
    })
    res.end()
    return
  }
  try {
    await options.handle(req, res)
  } catch (error) {
    // The details stay in the terminal: they may hold the text of a record.
    console.error("Studio could not answer", req.method, req.url, error)
    if (!res.headersSent) sendText(res, 500, "Studio hit an internal error.")
    else res.destroy()
  }
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(text)
}

function factsOf(req: IncomingMessage): RequestFacts {
  return {
    method: req.method ?? "GET",
    url: req.url ?? "/",
    headers: req.headers,
    port: req.socket.localPort ?? 0,
  }
}
