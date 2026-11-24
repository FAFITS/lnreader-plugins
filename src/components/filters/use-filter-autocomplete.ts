import type { FilterOption } from '@libs/filterInputs';
import { useEffect, useRef, useState } from 'react';

export type FilterSuggestionsFetcher = (
  filterKey: string,
  query: string,
) => Promise<FilterOption[]>;

const SUGGESTION_DEBOUNCE_MS = 250;
const SUGGESTION_MIN_QUERY_LENGTH = 2;
const SUGGESTION_TIMEOUT_MS = 5000;
const SUGGESTION_LIMIT = 6;

export function useFilterAutocomplete({
  filterKey,
  query,
  enabled,
  fetchSuggestions,
  onSelect,
}: {
  filterKey: string;
  query: string;
  enabled: boolean;
  fetchSuggestions?: FilterSuggestionsFetcher;
  onSelect: (suggestion: FilterOption) => void;
}) {
  const [suggestions, setSuggestions] = useState<FilterOption[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  const isActive =
    enabled &&
    Boolean(fetchSuggestions) &&
    trimmedQuery.length >= SUGGESTION_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!isActive || !fetchSuggestions) {
      setSuggestions([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        const result = await Promise.race([
          fetchSuggestions(filterKey, trimmedQuery),
          new Promise<null>(resolve =>
            window.setTimeout(() => resolve(null), SUGGESTION_TIMEOUT_MS),
          ),
        ]);
        if (cancelled || requestId !== requestIdRef.current) return;
        if (!Array.isArray(result)) {
          setSuggestions([]);
          return;
        }
        const normalized = result
          .filter(
            (item): item is FilterOption =>
              Boolean(item) &&
              typeof item.value === 'string' &&
              item.value.trim().length > 0,
          )
          .map(item => ({
            label:
              typeof item.label === 'string' && item.label.trim().length > 0
                ? item.label
                : item.value,
            value: item.value,
          }))
          .slice(0, SUGGESTION_LIMIT);
        setSuggestions(normalized);
      } catch {
        if (!cancelled && requestId === requestIdRef.current) {
          setSuggestions([]);
        }
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterKey, trimmedQuery, isActive, fetchSuggestions]);

  return {
    suggestions: isFocused && !isSuppressed ? suggestions : [],
    onFocus: () => {
      setIsFocused(true);
      setIsSuppressed(false);
    },
    onBlur: () => {
      setIsFocused(false);
    },
    onEdit: () => {
      setIsFocused(true);
      setIsSuppressed(false);
    },
    dismiss: () => {
      setIsSuppressed(true);
    },
    select: (suggestion: FilterOption) => {
      onSelect(suggestion);
      setIsSuppressed(true);
    },
  };
}
