import { describe, expect, test } from "vitest"

import { bridgeCommand } from "./command.ts"

describe("the command that starts the bridge", () => {
  test("passes on only the variables the bridge needs", () => {
    const environ = {
      PYBODN_DB: "demo.db",
      PATH: "/usr/bin",
      HOME: "/home/alice",
      UV_CACHE_DIR: "/cache",
      GITHUB_TOKEN: "secret",
      PYTHONPATH: "/elsewhere",
    }

    const { env } = bridgeCommand(environ, "/studio")

    expect(Object.keys(env).sort()).toEqual([
      "HOME",
      "PATH",
      "PYBODN_DB",
      "UV_CACHE_DIR",
    ])
  })

  test("matches the names whatever their case, as Windows and proxies write them", () => {
    const environ = {
      Path: "C:\\uv",
      SystemRoot: "C:\\Windows",
      https_proxy: "http://proxy.example:3128",
      SSL_CERT_FILE: "/etc/company.pem",
      Gh_Token: "secret",
    }

    const { env } = bridgeCommand(environ, "C:\\studio")

    expect(Object.keys(env).sort()).toEqual([
      "Path",
      "SSL_CERT_FILE",
      "SystemRoot",
      "https_proxy",
    ])
  })

  test("runs the locked bridge through uv, isolated from uv's and Python's settings", () => {
    const { command, args } = bridgeCommand({}, "/studio")

    expect(command).toBe("uv")
    expect(args).toEqual(
      expect.arrayContaining(["--locked", "--no-config", "--no-dev", "-I"])
    )
  })

  test("runs the bridge on the Python in PYBODN_PYTHON instead, isolated", () => {
    const { command, args } = bridgeCommand(
      { PYBODN_PYTHON: "/opt/py/bin/python" },
      "/studio"
    )

    expect(command).toBe("/opt/py/bin/python")
    expect(args).toEqual(["-I", "/studio/bridge/bridge.py"])
  })
})
