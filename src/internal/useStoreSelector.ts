import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Subscribes to a slice of a store instead of the whole thing.
 *
 * The player state is one object, so subscribing to the whole thing re-renders on any change
 * to any field — dragging the volume slider used to re-render the entire application,
 * because the root subscribed to the same object as the volume control did.
 *
 * The cache is what makes an object-returning selector legal here: `useSyncExternalStore`
 * compares snapshots with `Object.is` and calls `getSnapshot` more than once per render, so
 * a selector building a fresh object every call would loop forever and warn. Holding the
 * previous value when the comparison says nothing changed is what keeps it stable.
 */
export function useStoreSelector<S, T>(
  subscribe: (listener: () => void) => () => void,
  getState: () => S,
  select: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  /* Both are read through refs because callers pass inline arrows: as dependencies they
     would change identity every render and defeat the memoisation they exist to provide. */
  const selectRef = useRef(select);
  selectRef.current = select;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const cacheRef = useRef<{ state: S; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = getState();
    const cached = cacheRef.current;
    if (cached && Object.is(cached.state, state)) return cached.value;

    const next = selectRef.current(state);
    if (cached && isEqualRef.current(cached.value, next)) {
      // Same selection, new state object: keep the old reference so React sees no change.
      cacheRef.current = { state, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { state, value: next };
    return next;
  }, [getState]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
