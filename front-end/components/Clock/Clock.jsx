import { useEffect, useState } from "react";

export default function Clock() {
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date());

      const get = (type) => parts.find((p) => p.type === type).value;

      setStamp(
        `${get("year")}.${get("month")}.${get("day")} — ${get("hour")}:${get("minute")}:${get("second")}`,
      );
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span>{stamp}</span>;
}
