import { describe, expect, it } from "vitest";
import { buildResultShareUrl, getOrdinal } from "./resultShare";

describe("result share links", () => {
  it("adds referral attribution and a source-specific UTM tag", () => {
    const url = new URL(buildResultShareUrl(
      "https://rockcbt.example",
      "f0000000-0000-4000-8000-000000000001",
      "CHIDI24",
      "instagram",
    ));

    expect(url.pathname).toBe("/share/f0000000-0000-4000-8000-000000000001");
    expect(url.searchParams.get("ref")).toBe("CHIDI24");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("share_card");
  });

  it("uses a neutral source for the native share sheet", () => {
    const url = new URL(buildResultShareUrl(
      "https://rockcbt.example",
      "f0000000-0000-4000-8000-000000000001",
      "CHIDI24",
      "share",
    ));

    expect(url.searchParams.get("utm_source")).toBe("share");
  });

  it("formats ranking suffixes including the teen exceptions", () => {
    expect(getOrdinal(1)).toBe("1st");
    expect(getOrdinal(3)).toBe("3rd");
    expect(getOrdinal(11)).toBe("11th");
    expect(getOrdinal(22)).toBe("22nd");
  });
});
