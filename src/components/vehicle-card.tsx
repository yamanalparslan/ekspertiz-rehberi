"use client";

import { useId, useRef, useState } from "react";
import { ERROR_MESSAGES, REINTERPRET_USED } from "@/lib/copy";
import { FUEL_LABELS, TRANSMISSION_LABELS, engineText, formatKm, powerText, vehicleTitle } from "@/lib/client/format";
import type { PendingCorrection } from "@/lib/client/run-state";
import type { VehicleInferred } from "@/lib/schema/extraction";
import type { Vehicle } from "@/lib/schema/result";
import { CorrectionForm } from "./correction-form";
import { Badge } from "./result/badges";

const UNREAD = "Okunamadı";

/** Tahmini değerlerin açıklaması (raporda basılı değil). */
export const INFERRED_HINT = "Raporda yazmıyor; model adından tahmin edildi.";

function Spec({ label, value, inferred }: { label: string; value: string | null; inferred?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.9375rem] text-ink-soft">{label}</dt>
      <dd className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold tabular-nums ${value === null ? "text-ink-soft" : ""}`}>
        {value ?? UNREAD}
        {value !== null && inferred && <Badge tone="plain">tahmini</Badge>}
      </dd>
    </div>
  );
}

/**
 * Okunan araç bilgisi. Tahmin edilen alanlar (`inferred`) "tahmini" etiketi taşır; tahmini
 * motor hacmi kesin cc yerine yaklaşık litre gösterilir. `onCorrect` verilirse "Düzelt" formu
 * açılabilir; `correctDisabled` iken (analiz sürerken) düğme pasiftir. `used` düzeltme hakkının
 * kullanıldığını, `correction` sunucunun reddettiği düzeltmeyi (form yazılanlarla yeniden açılır)
 * bildirir.
 */
export function VehicleCard(props: {
  vehicle: Vehicle;
  inferred?: VehicleInferred | null;
  onCorrect?: (v: Vehicle) => void;
  correctDisabled?: boolean;
  used?: boolean;
  correction?: PendingCorrection | null;
  onDismissCorrection?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const hintId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const v = props.vehicle;
  const inf = props.inferred ?? {};
  const anyInferred =
    (inf.engineCc && v.engineCc !== null) || (inf.powerHp && v.powerHp !== null) || (inf.fuel && v.fuel !== null);
  const correctable = props.onCorrect !== undefined && !props.used;
  const open = correctable && !props.correctDisabled && (editing || props.correction != null);

  const close = () => {
    setEditing(false);
    props.onDismissCorrection?.();
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <section aria-labelledby="arac-baslik" className="rounded-2xl border-[1.5px] border-rule px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="arac-baslik" className="text-[0.9375rem] font-bold text-ink-soft">
            Araç bilgileri
          </h2>
          <p className="mt-0.5 text-[1.625rem] leading-tight font-bold tracking-tight">{vehicleTitle(v)}</p>
        </div>
        {correctable && !open && (
          <button
            ref={buttonRef}
            type="button"
            disabled={props.correctDisabled}
            aria-describedby={props.correctDisabled ? hintId : undefined}
            onClick={() => setEditing(true)}
            className="min-h-12 shrink-0 rounded-xl border-[1.5px] border-action px-4 font-bold text-action hover:bg-field disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-transparent"
          >
            Düzelt
          </button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Spec label="Kilometre" value={v.km === null ? null : formatKm(v.km)} />
        <Spec
          label="Motor hacmi"
          value={v.engineCc === null ? null : engineText(v.engineCc, inf.engineCc === true)}
          inferred={inf.engineCc}
        />
        <Spec
          label="Motor gücü"
          value={v.powerHp === null ? null : powerText(v.powerHp, inf.powerHp === true)}
          inferred={inf.powerHp}
        />
        <Spec label="Yakıt" value={v.fuel === null ? null : FUEL_LABELS[v.fuel]} inferred={inf.fuel} />
        <Spec label="Vites" value={v.transmission === null ? null : TRANSMISSION_LABELS[v.transmission]} />
      </dl>
      {anyInferred && (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
          <Badge tone="plain">tahmini</Badge> {INFERRED_HINT}
        </p>
      )}
      {correctable && props.correctDisabled && !open && (
        <p id={hintId} className="mt-3 text-[0.9375rem] text-ink-soft">
          Analiz bitince araç bilgisini düzeltebilirsiniz.
        </p>
      )}
      {props.used && <p className="mt-3 text-ink-soft">{REINTERPRET_USED}</p>}
      {open && (
        <CorrectionForm
          key={props.correction ? JSON.stringify(props.correction.draft) : "duzelt"}
          vehicle={props.correction?.draft ?? v}
          inferred={props.inferred ?? null}
          serverError={props.correction ? ERROR_MESSAGES[props.correction.code] : undefined}
          onCancel={close}
          onSubmit={(fixed) => {
            setEditing(false);
            props.onCorrect?.(fixed);
          }}
        />
      )}
    </section>
  );
}
