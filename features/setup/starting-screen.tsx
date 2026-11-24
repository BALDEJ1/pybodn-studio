import { LoaderCircle } from "lucide-react"

export function StartingScreen() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-svh items-center justify-center p-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        <h1 className="text-lg font-medium">Starting…</h1>
        <p className="text-sm text-muted-foreground">
          The first start installs Python and pybodn, which can take a minute.
        </p>
      </div>
    </main>
  )
}
