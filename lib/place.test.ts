import { describe, expect, test } from "vitest"

import {
  addressOf,
  placeAfterLeaving,
  placeOf,
  settle,
  shownId,
  toNamespace,
  toView,
} from "./place"

const alice = {
  namespace: "user:alice",
  view: "archived",
  query: "Lisbon & co",
  id: "3f9a",
} as const

describe("the address", () => {
  test("gives back the place it was made from", () => {
    const address = addressOf(alice)

    expect(placeOf(new URLSearchParams(address))).toEqual(alice)
  })

  test("leaves out what is at its start, so a fresh Studio has a bare address", () => {
    const start = placeOf(new URLSearchParams(""))

    expect(start).toEqual({
      namespace: null,
      view: "active",
      query: "",
      id: null,
    })
    expect(addressOf(start)).toBe("")
  })

  test("a tab Studio does not have, or an empty value, counts as not given", () => {
    const place = placeOf(new URLSearchParams("ns=&view=deleted&id="))

    expect(place).toEqual({
      namespace: null,
      view: "active",
      query: "",
      id: null,
    })
  })
})

describe("moving around", () => {
  test("another namespace starts on Active, with no search and no memory picked", () => {
    expect(toNamespace("user:bob")).toEqual({
      namespace: "user:bob",
      view: "active",
      query: "",
      id: null,
    })
  })

  test("another tab keeps the search and drops the memory picked in the old one", () => {
    expect(toView(alice, "expired")).toEqual({
      ...alice,
      view: "expired",
      id: null,
    })
  })
})

describe("settling the place on the namespaces in the file", () => {
  test("a namespace that is there stays as it is", () => {
    expect(settle(alice, ["user:alice", "user:bob"])).toBe(alice)
  })

  test("a namespace that is gone gives way to the first, opened from its start", () => {
    expect(settle(alice, ["agent:planner", "user:bob"])).toEqual(
      toNamespace("agent:planner")
    )
  })

  test("with no namespace named, the first one opens", () => {
    const place = placeOf(new URLSearchParams("view=expired"))

    expect(settle(place, ["agent:planner"]).namespace).toBe("agent:planner")
  })

  test("an empty file has no namespace to open", () => {
    expect(settle(alice, [])).toEqual({
      namespace: null,
      view: "active",
      query: "",
      id: null,
    })
  })
})

describe("the place once the memory shown leaves its tab", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }]

  test("on a wide screen, the next memory takes its place, or the one before at the end", () => {
    expect(placeAfterLeaving(alice, rows, "b", true).id).toBe("c")
    expect(placeAfterLeaving(alice, rows, "c", true).id).toBe("b")
  })

  test("a memory the rows did not list gives way to the first row", () => {
    expect(placeAfterLeaving(alice, rows, "z", true).id).toBe("a")
  })

  test("the last memory of a tab leaves none picked", () => {
    expect(placeAfterLeaving(alice, [{ id: "a" }], "a", true).id).toBeNull()
  })

  test("on a narrow screen, the list comes back instead, in the same tab and search", () => {
    expect(placeAfterLeaving(alice, rows, "b", false)).toEqual({
      ...alice,
      id: null,
    })
  })
})

describe("the memory the other pane shows", () => {
  const rows = [{ id: "a1" }, { id: "3f9a" }]

  test("is the one picked", () => {
    expect(shownId(alice, rows, false)).toBe("3f9a")
  })

  test("is none while a search leaves the one picked out, so clearing it brings it back", () => {
    expect(shownId(alice, [{ id: "a1" }], true)).toBeNull()
  })

  test("stays the one picked when the tab no longer lists it, as after another program archived it", () => {
    expect(shownId(alice, [{ id: "a1" }], false)).toBe("3f9a")
  })

  test("stays the one picked while the rows are being read", () => {
    expect(shownId(alice, undefined, true)).toBe("3f9a")
  })

  test("is the first row when none is picked, and none when there are no rows", () => {
    expect(shownId({ ...alice, id: null }, rows, false)).toBe("a1")
    expect(shownId({ ...alice, id: null }, [], true)).toBeNull()
    expect(shownId({ ...alice, id: null }, undefined, false)).toBeNull()
  })
})
