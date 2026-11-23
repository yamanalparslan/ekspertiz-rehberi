import { signalDetails } from "@/lib/client/format";
import { qrLink } from "@/lib/client/qr";
import type { Signal } from "@/lib/schema/result";
import { CheckIcon, ExternalIcon, InfoIcon, WarnIcon } from "./icons";

export type QrFound = { url: string; domain: string };

const LEVEL = {
  ok: { Icon: CheckIcon, color: "text-normal", label: "Olumlu işaret:" },
  info: { Icon: InfoIcon, color: "text-action", label: "Bilgi:" },
  warn: { Icon: WarnIcon, color: "text-dikkat", label: "Uyarı:" },
} as const;

const QR_CHECK = "Bu alan adının ekspertiz firmasının kendi sitesi olup olmadığını kontrol edin.";

/** Dış bağlantı: yeni sekmede, yönlendiren bilgisi gönderilmeden açılır. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-action underline decoration-2 underline-offset-[3px] [overflow-wrap:anywhere] hover:text-action-strong"
    >
      {children}
      {/* Bölünmez boşluk: simge son kelimeden ayrılıp tek başına satıra inmesin. */}
      {" "}
      <ExternalIcon className="inline size-4 align-[-2px]" />
      <span className="sr-only">(yeni sekmede açılır)</span>
    </a>
  );
}

function Row({ level, children }: { level: Signal["level"]; children: React.ReactNode }) {
  const { Icon, color, label } = LEVEL[level];
  return (
    <li className="flex gap-3 py-4">
      <Icon className={`mt-0.5 size-6 ${color}`} />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{label} </span>
        {children}
      </div>
    </li>
  );
}

function QrRows({ found }: { found: QrFound[] }) {
  return found.map((q) => (
    <p key={q.url} className="mt-2">
      Rapordaki QR kodu <strong className="font-bold">{q.domain}</strong> alan adına gidiyor:{" "}
      <ExternalLink href={q.url}>{q.url}</ExternalLink>
      <span className="mt-1 block text-ink-soft">{QR_CHECK}</span>
    </p>
  ));
}

function SignalBody({ signal, qr }: { signal: Signal; qr: QrFound[] }) {
  const details = signalDetails(signal);
  const firmLink = signal.code === "firma_dogrulama" && signal.details[0] ? qrLink(signal.details[0]) : null;
  return (
    <>
      <p>{signal.message}</p>
      {details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-ink-soft">
          {details.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden="true">–</span>
              <span className="min-w-0">{d}</span>
            </li>
          ))}
        </ul>
      )}
      {firmLink && (
        <p className="mt-2">
          <ExternalLink href={firmLink.url}>{firmLink.domain} sorgu sayfası</ExternalLink>
        </p>
      )}
      {signal.code === "qr_var" &&
        (qr.length > 0 ? (
          <QrRows found={qr} />
        ) : (
          <p className="mt-1.5 text-ink-soft">
            QR kodunu telefonunuzun kamerasıyla okutun ve açılan adresin alan adının ekspertiz firmasının kendi
            sitesi olup olmadığını kontrol edin.
          </p>
        ))}
    </>
  );
}

export function SignalList({ signals, qr = [] }: { signals: Signal[]; qr?: QrFound[] }) {
  const qrInSignals = signals.some((s) => s.code === "qr_var");
  const empty = signals.length === 0 && qr.length === 0;
  return (
    <section aria-labelledby="isaretler-baslik">
      <h2 id="isaretler-baslik" className="text-2xl font-bold tracking-tight">
        Rapor güvenilirlik işaretleri
      </h2>
      <p className="mt-1 max-w-prose text-ink-soft">
        Bu işaretler bir hüküm değildir. Raporu kendiniz kontrol ederken nelere bakacağınızı gösterir.
      </p>
      {empty ? (
        <p className="mt-4">Bu rapor için gösterilecek bir işaret bulunmadı.</p>
      ) : (
        <ul className="mt-2 divide-y divide-rule border-y border-rule">
          {signals.map((s, n) => (
            <Row key={`${s.code}-${n}`} level={s.level}>
              <SignalBody signal={s} qr={qr} />
            </Row>
          ))}
          {!qrInSignals && qr.length > 0 && (
            <Row level="info">
              <QrRows found={qr} />
            </Row>
          )}
        </ul>
      )}
    </section>
  );
}
