"use client";

import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 639px)";

/** true en pantallas de teléfono (debajo del breakpoint sm de Tailwind). */
export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return narrow;
}
