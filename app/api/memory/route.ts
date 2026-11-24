import { failureOf, callMemory } from "@/server/bridge/memory.ts"
import { memoryRequestSchema } from "@/server/bridge/protocol.ts"

/** Every read and write of the memory file: `{method, params}` in, `{ok, result}` out. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return refuse("The request is not JSON.")
  }
  const parsed = memoryRequestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return refuse(`${issue.path.join(".") || "request"}: ${issue.message}`)
  }
  try {
    const result = await callMemory(parsed.data)
    return Response.json({ ok: true, result })
  } catch (error) {
    const { status, body: answer } = failureOf(error, parsed.data.method)
    return Response.json(answer, { status })
  }
}

function refuse(message: string): Response {
  return Response.json(
    { ok: false, error: { code: "bad_request", message } },
    { status: 400 }
  )
}
