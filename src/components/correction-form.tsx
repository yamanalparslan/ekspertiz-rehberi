"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/client/format";
import { MAX_TEXT, toDraft, validateDraft, type Draft, type DraftKey, type FieldErrors } from "@/lib/client/vehicle-form";
import type { VehicleInferred } from "@/lib/schema/extraction";
import type { Vehicle } from "@/lib/schema/result";

const inputClass =
  "mt-1 block min-h-12 w-full rounded-lg border-[1.5px] bg-paper px-3 text-[1.0625rem] text-ink focus:border-action";

function Label({ htmlFor, children, inferred }: { htmlFor: string; children: string; inferred?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="font-semibold">
      {children}
      {inferred && <span className="ml-1.5 font-normal text-ink-soft">(tahmini)</span>}
    </label>
  );
}

function TextField(props: {
  name: DraftKey;
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  inferred?: boolean;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const errorId = `${id}-hata`;
  const hintId = `${id}-ipucu`;
  const describedBy = [props.error ? errorId : null, props.hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div>
      <Label htmlFor={id} inferred={props.inferred}>
        {props.label}
      </Label>
      <input
        id={id}
        name={props.name}
        type="text"
        inputMode={props.numeric ? "numeric" : "text"}
        autoComplete="off"
        maxLength={props.numeric ? 12 : MAX_TEXT + 10}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${inputClass} ${props.error ? "border-dikkat-bar" : "border-rule"}`}
      />
      {props.error && (
        <p id={errorId} className="mt-1 font-semibold text-dikkat">
          {props.error}
        </p>
      )}
      {props.hint && (
        <p id={hintId} className="mt-1 text-[0.9375rem] text-ink-soft">
          {props.hint}
        </p>
      )}
    </div>
  );
}

function SelectField(props: {
  name: DraftKey;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  inferred?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} inferred={props.inferred}>
        {props.label}
      </Label>
      <select
        id={id}
        name={props.name}
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

/**
 * Araç bilgisi düzeltme formu. Sunucunun reddedeceği her değer (aralık dışı yıl, hacim, güç,
 * km; litre yazılmış hacim; uzun metin) gönderilmeden alanın altında yakalanır. Sunucu yine de
 * reddederse (`serverError`) form kullanıcının yazdıklarıyla açık kalır.
 */
export function CorrectionForm(props: {
  vehicle: Vehicle;
  inferred: VehicleInferred | null;
  serverError?: string;
  onCancel: () => void;
  onSubmit: (v: Vehicle) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(props.vehicle));
  const [tried, setTried] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inf = props.inferred ?? {};

  // Hatalar ilk gönderme denemesinden sonra gösterilir ve yazdıkça güncellenir (taslaktan türetilir).
  const checked = validateDraft(draft, new Date());
  const errors: FieldErrors = tried && "errors" in checked ? checked.errors : {};

  // Hatalı gönderme denemesinden sonra odak ilk hatalı alana gider (mesaj aria-describedby ile okunur).
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const set = (k: DraftKey) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const field = (name: DraftKey, label: string, extra: { numeric?: boolean; inferred?: boolean; hint?: string } = {}) => (
    <TextField name={name} label={label} value={draft[name]} onChange={set(name)} error={errors[name]} {...extra} />
  );

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Araç bilgisini düzelt"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if ("errors" in checked) {
          setAttempt((a) => a + 1);
          return;
        }
        props.onSubmit(checked.vehicle);
      }}
      className="mt-4 border-t border-rule pt-4"
    >
      {props.serverError && (
        <p role="alert" className="mb-4 rounded-lg border-l-[6px] border-dikkat-bar bg-dikkat-tint px-3 py-2.5 font-bold text-dikkat">
          {props.serverError}
        </p>
      )}
      <p className="max-w-prose text-ink-soft">
        Yanlış okunan bilgiyi düzeltin. Rapor yeniden okunmaz, yalnızca maddeler yeniden yorumlanır. Düzeltme hakkı
        bir kez kullanılabilir.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("brand", "Marka")}
        {field("model", "Model")}
        {field("variant", "Paket")}
        {field("year", "Model yılı", { numeric: true })}
        {field("engineCc", "Motor hacmi (cc)", { numeric: true, inferred: inf.engineCc, hint: "Örnek: 1598" })}
        {field("powerHp", "Motor gücü (HP)", { numeric: true, inferred: inf.powerHp })}
        {field("km", "Kilometre", { numeric: true, hint: "Örnek: 135.689" })}
        <SelectField
          name="fuel"
          label="Yakıt"
          value={draft.fuel}
          onChange={set("fuel")}
          options={FUEL_LABELS}
          inferred={inf.fuel}
        />
        <SelectField
          name="transmission"
          label="Vites"
          value={draft.transmission}
          onChange={set("transmission")}
          options={TRANSMISSION_LABELS}
        />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className="min-h-14 rounded-xl bg-action px-5 text-lg font-bold text-on-action hover:bg-action-strong"
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
