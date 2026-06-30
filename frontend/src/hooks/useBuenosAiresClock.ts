import { useEffect, useState } from "react";
import { getBuenosAiresClock } from "../api/supabase";

export function useBuenosAiresClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    getBuenosAiresClock()
      .then(clock => {
        if (cancelled) return;
        const offset = new Date(clock.now).getTime() - Date.now();
        const update = () => setNow(new Date(Date.now() + offset));
        update();
        timer = window.setInterval(update, 60_000);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return { now, today: buenosAiresDateInput(now) };
}

function buenosAiresDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
