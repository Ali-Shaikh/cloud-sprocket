// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useRef, useState } from "react";

/** Ref-counted in-flight gate for overlapping async inventory fetches. */
export function useFetchDepth() {
  const depthRef = useRef(0);
  const [loading, setLoading] = useState(false);

  const begin = useCallback(() => {
    depthRef.current += 1;
    if (depthRef.current === 1) {
      setLoading(true);
    }
  }, []);

  const end = useCallback(() => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setLoading(false);
  }, []);

  return { loading, begin, end, reset };
}