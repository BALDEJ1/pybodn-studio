import type { SetupCode } from "@/server/bridge/client.ts"

export type Advice = {
  title: string
  fix: string
  /** A command that fixes it, when there is one. */
  command?: string
  /** Show the reason Studio got, when it says more than the title. */
  showReason: boolean
  /** Fixing it changes how Studio starts, so a retry from the page cannot help. */
  needsRestart: boolean
}

const PIP = 'pip install "pybodn>=1.2"'

export const ADVICE: Record<SetupCode, Advice> = {
  missing_env: {
    title: "Choose a memory file",
    fix: "Start Studio again with PYBODN_DB set to the file your application uses.",
    command: "PYBODN_DB=path/to/memory.db npm run dev",
    showReason: false,
    needsRestart: true,
  },
  no_file: {
    title: "There is no memory file at this path",
    fix: "Studio opens only a file that already exists. Check the path in PYBODN_DB.",
    showReason: false,
    needsRestart: false,
  },
  no_runner: {
    title: "Studio cannot run Python",
    fix: "Install uv from docs.astral.sh/uv, or set PYBODN_PYTHON to a Python that has pybodn.",
    showReason: true,
    needsRestart: false,
  },
  no_pybodn: {
    title: "This Python has no pybodn",
    fix: "Install pybodn 1.2 or later in it, or unset PYBODN_PYTHON so that uv installs it.",
    command: PIP,
    showReason: false,
    needsRestart: false,
  },
  old_pybodn: {
    title: "pybodn is too old",
    fix: "Studio needs pybodn 1.2 or later.",
    command: PIP,
    showReason: true,
    needsRestart: false,
  },
  newer_file: {
    title: "A newer pybodn has changed this file",
    fix: "Update Studio to its latest version, then start it again.",
    showReason: true,
    needsRestart: true,
  },
  open_failed: {
    title: "pybodn could not open the file",
    fix: "Check that the path in PYBODN_DB is the memory file of your application.",
    showReason: true,
    needsRestart: false,
  },
  bridge_failed: {
    title: "Studio's Python side did not start",
    fix: "Its messages are in the terminal where Studio runs.",
    showReason: true,
    needsRestart: false,
  },
}
