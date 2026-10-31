"""Deadlines calendar (deadlines.ics): every upcoming Waiver deadline and
Gameweek deadline as an iCalendar feed people can subscribe to. It replaces
push notifications (ADR-0002).

Each event's UID is fixed per gameweek and kind, so when FPL moves a deadline
the subscribed calendar moves the same event rather than adding a new one.
"""
from datetime import timedelta

DURATION = timedelta(minutes=15)
REMINDER = "-PT2H"
SITE = "https://outdraft.netlify.app"


def _ts(dt):
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _escape(text):
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line):
    """Split lines longer than 75 octets, as RFC 5545 requires."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return [line]
    out, chunk = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(chunk) + len(b) > (75 if not out else 74):
            out.append(chunk.decode("utf-8"))
            chunk = b""
        chunk += b
    out.append(chunk.decode("utf-8"))
    return [out[0]] + [" " + c for c in out[1:]]


def _event(uid, when, summary, description):
    return [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        # DTSTAMP follows the deadline, so an unchanged deadline gives an
        # unchanged file and the job only commits real changes.
        f"DTSTAMP:{_ts(when)}",
        f"DTSTART:{_ts(when)}",
        f"DTEND:{_ts(when + DURATION)}",
        f"SUMMARY:{_escape(summary)}",
        f"DESCRIPTION:{_escape(description)}",
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{_escape(summary)} in 2 hours",
        f"TRIGGER:{REMINDER}",
        "END:VALARM",
        "END:VEVENT",
    ]


def deadlines_ics(events, now):
    """The calendar as text with CRLF line endings. `events` are Season.events;
    deadlines more than a day in the past are left out."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Outdraft//FPL Draft deadlines//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:FPL Draft deadlines",
        "X-WR-CALDESC:Waiver and Gameweek deadlines for FPL Draft\\, from Outdraft",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]
    cutoff = now - timedelta(days=1)
    for e in events:
        gw = e["id"]
        if e["waivers_deadline"] and e["waivers_deadline"] >= cutoff:
            lines += _event(
                f"gw{gw}-waivers@outdraft", e["waivers_deadline"], f"GW{gw} Waiver deadline",
                f"Waiver claims for GW{gw} close. See your Waiver targets: {SITE}")
        if e["deadline"] >= cutoff:
            lines += _event(
                f"gw{gw}-deadline@outdraft", e["deadline"], f"GW{gw} Gameweek deadline",
                f"Lineups for GW{gw} lock. Check your Squad: {SITE}")
    lines.append("END:VCALENDAR")
    return "".join(folded + "\r\n" for line in lines for folded in _fold(line))
