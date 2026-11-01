import { BOOK_FONTS } from "@fabulka/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("book fonts on the site", () => {
  it("loads every family and weight the API embeds in the PDF", () => {
    const source = readFileSync(join(__dirname, "book-fonts.ts"), "utf8");
    for (const font of Object.values(BOOK_FONTS)) {
      for (const weight of font.weights) expect(source).toContain(`import "${font.package}/${weight}.css";`);
    }
  });
});
