import type { Filter } from '@libs/filterInputs';
import { FilterTypes } from '@libs/filterInputs';
import { Plus, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  type FilterSuggestionsFetcher,
  useFilterAutocomplete,
} from './use-filter-autocomplete';

type MultiTextFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.MultiText>;
  };
  value: string[];
  set: (value: string[]) => void;
  getSuggestions?: FilterSuggestionsFetcher;
  resetVersion: number;
};

function addMultiTextValues(current: string[], rawValues: string[]): string[] {
  const next = [...current];
  for (const rawValue of rawValues) {
    const trimmed = rawValue.trim();
    if (trimmed && !next.includes(trimmed)) {
      next.push(trimmed);
    }
  }
  return next;
}

export function MultiTextFilter({
  filter,
  value,
  set,
  getSuggestions,
  resetVersion,
}: MultiTextFilterProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    setInput('');
  }, [resetVersion, filter.key]);

  const commit = (rawText: string) => {
    const next = addMultiTextValues(value, rawText.split(/\r?\n/));
    if (next.length !== value.length) {
      set(next);
    }
    setInput('');
  };

  const autocomplete = useFilterAutocomplete({
    filterKey: filter.key,
    query: input,
    enabled: Boolean(filter.filter.autocomplete),
    fetchSuggestions: getSuggestions,
    onSelect: suggestion => commit(suggestion.value),
  });

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(chip => (
            <Badge
              key={chip}
              variant="secondary"
              className="gap-1 pr-1 max-w-full"
            >
              <button
                type="button"
                className="truncate text-left"
                title={`Edit ${chip}`}
                onClick={() => {
                  setInput(chip);
                  set(value.filter(item => item !== chip));
                }}
              >
                {chip}
              </button>
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => set(value.filter(item => item !== chip))}
                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          id={filter.key}
          value={input}
          onChange={e => {
            autocomplete.onEdit();
            const nextValue = e.target.value;
            if (nextValue.includes('\n')) {
              commit(nextValue);
            } else {
              setInput(nextValue);
            }
          }}
          onFocus={autocomplete.onFocus}
          onBlur={autocomplete.onBlur}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(input);
            } else if (e.key === 'Escape') {
              autocomplete.dismiss();
            }
          }}
          placeholder={`Add ${filter.filter.label.toLowerCase()}...`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!input.trim()}
          onClick={() => commit(input)}
          aria-label={`Add ${filter.filter.label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {autocomplete.suggestions.length > 0 && (
        <div className="z-50 w-full rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {autocomplete.suggestions.map(suggestion => (
            <button
              key={`${suggestion.value}:${suggestion.label}`}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                autocomplete.select(suggestion);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground truncate block"
              title={suggestion.label}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
