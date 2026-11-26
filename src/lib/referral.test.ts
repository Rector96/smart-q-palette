import { describe, expect, it } from "vitest";
import {
  captureReferralFromSearch,
  getFirstName,
  getSavedReferralAttribution,
} from "./referral";

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

describe("referral attribution", () => {
  it("stores link referral codes for 30 days and reads them after navigation", () => {
    const storage = createStorage();
    const captured = captureReferralFromSearch("?ref=chidi24&utm_source=instagram", storage, 1000);

    expect(captured).toMatchObject({ code: "CHIDI24", source: "link", expiresAt: 1000 + 30 * 24 * 60 * 60 * 1000 });
    expect(getSavedReferralAttribution(storage, 2000)).toEqual(captured);
  });

  it("ignores malformed and expired referral codes", () => {
    const storage = createStorage();
    expect(captureReferralFromSearch("?ref=bad!", storage)).toBeNull();
    storage.setItem("rockcbt_referral_attribution", JSON.stringify({
      code: "CHIDI24",
      source: "link",
      expiresAt: 10,
    }));

    expect(getSavedReferralAttribution(storage, 11)).toBeNull();
  });
});

describe("first-name privacy", () => {
  it("keeps only a clean first name", () => {
    expect(getFirstName("Ada Lovelace")).toBe("Ada");
    expect(getFirstName("  John-Doe 99")).toBe("John-Doe");
    expect(getFirstName("")).toBe("");
  });
});
