import { useEffect, useState } from "react";
import { Home } from "./screens/Home";
import { League } from "./screens/League";

export function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
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
  return (
    <>
      <header className="top">
        <a href="/" className="brand" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
          Outdraft
        </a>
      </header>
      <main>{league ? <League key={league[1]} id={Number(league[1])} /> : <Home />}</main>
      <footer>
        Outdraft is not affiliated with the Premier League or Fantasy Premier League.
        Data from the public FPL Draft API.
      </footer>
    </>
  );
}
