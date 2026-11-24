"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareImage } from "./resize";
import { kindOf, type SelectedItem } from "./selection";

/**
 * Seçilen rapor sayfaları. Fotoğraflar seçilir seçilmez, sırayla ve bir kez çözülür:
 * gönderilecek küçültülmüş JPEG ve önizleme küçük resmi üretilir. Çözülemeyen dosya
 * (ör. Chrome'da HEIC) yalnız kendisi "okunamadı" olur; kullanıcı onu kaldırıp devam eder.
 * Her şey yalnız bellekte; önizleme adresleri kaldırılınca ve sayfadan çıkınca bırakılır.
 */
export function useSelection() {
  const [items, setItems] = useState<SelectedItem[]>([]);
  const nextId = useRef(1);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(new Set<number>());
  const urls = useRef(new Map<number, string>());

  const release = useCallback((id: number) => {
    live.current.delete(id);
    const url = urls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const ids = live.current;
    const map = urls.current;
    return () => {
      ids.clear();
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const update = (id: number, patch: Partial<SelectedItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const add = useCallback((files: readonly File[]) => {
    const fresh: SelectedItem[] = files.map((file) => {
      const kind = kindOf(file);
      return {
        id: nextId.current++,
        file,
        kind,
        status: kind === "image" ? "preparing" : kind === "pdf" ? "ready" : "failed",
        upload: kind === "pdf" ? file : null,
        thumbUrl: null,
        failure: kind === "other" ? "type" : null,
      };
    });
    for (const it of fresh) live.current.add(it.id);
    setItems((prev) => [...prev, ...fresh]);

    for (const it of fresh) {
      if (it.kind !== "image") continue;
      queue.current = queue.current.then(async () => {
        if (!live.current.has(it.id)) return;
        try {
          const { upload, thumb } = await prepareImage(it.file);
          if (!live.current.has(it.id)) return;
          const url = URL.createObjectURL(thumb);
          urls.current.set(it.id, url);
          update(it.id, { status: "ready", upload, thumbUrl: url });
        } catch {
          if (live.current.has(it.id)) update(it.id, { status: "failed", failure: "decode" });
        }
      });
    }
  }, []);

  const remove = useCallback(
    (id: number) => {
      release(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    },
    [release],
  );

  const clear = useCallback(() => {
    for (const id of [...live.current]) release(id);
    setItems([]);
  }, [release]);

  return { items, add, remove, clear };
}

export type Selection = ReturnType<typeof useSelection>;
