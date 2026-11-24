/** Studio's server does not answer, is shutting down, or this browser is no longer signed in. */
export function UnreachableScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-lg flex-col gap-3">
        <h1 className="text-lg font-medium">Studio is not answering</h1>
        <p className="text-sm text-muted-foreground">
          Start Studio if it has stopped, then open the link it prints in the
          terminal.
        </p>
      </div>
    </main>
  )
}
