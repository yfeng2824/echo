import { SceneRouter } from "../scenes/scene-router";
import { NetworkTransitionOverlay } from "../ui/network-transition-overlay";
import { SceneChrome } from "../ui/scene-chrome";
import { RenderSurface } from "../ui/render-surface";
import { useAppStore } from "../state/app-store";
import "./app-shell.css";

export function AppShell() {
  const activeScene = useAppStore((state) => state.activeScene);

  return (
    <div className="app-shell" data-scene={activeScene}>
      <RenderSurface />
      <NetworkTransitionOverlay />
      <SceneChrome />
      <SceneRouter />
    </div>
  );
}
