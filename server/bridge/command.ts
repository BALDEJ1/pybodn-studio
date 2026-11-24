import path from "node:path"

/**
 * The variables the bridge gets. The rest of the environment stays out of it: a token or a key
 * of another program has no business in a process that reads the memory file. Names match in
 * any case, since Windows writes `Path` and proxies are often set as `https_proxy`.
 */
const PASSED_ON = new Set([
  "PYBODN_DB",
  "PATH",
  "HOME",
  "TMPDIR",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  // The first start downloads Python and pybodn, through a proxy where there is one.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
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
 * How to start a script in bridge/, bridge.py unless another is named. By default uv runs it with
 * the locked pybodn; `PYBODN_PYTHON` names a Python that already has pybodn instead. `-I` keeps a
 * file next to the script, or a PYTHON variable, from changing what Python loads.
 */
export function bridgeCommand(
  environ: Readonly<Record<string, string | undefined>>,
  root: string,
  script = "bridge.py"
): BridgeCommand {
  const folder = path.join(root, "bridge")
  const file = path.join(folder, script)
  const env = Object.fromEntries(
    Object.entries(environ).filter((entry): entry is [string, string] => {
      const name = entry[0].toUpperCase()
      return (
        entry[1] !== undefined &&
        (PASSED_ON.has(name) || name.startsWith("UV_"))
      )
    })
  )
  const python = environ.PYBODN_PYTHON
  if (python) {
    return { command: python, args: ["-I", file], env, runner: "python" }
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
      file,
    ],
    env,
    runner: "uv",
  }
}
