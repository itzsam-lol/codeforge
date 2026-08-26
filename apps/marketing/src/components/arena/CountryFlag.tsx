import { countryName, flagUrl } from "@/lib/countries";

/** Renders nothing if `code` doesn't match a known flag — callers don't
 *  need their own null-check before using this. */
export function CountryFlag({ code, className }: { code: string | null | undefined; className?: string }) {
  const url = flagUrl(code);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={countryName(code) ?? ""} className={className ?? "h-3.5 w-5 rounded-[2px] object-cover"} />;
}
