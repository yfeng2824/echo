import { SceneRouter } from "../scenes/scene-router";
import { SceneChrome } from "../ui/scene-chrome";
import "./app-shell.css";

export function AppShell() {
  return (
    <div className="app-shell">
      <SceneChrome />
      <SceneRouter />
    </div>
  );
}

