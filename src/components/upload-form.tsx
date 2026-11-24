"use client";

import { useRef } from "react";
import { MAX_IMAGES } from "@/lib/client/files";
import { failedMessage, type SelectedItem, type SelectionState } from "@/lib/client/selection";
import { CONSENT_DISCLAIMER, CONSENT_TRANSFER, DISCLAIMER, PROVIDER_NOTES, type ProviderId } from "@/lib/copy";
import { CameraIcon, CloseIcon, FileIcon, Spinner, WarnIcon } from "./icons";

export type Consents = { disclaimer: boolean; transfer: boolean };

const CONSENT_HINT_ID = "onay-ipucu";
const UPLOAD_HINT_ID = "yukleme-ipucu";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.9375rem] font-bold text-paper tabular-nums"
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Consent(props: { checked: boolean; onChange: (v: boolean) => void; children: string; note?: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-rule px-3 py-3 has-[:checked]:border-action has-[:checked]:bg-field">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-0.5 size-6 shrink-0 cursor-pointer accent-action"
      />
      <span>
        <span className="block font-semibold">{props.children}</span>
        {props.note && <span className="mt-1 block text-[0.9375rem] text-ink-soft">{props.note}</span>}
      </span>
    </label>
  );
}

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** Seçilen sayfanın küçük resmi: sayfa numarası, durum ve kaldır düğmesi. */
function Thumb(props: { item: SelectedItem; page: number | null; onRemove: () => void }) {
  const { item, page } = props;
  const name = page !== null ? `${page}. sayfa` : item.kind === "pdf" ? "PDF" : item.file.name;
  const failed = item.status === "failed";
  return (
    <li className="relative">
      <div
        className={`relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-lg border-[1.5px] ${
          failed ? "border-dikkat-bar bg-dikkat-tint" : "border-rule bg-field"
        }`}
      >
        {item.thumbUrl ? (
          // Küçük resim tarayıcıda üretilen blob: adresidir; next/image gerekmez.
          <img src={item.thumbUrl} alt={name} className="size-full object-cover" />
        ) : item.status === "preparing" ? (
          <>
            <Spinner className="size-6 text-ink-soft" />
            <span className="sr-only">{name} hazırlanıyor</span>
          </>
        ) : failed ? (
          <span className="flex flex-col items-center gap-1 px-1 text-center text-[0.8125rem] leading-tight font-bold text-dikkat">
            <WarnIcon className="size-6" />
            {item.failure === "type" ? "Desteklenmiyor" : "Okunamadı"}
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-center text-[0.8125rem] leading-tight font-semibold text-ink-soft">
            <FileIcon className="size-7" />
            PDF
            <span className="font-normal tabular-nums">{sizeText(item.file.size)}</span>
          </span>
        )}
        {page !== null && (
          <span className="absolute bottom-1 left-1 rounded-md bg-paper/90 px-1.5 text-[0.8125rem] font-bold text-ink tabular-nums">
            {page}
          </span>
        )}
      </div>
      {failed && <p className="mt-1 truncate text-[0.8125rem] text-dikkat">{item.file.name}</p>}
      <button
        type="button"
        data-kaldir=""
        onClick={props.onRemove}
        aria-label={`${failed ? item.file.name : name} kaldır`}
        className="absolute -top-2 -right-2 flex size-11 items-center justify-center rounded-full"
      >
        <span className="flex size-7 items-center justify-center rounded-full border-[1.5px] border-rule bg-paper text-ink shadow-sm">
          <CloseIcon className="size-4" />
        </span>
      </button>
    </li>
  );
}

function selectionLine(items: readonly SelectedItem[]): string {
  const pdf = items.some((i) => i.kind === "pdf");
  const images = items.filter((i) => i.kind === "image").length;
  if (pdf && images === 0) return "PDF eklendi";
  return images > MAX_IMAGES ? `${items.length} sayfa eklendi (en fazla ${MAX_IMAGES})` : `${items.length} sayfa eklendi`;
}

/**
 * Açılış ekranının tek işi: iki onaydan sonra rapor sayfalarını yüklemek. Seçilen sayfalar
 * küçük resimleriyle, numaralı ve tek tek kaldırılabilir gösterilir; sonradan sayfa eklenebilir.
 * Seçim ve onaylar çağıranın belleğinde durur (hata sonrası yükleme ekranına dönünce kaybolmaz).
 */
export function UploadForm(props: {
  provider: ProviderId | null;
  consents: Consents;
  onConsentsChange: (c: Consents) => void;
  items: readonly SelectedItem[];
  selection: SelectionState;
  onAdd: (files: File[]) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onStart: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { consents, items, selection } = props;

  const agreed = consents.disclaimer && consents.transfer;
  const ready = agreed && selection.kind === "ok";

  const add = (input: HTMLInputElement) => {
    const list = input.files ? Array.from(input.files) : [];
    if (list.length > 0) props.onAdd(list);
    input.value = ""; // aynı dosya yeniden seçilebilsin
  };

  /** Kaldırınca odak kaybolmasın: sıradaki (ya da önceki) sayfanın kaldır düğmesine, yoksa kamera düğmesine. */
  const remove = (index: number, id: number) => {
    props.onRemove(id);
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-kaldir]");
      const target = buttons && buttons.length > 0 ? buttons[Math.min(index, buttons.length - 1)] : null;
      (target ?? cameraButton.current)?.focus();
    });
  };

  let page = 0;
  const pages = items.map((it) => (it.kind === "image" ? ++page : null));

  const pickButton =
    "flex min-h-14 items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-action bg-paper px-4 text-lg font-bold text-action hover:bg-field disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-paper";

  const hint = !agreed
    ? "Yüklemek için iki kutuyu da işaretleyin."
    : selection.kind === "empty"
      ? "Önce rapor sayfalarını ekleyin."
      : selection.kind === "preparing"
        ? `Fotoğraflar hazırlanıyor: ${selection.done}/${selection.total}`
        : selection.kind === "failed" || selection.kind === "invalid"
          ? "Yüklemeden önce yukarıdaki sorunu giderin."
          : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) props.onStart();
      }}
      className="space-y-8"
    >
      <Step n={1} title="Önce onaylayın">
        <div className="mt-3 rounded-xl bg-field px-4 py-3.5">
          <h3 className="font-bold">Sorumluluk notu</h3>
          <p className="mt-1">{DISCLAIMER}</p>
        </div>
        <div className="mt-3 space-y-2.5">
          <Consent
            checked={consents.disclaimer}
            onChange={(v) => props.onConsentsChange({ ...consents, disclaimer: v })}
          >
            {CONSENT_DISCLAIMER}
          </Consent>
          <Consent
            checked={consents.transfer}
            onChange={(v) => props.onConsentsChange({ ...consents, transfer: v })}
            note={PROVIDER_NOTES[props.provider ?? "none"]}
          >
            {CONSENT_TRANSFER}
          </Consent>
        </div>
      </Step>

      <Step n={2} title="Rapor sayfalarını ekleyin">
        <p className="mt-1 text-ink-soft">
          Her sayfayı ayrı, düz ve okunaklı çekin; galerideki fotoğrafları da seçebilirsiniz. En fazla 25 fotoğraf
          veya 1 PDF, toplam 20 MB.
        </p>
        {!agreed && (
          <p id={CONSENT_HINT_ID} className="mt-2 font-semibold">
            Sayfa eklemek için önce iki kutuyu da işaretleyin.
          </p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            ref={cameraButton}
            type="button"
            disabled={!agreed}
            aria-describedby={!agreed ? CONSENT_HINT_ID : undefined}
            onClick={() => cameraRef.current?.click()}
            className={pickButton}
          >
            <CameraIcon className="size-6" />
            {items.length > 0 ? "Bir sayfa daha çek" : "Fotoğraf çek"}
          </button>
          <button
            type="button"
            disabled={!agreed}
            aria-describedby={!agreed ? CONSENT_HINT_ID : undefined}
            onClick={() => pickerRef.current?.click()}
            className={pickButton}
          >
            <FileIcon className="size-6" />
            Galeriden veya dosyadan seç
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => add(e.currentTarget)}
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => add(e.currentTarget)}
        />

        {items.length > 0 && (
          <div className="mt-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <p className="font-semibold" aria-live="polite">
                {selectionLine(items)}
              </p>
              <button
                type="button"
                onClick={props.onClear}
                className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-action underline underline-offset-[3px] hover:bg-field"
              >
                Tümünü kaldır
              </button>
            </div>
            <ul ref={listRef} aria-label="Seçilen sayfalar" className="mt-2 grid grid-cols-4 gap-x-2.5 gap-y-3 sm:grid-cols-6">
              {items.map((it, i) => (
                <Thumb key={it.id} item={it} page={pages[i]} onRemove={() => remove(i, it.id)} />
              ))}
            </ul>
          </div>
        )}

        <div aria-live="polite">
          {selection.kind === "failed" && (
            <p className="mt-3 rounded-lg border-l-[6px] border-dikkat-bar bg-dikkat-tint px-3 py-2.5 font-semibold text-dikkat">
              {failedMessage(selection.names)}
            </p>
          )}
          {selection.kind === "invalid" && (
            <p className="mt-3 rounded-lg border-l-[6px] border-dikkat-bar bg-dikkat-tint px-3 py-2.5 font-semibold text-dikkat">
              {selection.message}
            </p>
          )}
          {selection.kind === "ok" && selection.fewPages && (
            <p className="mt-3 rounded-lg border-l-[6px] border-kronik-bar bg-kronik-tint px-3 py-2.5 font-semibold text-kronik">
              Yalnız {selection.images} sayfa seçtiniz. Ekspertiz raporları çoğunlukla 15–20 sayfadır; eksik sayfadaki
              bölümler değerlendirilemez. Tüm sayfaları ekleyebilir ya da böyle devam edebilirsiniz.
            </p>
          )}
        </div>
      </Step>

      <div>
        <button
          type="submit"
          disabled={!ready}
          aria-describedby={hint ? UPLOAD_HINT_ID : undefined}
          className="min-h-16 w-full rounded-xl bg-action px-5 text-xl font-bold text-on-action hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-soft"
        >
          Raporu yükle
        </button>
        {hint && (
          <p id={UPLOAD_HINT_ID} className="mt-2 text-center text-ink-soft tabular-nums">
            {hint}
          </p>
        )}
        <p className="mt-4 text-[0.9375rem] text-ink-soft">
          Fotoğraflar telefonunuzda küçültülür ve yalnızca analiz için gönderilir. Dosyalarınız ve sonuç sunucuda
          saklanmaz; sayfayı kapatınca sonuç kaybolur.
        </p>
      </div>
    </form>
  );
}
