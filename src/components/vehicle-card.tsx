"use client";

import { useId, useState } from "react";
import { REINTERPRET_USED } from "@/lib/copy";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatKm, parseWhole, vehicleTitle } from "@/lib/client/format";
import type { Vehicle } from "@/lib/schema/result";

const UNREAD = "Okunamadı";

type Draft = Record<"brand" | "model" | "variant" | "year" | "engineCc" | "powerHp" | "km" | "fuel" | "transmission", string>;
type NumberKey = "year" | "engineCc" | "powerHp" | "km";
const NUMBER_KEYS: readonly NumberKey[] = ["year", "engineCc", "powerHp", "km"];

const toDraft = (v: Vehicle): Draft => ({
  brand: v.brand ?? "",
  model: v.model ?? "",
  variant: v.variant ?? "",
  year: v.year?.toString() ?? "",
  engineCc: v.engineCc?.toString() ?? "",
  powerHp: v.powerHp?.toString() ?? "",
  km: v.km?.toString() ?? "",
  fuel: v.fuel ?? "",
  transmission: v.transmission ?? "",
});

const text = (s: string): string | null => (s.trim() === "" ? null : s.trim());

function fromDraft(d: Draft): Vehicle {
  return {
    brand: text(d.brand),
    model: text(d.model),
    variant: text(d.variant),
    year: parseWhole(d.year),
    engineCc: parseWhole(d.engineCc),
    powerHp: parseWhole(d.powerHp),
    km: parseWhole(d.km),
    fuel: d.fuel === "" ? null : (d.fuel as Vehicle["fuel"]),
    transmission: d.transmission === "" ? null : (d.transmission as Vehicle["transmission"]),
  };
}

function Spec({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.9375rem] text-ink-soft">{label}</dt>
      <dd className={`font-semibold tabular-nums ${value === null ? "text-ink-soft" : ""}`}>{value ?? UNREAD}</dd>
    </div>
  );
}

const inputClass =
  "mt-1 block min-h-12 w-full rounded-lg border-[1.5px] bg-paper px-3 text-[1.0625rem] text-ink focus:border-action";

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  error?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {props.label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={props.numeric ? "numeric" : "text"}
        autoComplete="off"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error || undefined}
        aria-describedby={props.error ? `${id}-hata` : undefined}
        className={`${inputClass} ${props.error ? "border-dikkat-bar" : "border-rule"}`}
      />
      {props.error && (
        <p id={`${id}-hata`} className="mt-1 font-semibold text-dikkat">
          Yalnızca rakam girin.
        </p>
      )}
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="font-semibold">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={`${inputClass} appearance-auto border-rule`}
      >
        <option value="">Bilinmiyor</option>
        {Object.entries(props.options).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CorrectionForm(props: {
  vehicle: Vehicle;
  onCancel: () => void;
  onSubmit: (v: Vehicle) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(props.vehicle));
  const [tried, setTried] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const bad = (k: NumberKey) => tried && draft[k].trim() !== "" && parseWhole(draft[k]) === null;
  const invalid = NUMBER_KEYS.some((k) => draft[k].trim() !== "" && parseWhole(draft[k]) === null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!invalid) props.onSubmit(fromDraft(draft));
      }}
      className="mt-4 border-t border-rule pt-4"
    >
      <p className="max-w-prose text-ink-soft">
        Yanlış okunan bilgiyi düzeltin. Rapor yeniden okunmaz, yalnızca maddeler yeniden yorumlanır.
        Düzeltme hakkı bir kez kullanılabilir.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Marka" value={draft.brand} onChange={set("brand")} />
        <TextField label="Model" value={draft.model} onChange={set("model")} />
        <TextField label="Paket" value={draft.variant} onChange={set("variant")} />
        <TextField label="Model yılı" value={draft.year} onChange={set("year")} numeric error={bad("year")} />
        <TextField label="Motor hacmi (cc)" value={draft.engineCc} onChange={set("engineCc")} numeric error={bad("engineCc")} />
        <TextField label="Motor gücü (HP)" value={draft.powerHp} onChange={set("powerHp")} numeric error={bad("powerHp")} />
        <TextField label="Kilometre" value={draft.km} onChange={set("km")} numeric error={bad("km")} />
        <SelectField label="Yakıt" value={draft.fuel} onChange={set("fuel")} options={FUEL_LABELS} />
        <SelectField label="Vites" value={draft.transmission} onChange={set("transmission")} options={TRANSMISSION_LABELS} />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className="min-h-14 rounded-xl bg-action px-5 text-lg font-bold text-white hover:bg-action-strong"
        >
          Yeniden yorumla
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="min-h-14 rounded-xl border-[1.5px] border-rule px-5 text-lg font-bold text-ink hover:bg-field"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}

/**
 * Okunan araç bilgisi. `correctAction` verilirse "Düzelt" formu açılabilir;
 * `used` ise düzeltme hakkının kullanıldığı gösterilir.
 */
export function VehicleCard(props: {
  vehicle: Vehicle;
  correctAction?: (v: Vehicle) => void;
  used?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const v = props.vehicle;
  const canCorrect = props.correctAction !== undefined && !props.used;

  return (
    <section aria-labelledby="arac-baslik" className="rounded-2xl border-[1.5px] border-rule px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="arac-baslik" className="text-[0.9375rem] font-bold text-ink-soft">
            Araç bilgileri
          </h2>
          <p className="mt-0.5 text-[1.625rem] leading-tight font-bold tracking-tight">{vehicleTitle(v)}</p>
        </div>
        {canCorrect && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-12 shrink-0 rounded-xl border-[1.5px] border-action px-4 font-bold text-action hover:bg-field"
          >
            Düzelt
          </button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Spec label="Kilometre" value={v.km === null ? null : formatKm(v.km)} />
        <Spec label="Motor hacmi" value={v.engineCc === null ? null : `${v.engineCc} cc`} />
        <Spec label="Motor gücü" value={v.powerHp === null ? null : `${v.powerHp} HP`} />
        <Spec label="Yakıt" value={v.fuel === null ? null : FUEL_LABELS[v.fuel]} />
        <Spec label="Vites" value={v.transmission === null ? null : TRANSMISSION_LABELS[v.transmission]} />
      </dl>
      {props.used && <p className="mt-3 text-ink-soft">{REINTERPRET_USED}</p>}
      {canCorrect && editing && (
        <CorrectionForm
          vehicle={v}
          onCancel={() => setEditing(false)}
          onSubmit={(fixed) => {
            setEditing(false);
            props.correctAction?.(fixed);
          }}
        />
      )}
    </section>
  );
}
