import { runRequest } from "@/server/bridge/memory.ts"

/** Every read and write of the memory file: `{method, params}` in, `{ok, result}` out. */
export async function POST(request: Request): Promise<Response> {
  // A body that is not JSON is refused with the rest of the bad requests.
  const body: unknown = await request.json().catch(() => undefined)
  const reply = await runRequest(body)
  return Response.json(reply.body, { status: reply.status })
}
