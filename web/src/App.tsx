import { Component, useEffect, useState, type ReactNode } from "react";
import { Home } from "./screens/Home";
import { League } from "./screens/League";
import { Matchups } from "./screens/Matchups";
import { Squad } from "./screens/Squad";
import { Trades } from "./screens/Trades";
import { Waivers } from "./screens/Waivers";

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

/** An in-app link: a real <a> (so it can be opened in a new tab or shared),
 * navigated without a page load. */
export function Link({ to, children, ...rest }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** Shows a message instead of a blank page if a screen crashes. */
class Crashed extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card status" role="alert">
        <p>Something went wrong showing this page.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const league = path.match(/^\/league\/(\d{1,9})\/?$/);
  const matchups = path.match(/^\/league\/(\d{1,9})\/matchups\/?$/);
  const trades = path.match(/^\/league\/(\d{1,9})\/trades\/?$/);
  const waivers = path.match(/^\/league\/(\d{1,9})\/waivers\/?$/);
  const squad = path.match(/^\/league\/(\d{1,9})\/manager\/(\d{1,9})\/?$/);
  return (
    <>
      <header className="top">
        <a href="/" className="brand" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
          Outdraft
        </a>
      </header>
      <main>
        <Crashed key={path}>
          {squad ? <Squad leagueId={Number(squad[1])} entryId={Number(squad[2])} />
            : waivers ? <Waivers id={Number(waivers[1])} />
            : trades ? <Trades id={Number(trades[1])} />
            : matchups ? <Matchups id={Number(matchups[1])} />
            : league ? <League id={Number(league[1])} />
            : <Home />}
        </Crashed>
      </main>
      <footer>
        Outdraft is not affiliated with the Premier League or Fantasy Premier League.
        Data from the public FPL Draft API.
      </footer>
    </>
  );
}
