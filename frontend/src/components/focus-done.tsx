"use client";

export function FocusDone({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={`focus-done ${className}`.trim()} data-morph>
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
        }}
      >
        {label}
      </button>
    </div>
  );
}
