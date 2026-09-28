// Debounces announcements for the persistent live region in
// components/LiveRegion.tsx.
//
// This module used to also export its own `LiveRegion`, which duplicated the
// one App.tsx rendered. There is now a single definition, alongside the other
// components, so the two cannot drift apart.
import { useCallback, useEffect, useRef, useState } from "react";

export function usePoliteLiveRegion(debounceMs = 100) {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const announce = useCallback((nextMessage: string) => {
    if (!nextMessage) {
      setMessage("");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setMessage(nextMessage);
    }, debounceMs);
  }, [debounceMs]);

  return { announce, message };
}
