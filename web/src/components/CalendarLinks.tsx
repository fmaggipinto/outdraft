import { useState } from "react";
import { FEED_PATH } from "../calendarFeed";

/** Subscribe links for the deadlines calendar, in place of push notifications. */
export function CalendarLinks() {
  const [copied, setCopied] = useState(false);
  const https = `https://${location.host}${FEED_PATH}`;
  const webcal = `webcal://${location.host}${FEED_PATH}`;
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const copy = async () => {
    await navigator.clipboard?.writeText(https);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <p className="calendar-links small">
      <span className="muted">Never miss a deadline: add them to </span>
      <a href={webcal}>Apple or Outlook Calendar</a>
      <span className="muted"> · </span>
      <a href={google} target="_blank" rel="noopener noreferrer">Google Calendar</a>
      <span className="muted"> · </span>
      <button type="button" className="link" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
    </p>
  );
}
