/** Next.js calls this once as it starts. The check lives apart, as it uses Node.js only. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { refuseToRunUnguarded } = await import("./server/unguarded.ts")
    refuseToRunUnguarded()
  }
}
