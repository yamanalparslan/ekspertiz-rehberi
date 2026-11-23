import { useRef, useState } from "react";
import { CONSENT_DISCLAIMER, CONSENT_TRANSFER, DISCLAIMER, ERROR_MESSAGES } from "@/lib/copy";
import { checkSelection } from "@/lib/client/files";
import { CameraIcon, FileIcon } from "./icons";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.9375rem] font-bold text-white tabular-nums"
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Consent(props: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-rule px-3 py-3 has-[:checked]:border-action has-[:checked]:bg-field">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-0.5 size-6 shrink-0 cursor-pointer accent-action"
      />
      <span className="font-semibold">{props.children}</span>
    </label>
  );
}

function selectionText(files: File[]): string {
  const pdfs = files.filter((f) => f.type === "application/pdf").length;
  const images = files.length - pdfs;
  return [images > 0 ? `${images} fotoğraf` : null, pdfs > 0 ? `${pdfs} PDF` : null]
    .filter(Boolean)
    .join(" ve ")
    .concat(" eklendi");
}

/**
 * Açılış ekranının tek işi: iki onaydan sonra rapor sayfalarını yüklemek.
 * Seçilen dosyalar yalnızca bileşen belleğinde durur.
 */
export function UploadForm({ onStart }: { onStart: (files: File[]) => void }) {
  const [disclaimerOk, setDisclaimerOk] = useState(false);
  const [transferOk, setTransferOk] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const agreed = disclaimerOk && transferOk;
  const selection = checkSelection(files);
  const ready = agreed && selection === "ok";

  const add = (input: HTMLInputElement) => {
    const list = input.files ? Array.from(input.files) : [];
    if (list.length > 0) setFiles((f) => [...f, ...list]);
    input.value = ""; // aynı dosya yeniden seçilebilsin
  };

  const pickButton =
    "flex min-h-14 items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-action bg-paper px-4 text-lg font-bold text-action hover:bg-field disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-soft disabled:hover:bg-paper";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onStart(files);
      }}
      className="space-y-8"
    >
      <Step n={1} title="Önce onaylayın">
        <div className="mt-3 rounded-xl bg-field px-4 py-3.5">
          <h3 className="font-bold">Sorumluluk notu</h3>
          <p className="mt-1">{DISCLAIMER}</p>
        </div>
        <div className="mt-3 space-y-2.5">
          <Consent checked={disclaimerOk} onChange={setDisclaimerOk}>
            {CONSENT_DISCLAIMER}
          </Consent>
          <Consent checked={transferOk} onChange={setTransferOk}>
            {CONSENT_TRANSFER}
          </Consent>
        </div>
      </Step>

      <Step n={2} title="Rapor sayfalarını ekleyin">
        <p className="mt-1 text-ink-soft">
          Her sayfayı ayrı, düz ve okunaklı çekin. En fazla 25 fotoğraf veya 1 PDF, toplam 20 MB.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button type="button" disabled={!agreed} onClick={() => cameraRef.current?.click()} className={pickButton}>
            <CameraIcon className="size-6" />
            Fotoğraf çek
          </button>
          <button type="button" disabled={!agreed} onClick={() => pickerRef.current?.click()} className={pickButton}>
            <FileIcon className="size-6" />
            Dosya seç
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
        {files.length > 0 && (
          <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-field px-4 py-2">
            <p className="font-semibold" aria-live="polite">
              {selectionText(files)}
            </p>
            <button
              type="button"
              onClick={() => setFiles([])}
              className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-action underline underline-offset-[3px] hover:bg-paper"
            >
              Temizle
            </button>
          </div>
        )}
        {selection === "invalid" && (
          <p role="alert" className="mt-2 font-semibold text-dikkat">
            {ERROR_MESSAGES.upload_invalid}
          </p>
        )}
      </Step>

      <div>
        <button
          type="submit"
          disabled={!ready}
          className="min-h-16 w-full rounded-xl bg-action px-5 text-xl font-bold text-white hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-soft"
        >
          Raporu yükle
        </button>
        {!agreed ? (
          <p className="mt-2 text-center text-ink-soft">Yüklemek için iki kutuyu da işaretleyin.</p>
        ) : selection === "empty" ? (
          <p className="mt-2 text-center text-ink-soft">Önce rapor sayfalarını ekleyin.</p>
        ) : null}
        <p className="mt-4 text-[0.9375rem] text-ink-soft">
          Fotoğraflar telefonunuzda küçültülür ve yalnızca analiz için gönderilir. Dosyalarınız ve sonuç
          sunucuda saklanmaz; sayfayı kapatınca sonuç kaybolur.
        </p>
      </div>
    </form>
  );
}
