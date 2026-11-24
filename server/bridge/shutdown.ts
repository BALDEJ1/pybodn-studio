/**
 * Lets server.ts stop the bridge. The bridge is created inside Next.js and server.ts runs outside
 * it, so they share it through `globalThis` under this key rather than through an import.
 */
export const BRIDGE_KEY = Symbol.for("pybodn-studio.bridge")

type Stoppable = { stop(): Promise<void> }

/** Ends the bridge's input, so that it closes the memory file, and waits a moment for it. */
export async function stopBridge(): Promise<void> {
  const bridge = (globalThis as { [BRIDGE_KEY]?: Stoppable })[BRIDGE_KEY]
  await bridge?.stop()
}
