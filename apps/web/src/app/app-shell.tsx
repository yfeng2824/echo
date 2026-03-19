import { SceneRouter } from "../scenes/scene-router";
import { SceneChrome } from "../ui/scene-chrome";
import { RenderSurface } from "../ui/render-surface";
import "./app-shell.css";

export function AppShell() {
  return (
    <div className="app-shell">
      <RenderSurface />
      <SceneChrome />
      <SceneRouter />
    </div>
  );
}
