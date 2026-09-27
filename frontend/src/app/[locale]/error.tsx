"use client";

import { useParams } from "next/navigation";

export default function Error({ reset }: { reset: () => void }) {
  const locale = useParams().locale;
  const ru = locale === "ru";
  return (
    <main className="content-wrap detail-state">
      <div className="state-panel" role="alert">
        <h1>{ru ? "Произошла ошибка" : "Қате пайда болды"}</h1>
        <p>
          {ru
            ? "Не удалось загрузить вакансии."
            : "Бос орындарды жүктеу мүмкін болмады."}
        </p>
        <button className="primary-button" onClick={reset}>
          {ru ? "Повторить" : "Қайталау"}
        </button>
      </div>
    </main>
  );
}
