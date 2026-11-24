import type { Filter } from '@libs/filterInputs';
import { FilterTypes } from '@libs/filterInputs';
import React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  type FilterSuggestionsFetcher,
  useFilterAutocomplete,
} from './use-filter-autocomplete';

type TextFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.TextInput>;
  };
  value: string;
  set: (value: string) => void;
  getSuggestions?: FilterSuggestionsFetcher;
};

export function TextFilter({
  filter,
  value,
  set,
  getSuggestions,
}: TextFilterProps) {
  const autocomplete = useFilterAutocomplete({
    filterKey: filter.key,
    query: value,
    enabled: Boolean(filter.filter.autocomplete),
    fetchSuggestions: getSuggestions,
    onSelect: suggestion => set(suggestion.value),
  });

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      <Input
        id={filter.key}
        value={value}
        onChange={e => {
          autocomplete.onEdit();
          set(e.target.value);
        }}
        onFocus={autocomplete.onFocus}
        onBlur={autocomplete.onBlur}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            autocomplete.dismiss();
          }
        }}
        placeholder={`Enter ${filter.filter.label.toLowerCase()}...`}
      />
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
