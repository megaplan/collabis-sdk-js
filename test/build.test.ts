import { describe, expect, it } from "vitest"
import { block, link, richText, text } from "../src/build"

describe("richText normalization", () => {
  it("wraps a non-empty string", () => {
    expect(richText("hi")).toEqual([{ text: "hi" }])
  })
  it("maps an empty string to empty rich text", () => {
    expect(richText("")).toEqual([])
  })
  it("passes through a single item and an array", () => {
    expect(richText({ text: "x" })).toEqual([{ text: "x" }])
    expect(richText([{ text: "a" }, { text: "b" }])).toEqual([{ text: "a" }, { text: "b" }])
  })
})

describe("rich-text runs", () => {
  it("text() attaches annotations only when given", () => {
    expect(text("plain")).toEqual({ text: "plain" })
    expect(text("bold", { bold: true })).toEqual({ text: "bold", annotations: { bold: true } })
  })
  it("link() sets the url", () => {
    expect(link("Collabis", "https://collabis.ru")).toEqual({
      text: "Collabis",
      link: { url: "https://collabis.ru" },
    })
  })
})

describe("block builders", () => {
  it("paragraph", () => {
    expect(block.paragraph("hello")).toEqual({
      type: "paragraph",
      paragraph: { rich_text: [{ text: "hello" }] },
    })
  })

  it("heading with is_toggleable and children", () => {
    expect(
      block.heading2("Agenda", { is_toggleable: true, children: [block.paragraph("x")] }),
    ).toEqual({
      type: "heading_2",
      heading_2: { rich_text: [{ text: "Agenda" }], is_toggleable: true },
      children: [{ type: "paragraph", paragraph: { rich_text: [{ text: "x" }] } }],
    })
  })

  it("to_do with checked", () => {
    expect(block.toDo("ship it", { checked: true })).toEqual({
      type: "to_do",
      to_do: { rich_text: [{ text: "ship it" }], checked: true },
    })
  })

  it("numbered list item with start", () => {
    expect(block.numberedListItem("first", { start: 3 })).toEqual({
      type: "numbered_list_item",
      numbered_list_item: { rich_text: [{ text: "first" }], start: 3 },
    })
  })

  it("code with language", () => {
    expect(block.code("print(1)", { language: "python" })).toEqual({
      type: "code",
      code: { rich_text: [{ text: "print(1)" }], language: "python" },
    })
  })

  it("divider and equation", () => {
    expect(block.divider()).toEqual({ type: "divider", divider: {} })
    expect(block.equation("e=mc^2")).toEqual({
      type: "equation",
      equation: { expression: "e=mc^2" },
    })
  })

  it("callout wraps text in a body paragraph", () => {
    expect(block.callout("heads up", { icon: "⚠️" })).toEqual({
      type: "callout",
      callout: { icon: "⚠️" },
      children: [{ type: "paragraph", paragraph: { rich_text: [{ text: "heads up" }] } }],
    })
  })

  it("bookmark", () => {
    expect(block.bookmark("https://x.dev", { title: "X" })).toEqual({
      type: "bookmark",
      bookmark: { url: "https://x.dev", title: "X" },
    })
  })

  it("table builds table_row children and infers width", () => {
    expect(
      block.table(
        [
          ["A", "B"],
          ["c", "d"],
        ],
        { has_column_header: true },
      ),
    ).toEqual({
      type: "table",
      table: { table_width: 2, has_column_header: true },
      children: [
        { type: "table_row", table_row: { cells: [[{ text: "A" }], [{ text: "B" }]] } },
        { type: "table_row", table_row: { cells: [[{ text: "c" }], [{ text: "d" }]] } },
      ],
    })
  })

  it("columnList wraps each column's blocks", () => {
    const built = block.columnList([block.paragraph("left")], [block.paragraph("right")])
    expect(built.type).toBe("column_list")
    expect(built.children).toHaveLength(2)
    expect(built.children![0]).toEqual({
      type: "column",
      children: [{ type: "paragraph", paragraph: { rich_text: [{ text: "left" }] } }],
    })
  })
})
