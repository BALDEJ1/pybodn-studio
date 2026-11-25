import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import path from "node:path"

import { bridgeCommand } from "../server/bridge/command.ts"

const ROOT = process.cwd()
const LINK = /http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/
const START_LIMIT = 60_000

export type Studio = { link: string; stop: () => Promise<void> }

/** Starts the built Studio on a free port, on `db` or with no PYBODN_DB at all. */
export async function startStudio(db: string | undefined): Promise<Studio> {
  const environ = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "PYBODN_DB")
  ) as NodeJS.ProcessEnv
  const port = String(await freePort())
  const child = spawn(process.execPath, ["server.ts", "--production"], {
    cwd: ROOT,
    env: { ...environ, PORT: port, ...(db ? { PYBODN_DB: db } : {}) },
    stdio: ["ignore", "pipe", "inherit"],
  })
  try {
    return { link: await linkOf(child), stop: () => stop(child) }
  } catch (error) {
    await stop(child)
    throw error
  }
}

/** Writes the demo memories to a new file at `path`, with the Python that Studio uses. */
export function seed(path: string): void {
  const { command, args, env } = bridgeCommand(process.env, ROOT, "seed.py")
  const run = spawnSync(command, [...args, path], {
    cwd: ROOT,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  })
  if (run.status !== 0) throw new Error(`seed failed: ${run.stderr}`)
}

/**
 * Changes a memory in `db` from a Python process of its own, as another program using the file
 * would, with the same pybodn as Studio. `changes` are fields of `update`.
 */
export function changeElsewhere(
  db: string,
  namespace: string,
  id: string,
  changes: Record<string, unknown>
): void {
  elsewhere(db, namespace, "update", { id, ...changes })
}

/** Adds a memory to `db` as another program would. `fields` are those of `add`. */
export function addElsewhere(
  db: string,
  namespace: string,
  fields: { content: string } & Record<string, unknown>
): void {
  elsewhere(db, namespace, "add", fields)
}

function elsewhere(
  db: string,
  namespace: string,
  method: "add" | "update",
  fields: Record<string, unknown>
): void {
  // The script sits in e2e/, beside these scenarios, not among the bridge's own scripts.
  const script = path.join("..", "e2e", "change.py")
  const { command, args, env } = bridgeCommand(process.env, ROOT, script)
  const run = spawnSync(
    command,
    [...args, db, namespace, method, JSON.stringify(fields)],
    { cwd: ROOT, env: env as NodeJS.ProcessEnv, encoding: "utf8" }
  )
  if (run.status !== 0) throw new Error(`${method} failed: ${run.stderr}`)
}

function linkOf(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let printed = ""
    const timer = setTimeout(
      () => reject(new Error(`Studio printed no link: ${printed}`)),
      START_LIMIT
    )
    child.stdout?.on("data", (chunk: Buffer) => {
      printed += chunk.toString("utf8")
      const link = LINK.exec(printed)?.[0]
      if (link) {
        clearTimeout(timer)
        resolve(link)
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Studio stopped with ${code}: ${printed}`))
    })
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  await once(child, "exit")
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
