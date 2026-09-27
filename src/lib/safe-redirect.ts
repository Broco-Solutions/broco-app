/** Returns an internal App Router path or the safe application root. */
export function safeInternalRedirect(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "https://broco.invalid");
    if (url.origin !== "https://broco.invalid" || !url.pathname.startsWith("/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
