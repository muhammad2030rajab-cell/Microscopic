/**
 * Display form of a unit string. Catalog units are typed in plain ASCII ("10^3/µL"); a printed lab
 * report should show "10³/µL". Only exponents written as ^n are touched; everything else is as typed.
 */
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺",
};

export function formatUnit(unit: string | undefined | null): string {
  if (!unit) return "";
  return unit.replace(/\^([+-]?\d{1,2})/g, (_m, exp: string) => [...exp].map((c) => SUPERSCRIPT[c] ?? c).join(""));
}
