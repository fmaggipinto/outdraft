import { useState } from "react";
import { navigate } from "../App";

export function Home() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim();
    if (!/^\d{1,9}$/.test(id)) {
      setError("A League ID is a number, like 12345.");
      return;
    }
    navigate(`/league/${id}`);
  };

  return (
    <section className="home">
      <h1>See who's really strongest in your Draft League</h1>
      <p className="lede">
        Squad strength for every Manager over the next 1, 3 or 6 gameweeks, from xG-based Projections.
        No sign-in.
      </p>
      <form onSubmit={open} className="card open-form" noValidate>
        <label htmlFor="league-id">League ID</label>
        <div className="row">
          <input
            id="league-id"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 12345"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            aria-invalid={!!error}
            aria-describedby="league-help"
          />
          <button type="submit">Open League</button>
        </div>
        <p id="league-help" className={error ? "error" : "muted"}>
          {error || "Find it in the FPL Draft site's address bar on your League page: …/league/12345/…"}
        </p>
      </form>
    </section>
  );
}
