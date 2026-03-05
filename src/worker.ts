// Web Worker for receiving MIDI messages
// This worker polls for MIDI messages from the FFI layer and posts them to the main thread

// In a real implementation, this worker would use an FFI call to poll messages
// For now, this is a placeholder showing the architecture

let portId: string | null = null;
let pollingInterval: number | null = null;

// Message types
type WorkerMessage =
	| { type: "start"; portId: string }
	| { type: "stop" }
	| { type: "getMessages" };

type WorkerResponse =
	| { type: "message"; portId: string; data: Uint8Array; timestamp: number }
	| {
			type: "messages";
			messages: Array<{ portId: string; data: Uint8Array; timestamp: number }>;
	  }
	| { type: "error"; message: string };

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
	const msg = event.data;

	switch (msg.type) {
		case "start":
			portId = msg.portId;
			startPolling();
			break;
		case "stop":
			stopPolling();
			break;
		case "getMessages":
			// In real implementation, this would call FFI to get messages
			// For now, return empty array
			self.postMessage({ type: "messages", messages: [] } as WorkerResponse);
			break;
	}
};

function startPolling(): void {
	if (pollingInterval) {
		clearInterval(pollingInterval);
	}

	// Poll at 1ms intervals for real-time performance
	// In practice, you might want to adjust this based on your needs
	pollingInterval = self.setInterval(() => {
		// In a real implementation:
		// const messages = MidiFFI.getReceivedMessages(portId);
		// for (const msg of messages) {
		//   self.postMessage({ type: "message", ...msg });
		// }
	}, 1);
}

function stopPolling(): void {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
	portId = null;
}

// Cleanup on worker termination
self.onerror = (err) => {
	console.error("MIDI Worker error:", err);
	stopPolling();
};
