import type { EchoChannel, EchoEvent, EchoNode, NetworkSimulation } from "@echo/contracts";

type CreateNetworkSimulationInput = {
  nodes: EchoNode[];
  channels: EchoChannel[];
  events: EchoEvent[];
};

export function createNetworkSimulation(
  input: CreateNetworkSimulationInput
): NetworkSimulation {
  let eventIndex = 0;
  let timer: number | null = null;

  return {
    start(onEvent) {
      // TODO: replace timer loop with an actual event-driven simulation model.
      if (timer !== null) {
        return;
      }

      timer = window.setInterval(() => {
        const event = input.events[eventIndex % input.events.length];
        eventIndex += 1;
        onEvent(event);
      }, 3000);
    },
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }
  };
}

