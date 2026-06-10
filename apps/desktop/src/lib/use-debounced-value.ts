import { useEffect, useState } from "react";

/** Returns `value` after it has been stable for `delayMs` (Cloudscape-free). */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs, value]);

  return debounced;
}
