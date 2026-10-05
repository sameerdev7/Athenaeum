import { useCallback, useState } from "react";

const KEY = "athenaeum-skin";

export const SKINS = [
  { id: "gilded", name: "Gilded Folio", note: "Gold on obsidian, glass cards", swatch: ["#dcb056", "#120e09"] },
  { id: "letterboxd", name: "Cinema Dark", note: "Flat charcoal, cover-first", swatch: ["#00e054", "#14181c"] },
  { id: "editorial", name: "Editorial", note: "Newsprint, ruled columns", swatch: ["#a4231a", "#f3eee3"] },
];

/**
 * The active look. "gilded" is the default and the absence of a data-skin
 * attribute, so picking it removes every override — the original design,
 * untouched. index.html applies the stored choice before first paint.
 */
export function useSkin() {
  const [skin, setSkinState] = useState(() => document.documentElement.dataset.skin || "gilded");

  const setSkin = useCallback((id) => {
    if (id === "gilded") delete document.documentElement.dataset.skin;
    else document.documentElement.dataset.skin = id;
    try {
      if (id === "gilded") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, id);
    } catch {
      /* storage can be blocked; the choice still holds for the session */
    }
    setSkinState(id);
  }, []);

  return { skin, setSkin };
}
