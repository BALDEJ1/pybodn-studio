/**
 * Stops Studio when `next dev` or `next start` runs it directly. Those listen on every network
 * address and skip the guard in server.ts, so anyone on the same Wi-Fi could open the memory
 * file.
 */
export function refuseToRunUnguarded(): void {
  if (process.env.PYBODN_STUDIO_SERVER === "1") return
  console.error(
    "\n  Start PyBodn Studio with `npm run dev`, or `npm start` after `npm run build`.\n" +
      "  `next dev` and `next start` would open it to the whole network.\n"
  )
  process.exit(1)
}
