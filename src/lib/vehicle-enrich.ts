import type { RawExtraction, VehicleInferred } from "@/lib/schema/extraction";

type Vehicle = RawExtraction["vehicle"];

// Varyant/model adındaki hacim etiketi -> yaklaşık cc (yalnız görüntü için, "tahmini").
const DISPLACEMENT_MAP: Record<string, number> = {
  "0.9": 898,
  "1.0": 998,
  "1.1": 1086,
  "1.2": 1197,
  "1.25": 1248,
  "1.3": 1332,
  "1.4": 1368,
  "1.5": 1461,
  "1.6": 1598,
  "1.8": 1798,
  "2.0": 1984,
};
const DISPLACEMENT_RE = /(?:^|[^0-9.])(0\.9|1\.0|1\.1|1\.25|1\.2|1\.3|1\.4|1\.5|1\.6|1\.8|2\.0)(?![0-9])/;
const HP_RE = /(?:^|[^0-9])(\d{2,3})\s*(?:hp|bg|ps|beygir)(?![a-z])/;
const KW_RE = /(?:^|[^0-9])(\d{2,3})\s*kw(?![a-z])/;
const KW_TO_HP = 1.36;

// Motor ailesi adları -> yakıt. Çelişki varsa tahmin edilmez.
const FUEL_HINTS: [RegExp, NonNullable<Vehicle["fuel"]>][] = [
  [/\b(tdi|crdi|dci|hdi|bluehdi|tdci|cdti|multijet|mjet|jtd|d-4d|ddis|dizel|diesel)\b/, "dizel"],
  [/\b(tsi|tfsi|tce|ecoboost|puretech|mpi|t-gdi|gdi|vtec|fire|t-jet|e-torq|valvematic|cvvt|d-cvvt|benzin|benzinli)\b/, "benzin"],
  [/\b(hybrid|hibrit|hev)\b/, "hibrit"],
  [/\b(lpg)\b/, "lpg"],
];

/**
 * Raporda basılı OLMAYAN motor hacmi, güç ve yakıtı yalnız marka/model/varyant metninden
 * tahmin eder ve bunları `inferred` ile işaretler. Basılı değerler ve model adı asla
 * değişmez; ekspertiz notları kullanılmaz. kW yalnız birim açıkça yazıyorsa HP'ye çevrilir.
 */
export function enrichVehicle(input: Vehicle): { vehicle: Vehicle; inferred: VehicleInferred } {
  const v: Vehicle = { ...input };
  const inferred: VehicleInferred = {};
  const text = `${v.model ?? ""} ${v.variant ?? ""}`.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");

  if (v.fuel === null) {
    const hits = new Set(FUEL_HINTS.filter(([re]) => re.test(text)).map(([, f]) => f));
    // Hibrit araçlarda benzin ipucu da olur (ör. "1.8 Hybrid VVT-i"): hibrit kazanır.
    if (hits.has("hibrit")) hits.delete("benzin");
    if (hits.size === 1) {
      v.fuel = [...hits][0];
      inferred.fuel = true;
    }
  }

  if (v.engineCc === null && v.fuel !== "elektrik") {
    const m = DISPLACEMENT_RE.exec(text);
    if (m && DISPLACEMENT_MAP[m[1]]) {
      v.engineCc = DISPLACEMENT_MAP[m[1]];
      inferred.engineCc = true;
    }
  }

  if (v.powerHp === null) {
    const hp = HP_RE.exec(text);
    const kw = hp ? null : KW_RE.exec(text);
    const value = hp ? Number(hp[1]) : kw ? Math.round(Number(kw[1]) * KW_TO_HP) : null;
    if (value !== null && value >= 40 && value <= 700) {
      v.powerHp = value;
      inferred.powerHp = true;
    }
  }

  return { vehicle: v, inferred };
}

/**
 * Yeniden yorumlamada kullanıcı aracı düzeltebilir: tahmini işaret yalnız değer
 * değişmeden geldiyse korunur (değiştirilen değer kullanıcının beyanıdır).
 */
export function carryInferred(
  before: Vehicle,
  inferred: VehicleInferred | undefined,
  after: Vehicle,
): VehicleInferred | undefined {
  if (!inferred) return undefined;
  const out: VehicleInferred = {};
  if (inferred.engineCc && after.engineCc === before.engineCc) out.engineCc = true;
  if (inferred.powerHp && after.powerHp === before.powerHp) out.powerHp = true;
  if (inferred.fuel && after.fuel === before.fuel) out.fuel = true;
  return Object.keys(out).length > 0 ? out : undefined;
}
