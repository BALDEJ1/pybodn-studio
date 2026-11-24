import { spawn } from "node:child_process"

import { BridgeClient, type BridgeProcess } from "./client.ts"
import { bridgeCommand } from "./command.ts"
import { BRIDGE_KEY } from "./shutdown.ts"

type Holder = { [BRIDGE_KEY]?: BridgeClient }

/**
 * The one bridge of this server. It lives on `globalThis`, so that reloading code while working
 * on Studio does not start a second Python process.
 */
export function getBridge(): BridgeClient {
  const holder = globalThis as Holder
  holder[BRIDGE_KEY] ??= createBridge()
  return holder[BRIDGE_KEY]
}

function createBridge(): BridgeClient {
  const root = process.cwd()
  const command = bridgeCommand(process.env, root)
  const client = new BridgeClient({
    runner: command.runner,
    spawn: () =>
      // A list of arguments and no shell: nothing in a path is read as a command.
      spawn(command.command, command.args, {
        cwd: root,
        // Only the variables in the command: Next.js's types ask for NODE_ENV, Python does not.
        env: command.env as NodeJS.ProcessEnv,
        // The bridge's log stays in the terminal and never reaches the browser.
        stdio: ["pipe", "pipe", "inherit"],
        windowsHide: true,
      }) as unknown as BridgeProcess,
  })
  // Node does not end its child processes when it exits.
  process.once("exit", () => client.kill())
  return client
}
