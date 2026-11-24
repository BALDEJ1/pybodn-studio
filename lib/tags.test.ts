import { describe, expect, test } from "vitest"

import { splitTyped, withTags } from "./tags"

describe("adding tags", () => {
  test("each tag separated by a comma is added, trimmed, in the order typed", () => {
    expect(withTags(["style"], " food, health ,work")).toEqual([
      "style",
      "food",
      "health",
      "work",
    ])
  })

  test("a tag the memory already has, or one typed twice, is added once", () => {
    expect(withTags(["food"], "food, travel, travel")).toEqual([
      "food",
      "travel",
    ])
  })

  test("empty pieces between commas add nothing", () => {
    expect(withTags(["food"], " , ,, ")).toEqual(["food"])
  })

  test("the tags given are left as they were", () => {
    const tags = ["food"]

    withTags(tags, "travel")

    expect(tags).toEqual(["food"])
  })
})

describe("typing in the tag field", () => {
  test("without a comma, everything is still being typed", () => {
    expect(splitTyped("trav")).toEqual({ done: "", rest: "trav" })
  })

  test("up to the last comma is finished; after it is still being typed", () => {
    expect(splitTyped("food, travel, wo")).toEqual({
      done: "food, travel",
      rest: "wo",
    })
  })

  test("a comma at the end finishes the tag and leaves the field empty", () => {
    expect(splitTyped("food,")).toEqual({ done: "food", rest: "" })
  })

  test("a space after the comma does not start the next tag", () => {
    expect(splitTyped("food, ")).toEqual({ done: "food", rest: "" })
  })
})
