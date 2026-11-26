const REFERRAL_STORAGE_KEY = "rockcbt_referral_attribution";
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

export interface ReferralAttribution {
  code: string;
  source: "link" | "typed";
  expiresAt: number;
}

export function normalizeReferralCode(value: string | null | undefined): string {
  const code = (value || "").trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : "";
}

export function captureReferralFromSearch(
  search: string,
  storage: Pick<Storage, "setItem"> = window.localStorage,
  now = Date.now(),
): ReferralAttribution | null {
  const params = new URLSearchParams(search);
  const code = normalizeReferralCode(params.get("ref") || params.get("referral"));
  if (!code) return null;

  const attribution: ReferralAttribution = {
    code,
    source: "link",
    expiresAt: now + REFERRAL_TTL_MS,
  };
  storage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
}

export function getSavedReferralAttribution(
  storage: Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">> = window.localStorage,
  now = Date.now(),
): ReferralAttribution | null {
  const saved = storage.getItem(REFERRAL_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("code" in parsed) ||
      !("source" in parsed) ||
      !("expiresAt" in parsed)
    ) {
      storage.removeItem?.(REFERRAL_STORAGE_KEY);
      return null;
    }

    const attribution = parsed as Record<string, unknown>;
    const code = normalizeReferralCode(typeof attribution.code === "string" ? attribution.code : "");
    const expiresAt = typeof attribution.expiresAt === "number" ? attribution.expiresAt : 0;
    if (!code || expiresAt <= now) {
      storage.removeItem?.(REFERRAL_STORAGE_KEY);
      return null;
    }

    return {
      code,
      source: attribution.source === "link" ? "link" : "typed",
      expiresAt,
    };
  } catch {
    storage.removeItem?.(REFERRAL_STORAGE_KEY);
    return null;
  }
}

export function clearSavedReferralAttribution(storage: Pick<Storage, "removeItem"> = window.localStorage): void {
  storage.removeItem(REFERRAL_STORAGE_KEY);
}

export function getFirstName(value: string): string {
  return value
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g, "")
    .slice(0, 32) || "";
}
