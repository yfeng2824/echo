import { useAppStore } from "../state/app-store";
import "./scene-chrome.css";

function getNetworkSummary(
  networkStatus: ReturnType<typeof useAppStore.getState>["networkStatus"],
  networkError: string | null,
  nodeCount: number
) {
  if (networkStatus === "ready") {
    return "Live data";
  }

  if (networkStatus === "unavailable") {
    return networkError ?? "Unavailable";
  }

  return nodeCount > 0 ? "Switching" : "Loading";
}

function getCountSummary(nodeCount: number, channelCount: number) {
  return `${nodeCount} Announced ${nodeCount === 1 ? "Node" : "Nodes"} • ${channelCount} ${
    channelCount === 1 ? "Channel" : "Channels"
  }`;
}

export function SceneChrome() {
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);
  const currentNetwork = useAppStore((state) => state.currentNetwork);
  const networkError = useAppStore((state) => state.networkError);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const headlineCounts = useAppStore((state) => state.headlineCounts);
  const nodes = useAppStore((state) => state.nodes);
  const setAudioSettings = useAppStore((state) => state.setAudioSettings);
  const setNetwork = useAppStore((state) => state.setNetwork);
  const goToMap = useAppStore((state) => state.goToMap);
  const toggleAudio = useAppStore((state) => state.toggleAudio);

  const announcedNodeCount = nodes.length;
  const { channelCount } = headlineCounts;
  const networkSummary = getNetworkSummary(networkStatus, networkError, announcedNodeCount);
  const countSummary = getCountSummary(announcedNodeCount, channelCount);

  return (
    <>
      <header className="scene-chrome scene-chrome--top-left">
        <button className="scene-chrome__title-button" type="button" onClick={goToMap}>
          <div className="scene-chrome__title-group">
            <h1 className="scene-chrome__title">Echo</h1>
            <div className="scene-chrome__meta">{countSummary}</div>
          </div>
        </button>
      </header>

      <div className={`scene-chrome scene-chrome--bottom-left ${audioEnabled ? "is-active" : ""}`}>
        <button className={`chrome-button ${audioEnabled ? "is-active" : ""}`} type="button" onClick={toggleAudio}>
          Sound: {audioEnabled ? "On" : "Off"}
        </button>

        <div className="audio-controls">
          <label className="audio-controls__group">
            <span className="audio-controls__label">Network</span>
            <select
              value={currentNetwork}
              onChange={(event) => setNetwork(event.target.value as typeof currentNetwork)}
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
            <span className="audio-controls__hint">{networkSummary}</span>
          </label>

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
