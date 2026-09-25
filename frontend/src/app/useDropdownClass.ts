import { useEffect, useRef, useState } from "react";

export function useDropdownClass(open: boolean) {
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setClosing(false);
    } else if (wasOpen.current) {
      setClosing(true);
      const closeMs = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur"),
      ) || 150;
      timer = setTimeout(() => setClosing(false), closeMs);
    }
    wasOpen.current = open;
    return () => clearTimeout(timer);
  }, [open]);
  return open ? "is-open" : closing ? "is-closing" : "";
}
