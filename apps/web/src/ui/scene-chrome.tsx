import { useAppStore } from "../state/app-store";
import "./scene-chrome.css";

export function SceneChrome() {
  const activeScene = useAppStore((state) => state.activeScene);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const toggleAudio = useAppStore((state) => state.toggleAudio);

  return (
    <header className="scene-chrome">
      <div>
        <div className="scene-chrome__title">Echo</div>
        <div className="scene-chrome__meta">
          Fiber network liveness demo · {activeScene === "map" ? "World map" : "Node resonance"}
        </div>
      </div>
      <button className="scene__button" type="button" onClick={toggleAudio}>
        Audio: {audioEnabled ? "On" : "Off"}
      </button>
    </header>
  );
}

