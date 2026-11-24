import { getBridge } from "@/server/bridge/instance.ts"

export const dynamic = "force-dynamic"

/** Whether the bridge is starting, ready, or cannot open the file and why. */
export function GET(): Response {
  return Response.json(getBridge().status())
}

/** Tries again after a problem, once it is fixed. */
export function POST(): Response {
  return Response.json(getBridge().retry())
}
