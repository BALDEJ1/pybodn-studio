import path from "node:path"

/**
 * The variables the bridge gets. The rest of the environment stays out of it: a token or a key
 * of another program has no business in a process that reads the memory file.
 */
const PASSED_ON = new Set([
  "PYBODN_DB",
  "PATH",
  "HOME",
  "TMPDIR",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  // Windows needs these to find the user's folders and its own.
  "USERPROFILE",
  "SYSTEMROOT",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
])

export type BridgeCommand = {
  command: string
  args: string[]
  env: Record<string, string>
  /** What has to be installed for the command to start: shown when it is missing. */
  runner: "uv" | "python"
}

/**
 * How to start bridge/bridge.py. By default uv runs it with the locked pybodn; `PYBODN_PYTHON`
 * names a Python that already has pybodn instead. `-I` keeps a file next to the bridge, or a
 * PYTHON variable, from changing what Python loads.
 */
export function bridgeCommand(
  environ: Readonly<Record<string, string | undefined>>,
  root: string
): BridgeCommand {
  const folder = path.join(root, "bridge")
  const script = path.join(folder, "bridge.py")
  const env = Object.fromEntries(
    Object.entries(environ).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        (PASSED_ON.has(entry[0]) || entry[0].startsWith("UV_"))
    )
  )
  const python = environ.PYBODN_PYTHON
  if (python) {
    return { command: python, args: ["-I", script], env, runner: "python" }
  }
  return {
    command: "uv",
    args: [
      "run",
      "--project",
      folder,
      "--locked",
      "--no-dev",
      "--no-config",
      "python",
      "-I",
      script,
    ],
    env,
    runner: "uv",
  }
}
