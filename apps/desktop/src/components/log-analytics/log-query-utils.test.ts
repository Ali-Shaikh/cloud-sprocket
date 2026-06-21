import { describe, expect, it } from "vitest";

import { csvEscapeCell, formatCellValue, resultToCsv, resultToJson } from "./log-query-utils";

describe("log-query-utils", () => {
  it("quotes CSV cells containing commas, quotes, or newlines", () => {
    expect(csvEscapeCell("plain")).toBe("plain");
    expect(csvEscapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscapeCell("a,b")).toBe('"a,b"');
    expect(csvEscapeCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("serialises a result set to CSV with a header row", () => {
    expect(resultToCsv(["Col"], [["x"]])).toBe("Col\nx");
    expect(resultToCsv(["A", "B"], [["1", "2,3"]])).toBe('A,B\n1,"2,3"');
  });

  it("serialises rows to JSON records", () => {
    const json = resultToJson(["Level"], [["Info"]]);
    expect(JSON.parse(json)).toEqual([{ Level: "Info" }]);
  });

  it("pretty-prints JSON-looking cells", () => {
    const formatted = formatCellValue('{"matches":[{"name":"q"}]}');
    expect(formatted.kind).toBe("json");
    expect(formatted.display).toContain('"matches"');
  });

  it("falls back to raw text for invalid JSON", () => {
    const formatted = formatCellValue("{not json");
    expect(formatted.kind).toBe("text");
    expect(formatted.display).toBe("{not json");
  });
});