import type { AudioEngine, EchoEvent } from "@echo/contracts";

export function createAudioEngine(): AudioEngine {
  let enabled = false;

  return {
    enable() {
      enabled = true;
      // TODO: initialize Tone.js transport and instruments here.
    },
    disable() {
      enabled = false;
      // TODO: stop and release active audio resources here.
    },
    trigger(event: EchoEvent) {
      if (!enabled) {
        return;
      }

      // TODO: map event types and intensity into sonic gestures.
      console.debug("[audio placeholder]", event.type, event.intensity);
    },
    dispose() {
      enabled = false;
    }
  };
}

