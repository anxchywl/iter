"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

export type LocationOption = { value: string; hint?: string };

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function rank(option: LocationOption, query: string) {
  const name = fold(option.value);
  if (!query) return 0;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return -1;
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const folded = fold(text);
  const start = folded.indexOf(query);
  if (start < 0 || folded.length !== text.length) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + query.length)}</mark>
      {text.slice(start + query.length)}
    </>
  );
}

export function LocationField({
  name,
  label,
  value,
  options,
  placeholder,
  emptyLabel,
  clearLabel,
  maxLength,
  wrapperProps,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: LocationOption[];
  placeholder: string;
  emptyLabel: string;
  clearLabel: string;
  maxLength: number;
  wrapperProps?: Record<string, string | boolean>;
  onChange: (option: LocationOption | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : value;
  const query = editing ? fold(text) : "";
  const matches = useMemo(
    () =>
      options
        .map((option, index) => ({ option, index, score: rank(option, query) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .slice(0, 8)
        .map((item) => item.option),
    [options, query],
  );

  function choose(option: LocationOption | null) {
    onChange(option);
    setText(option?.value ?? "");
    setEditing(false);
    setOpen(false);
  }

  function commit() {
    if (!editing) return setOpen(false);
    const typed = fold(text);
    if (!typed) return choose(null);
    if (!options.length) return choose({ value: text.trim() });
    const exact = matches.find((option) => fold(option.value) === typed);
    if (exact) return choose(exact);
    setText(value);
    setEditing(false);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        matches.length
          ? (Math.max(current, step > 0 ? -1 : 0) + step + matches.length) %
            matches.length
          : -1,
      );
    } else if (event.key === "Enter") {
      // update the hidden value before the form submits on this same Enter
      const picked = open ? matches[active] : undefined;
      flushSync(() => (picked ? choose(picked) : commit()));
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setText(value);
      setEditing(false);
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  return (
    <div
      className="location-field"
      data-open={(open && options.length > 0) || undefined}
      {...wrapperProps}
    >
      <label htmlFor={`${id}-input`}>{label}</label>
      <input type="hidden" name={name} value={value} />
      <div className="location-control">
        <input
          ref={input}
          id={`${id}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            open && matches[active] ? `${id}-option-${active}` : undefined
          }
          value={shown}
          onFocus={() => {
            setActive(-1);
            setOpen(true);
          }}
          onBlur={commit}
          onChange={(event) => {
            setText(event.target.value);
            setEditing(true);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            className="location-clear"
            aria-label={`${clearLabel}: ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              choose(null);
              input.current?.focus();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul className="location-options" id={listId} role="listbox" data-morph>
          {matches.length ? (
            matches.map((option, index) => (
              <li
                key={`${option.value}:${option.hint ?? ""}`}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                data-current={option.value === value || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span>{highlight(option.value, query)}</span>
                {option.hint && <small>{option.hint}</small>}
              </li>
            ))
          ) : (
            <li className="location-empty" role="presentation">
              {emptyLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
