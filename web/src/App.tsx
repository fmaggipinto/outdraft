import { Component, useEffect, useState, type ReactNode } from "react";
import { clearStale } from "./data";
import { Fixtures } from "./screens/Fixtures";
import { Home } from "./screens/Home";
import { League } from "./screens/League";
import { More } from "./screens/More";
import { Squad } from "./screens/Squad";
import { Targets } from "./screens/Targets";
import { Trades } from "./screens/Trades";

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
    const update = () => {
      clearStale();   // also for the browser's Back and Forward
      setPath(location.pathname);
    };
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  return path;
}

// Addresses from before the five-tab navigation, mapped to where they live now.
const LEGACY: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/league\/(\d{1,9})\/waivers\/?$/, (m) => `/league/${m[1]}/targets`],
  [/^\/league\/(\d{1,9})\/matchups\/?$/, (m) => `/league/${m[1]}`],
  [/^\/league\/(\d{1,9})\/manager\/(\d{1,9})\/?$/, (m) => `/league/${m[1]}/squad/${m[2]}`],
];

export function App() {
  let path = usePath();
  for (const [re, to] of LEGACY) {
    const m = path.match(re);
    if (m) {
      path = to(m);
      history.replaceState(null, "", path + location.search);
    }
  }
  const route = path.match(/^\/league\/(\d{1,9})(?:\/(squad|targets|trades|fixtures|more))?(?:\/(\d{1,9}))?\/?$/);
  const id = route ? Number(route[1]) : 0;
  const tab = route?.[2];
  return (
    <>
      <Crashed key={path}>
        {!route ? <Home />
          : tab === "squad" ? <Squad leagueId={id} entryId={route[3] ? Number(route[3]) : null} />
          : tab === "targets" ? <Targets id={id} />
          : tab === "trades" ? <Trades id={id} />
          : tab === "fixtures" ? <Fixtures id={id} />
          : tab === "more" ? <More id={id} />
          : <League id={id} />}
      </Crashed>
      <footer>
        Outdraft is not affiliated with the Premier League or Fantasy Premier League.
        Data from the public FPL Draft API.
      </footer>
    </>
  );
}
