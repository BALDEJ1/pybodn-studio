/**
 * Starts PyBodn Studio: `npm run dev` while working on it, `npm start` after `npm run build`.
 *
 * Studio listens on 127.0.0.1 only and prints a link with a secret made for this run. Opening
 * the link signs the browser in, and every request without it is refused.
 */
import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import type { Server } from "node:http"

import { readPort } from "./server/config.ts"
import { createStudioServer, listenOnLoopback } from "./server/http.ts"

const TOKEN_BYTES = 32

const production = process.argv.includes("--production")
// Next.js reads these before it starts, so they are set first. The second one tells
// instrumentation.ts that the guard of this file is in front.
Reflect.set(process.env, "NODE_ENV", production ? "production" : "development")
process.env.PYBODN_STUDIO_SERVER = "1"

const port = readPort(process.env.PORT)
const token = randomBytes(TOKEN_BYTES).toString("base64url")
const upgrades = new EventEmitter()

const { default: next } = await import("next")
const app = next({
  dev: !production,
  hostname: "127.0.0.1",
  port,
  // Next.js adds its own listener for WebSocket upgrades to the server it is given. It gets this
  // stand-in, so only the upgrades the guard let through ever reach it.
  httpServer: upgrades as unknown as Server,
})
await app.prepare()
const handle = app.getRequestHandler()

const server = createStudioServer({
  token,
  upgrades,
  handle: (req, res) => handle(req, res),
})
try {
  const listening = await listenOnLoopback(server, port)
  console.log(
    `\n  PyBodn Studio: http://127.0.0.1:${listening}/?token=${token}\n`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await app.close()
  process.exit(1)
}
