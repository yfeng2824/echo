import { useAppStore } from "../state/app-store";
import "./scene-chrome.css";

export function SceneChrome() {
  const activeScene = useAppStore((state) => state.activeScene);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);
  const setAudioSettings = useAppStore((state) => state.setAudioSettings);
  const goToMap = useAppStore((state) => state.goToMap);
  const toggleAudio = useAppStore((state) => state.toggleAudio);

  return (
    <>
      <header className="scene-chrome scene-chrome--top-left">
        <button className="scene-chrome__title-button" type="button" onClick={goToMap}>
          <div className="scene-chrome__title-group">
            <h1 className="scene-chrome__title">Echo</h1>
            <div className="scene-chrome__meta">
              {activeScene === "map"
                ? "A living soundscape of connected nodes"
                : "A focused local field of connected resonance"}
            </div>
          </div>
        </button>
      </header>

      <div className={`scene-chrome scene-chrome--bottom-left ${audioEnabled ? "is-active" : ""}`}>
        <button className={`chrome-button ${audioEnabled ? "is-active" : ""}`} type="button" onClick={toggleAudio}>
          Sound: {audioEnabled ? "On" : "Off"}
        </button>

        <div className="audio-controls">
          <label className="audio-controls__group">
            <span className="audio-controls__label">Density</span>
            <select
              value={audioSettings.density}
              onChange={(event) =>
                setAudioSettings({
                  density: event.target.value as typeof audioSettings.density
                })
              }
            >
              <option value="sparse">Sparse</option>
              <option value="balanced">Balanced</option>
              <option value="rich">Rich</option>
            </select>
          </label>
        </div>
      </div>
    </>
  );
}
