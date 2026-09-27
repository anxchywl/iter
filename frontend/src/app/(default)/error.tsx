"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="content-wrap detail-state">
      <div className="state-panel" role="alert">
        <h1>Something went wrong</h1>
        <p>Vacancies could not be loaded.</p>
        <button className="primary-button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
