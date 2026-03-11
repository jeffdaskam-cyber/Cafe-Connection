/**
 * useWidget — lightweight async data hook for widget content.
 *
 * Wraps an async function with loading / error / reload state so every
 * widget that fetches data doesn't have to repeat the same try/catch pattern.
 *
 * Usage:
 *   const { data, loading, error, reload } = useWidget(
 *     () => fetchSomeData(param),
 *     [param]          // re-fetches when param changes
 *   );
 *
 *   <Widget loading={loading} error={error} onRetry={reload} empty={!data?.length}>
 *     <MyContent data={data} />
 *   </Widget>
 *
 * Notes:
 *   - Safe on unmount: state updates after unmount are suppressed.
 *   - `data` starts as null; it's never cleared back to null on reload
 *     (keeps stale content visible during refresh).
 *   - Pass a stable function reference or use deps to control re-fetch timing.
 *     If asyncFn has no deps, wrap it in useCallback([]) at the call site.
 */

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * @param {() => Promise<any>} asyncFn  — async function that returns the data
 * @param {any[]}              deps     — dependency array (same semantics as useEffect)
 * @returns {{ data, loading, error, reload }}
 */
export function useWidget(asyncFn, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Track mount state to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Stable reload function — recreated when deps change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err?.message || "Something went wrong");
        setLoading(false);
      }
    }
  }, deps); // deps spread intentionally; asyncFn should be stable or memoized

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

/**
 * useWidgetSubscription — variant for Firestore real-time listeners.
 *
 * Instead of an async function, accepts a subscribe function that follows
 * the Firebase onSnapshot pattern: called with a callback, returns an unsubscribe fn.
 *
 * Usage:
 *   const { data, loading, error } = useWidgetSubscription(
 *     (cb) => subscribeToCampus(campus, cb),
 *     [campus]
 *   );
 *
 * @param {(callback: (data: any) => void) => () => void} subscribeFn
 * @param {any[]} deps
 * @returns {{ data, loading, error }}
 */
export function useWidgetSubscription(subscribeFn, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let unsub;
    try {
      unsub = subscribeFn((incoming) => {
        setData(incoming);
        setLoading(false);
      });
    } catch (err) {
      setError(err?.message || "Subscription failed");
      setLoading(false);
    }
    return () => { if (unsub) unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
