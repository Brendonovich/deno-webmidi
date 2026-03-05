// FFI bindings for deno-webmidi
// Corresponds to the Rust FFI interface in ffi/src/lib.rs

import { join } from "jsr:@std/path@1";

// Platform-specific library extension
function getLibPath(): string {
	const ext =
		Deno.build.os === "windows"
			? "dll"
			: Deno.build.os === "darwin"
				? "dylib"
				: "so";
	return join(
		import.meta.dirname || "",
		"../../target/release",
		`libdeno_webmidi_ffi.${ext}`,
	);
}

// Type definitions for callbacks
type PortCallback = (
	id: Deno.PointerValue,
	name: Deno.PointerValue,
	isInput: boolean,
) => void;
type MessageCallback = (
	portId: Deno.PointerValue,
	data: Deno.PointerValue,
	len: number,
	timestamp: bigint,
) => void;

// FFI Interface definition
const LIBRARY = Deno.dlopen(getLibPath(), {
	// Initialization
	midir_impl_init: { parameters: ["function"], result: "bool" },
	midir_impl_shutdown: { parameters: [], result: "void" },

	// Port management
	midir_impl_refresh: { parameters: ["function", "function"], result: "void" },
	midir_impl_open_port: { parameters: ["pointer", "function"], result: "bool" },
	midir_impl_close_port: { parameters: ["pointer"], result: "bool" },

	// Messaging
	midir_impl_send: {
		parameters: ["pointer", "pointer", "usize"],
		result: "bool",
	},
});

// Helper to convert C strings to JS strings
function cStringToJS(ptr: Deno.PointerValue): string {
	if (!ptr) return "";
	const buf = new Deno.UnsafePointerView(ptr);
	return buf.getCString();
}

// Message buffer for receiving MIDI data
export class MidiMessageBuffer {
	private messages: Array<{
		portId: string;
		data: Uint8Array;
		timestamp: number;
	}> = [];

	addMessage(portId: string, data: Uint8Array, timestamp: number) {
		this.messages.push({ portId, data: new Uint8Array(data), timestamp });
	}

	getMessages(
		portId?: string,
	): Array<{ portId: string; data: Uint8Array; timestamp: number }> {
		if (portId) {
			const result = this.messages.filter((m) => m.portId === portId);
			this.messages = this.messages.filter((m) => m.portId !== portId);
			return result;
		}
		const result = [...this.messages];
		this.messages = [];
		return result;
	}
}

// Port callback wrapper
const portCallback: PortCallback = (idPtr, namePtr, isInput) => {
	if (MidiFFI.callbacks.portConnected) {
		MidiFFI.callbacks.portConnected(
			cStringToJS(idPtr),
			cStringToJS(namePtr),
			isInput,
		);
	}
};

const portRemoveCallback: PortCallback = (idPtr, namePtr, isInput) => {
	if (MidiFFI.callbacks.portDisconnected) {
		MidiFFI.callbacks.portDisconnected(
			cStringToJS(idPtr),
			cStringToJS(namePtr),
			isInput,
		);
	}
};

// Message receive callback wrapper
const messageBuffer = new MidiMessageBuffer();

const receiveCallback: MessageCallback = (
	portIdPtr,
	dataPtr,
	len,
	timestampMicros,
) => {
	const portId = cStringToJS(portIdPtr);
	if (!portId || !dataPtr) return;

	const data = new Uint8Array(len);
	const view = new Deno.UnsafePointerView(dataPtr);
	for (let i = 0; i < len; i++) {
		data[i] = view.getUint8(i);
	}

	const timestamp = Number(timestampMicros) / 1000; // Convert to milliseconds
	messageBuffer.addMessage(portId, data, timestamp);
};

// FFI API wrapper class
export class MidiFFI {
	private static initialized = false;
	private static callbacks = {
		portConnected: null as
			| ((id: string, name: string, isInput: boolean) => void)
			| null,
		portDisconnected: null as
			| ((id: string, name: string, isInput: boolean) => void)
			| null,
	};

	static init(
		connectCallback: (id: string, name: string, isInput: boolean) => void,
	): boolean {
		if (MidiFFI.initialized) return true;

		MidiFFI.callbacks.portConnected = connectCallback;

		// Create safe callback pointers
		const portCallbackPtr = Deno.UnsafeCallback.threadSafe(
			{ parameters: ["pointer", "pointer", "bool"], result: "void" },
			portCallback,
		);

		const result = LIBRARY.symbols.midir_impl_init(portCallbackPtr.pointer);
		MidiFFI.initialized = result;
		return result;
	}

	static shutdown(): void {
		LIBRARY.symbols.midir_impl_shutdown();
		MidiFFI.initialized = false;
	}

	static refresh(
		connectCallback: (id: string, name: string, isInput: boolean) => void,
		disconnectCallback: (id: string, name: string, isInput: boolean) => void,
	): void {
		MidiFFI.callbacks.portConnected = connectCallback;
		MidiFFI.callbacks.portDisconnected = disconnectCallback;

		const addCallback = Deno.UnsafeCallback.threadSafe(
			{ parameters: ["pointer", "pointer", "bool"], result: "void" },
			portCallback,
		);

		const removeCallback = Deno.UnsafeCallback.threadSafe(
			{ parameters: ["pointer", "pointer", "bool"], result: "void" },
			portRemoveCallback,
		);

		LIBRARY.symbols.midir_impl_refresh(
			addCallback.pointer,
			removeCallback.pointer,
		);
	}

	static openPort(
		portId: string,
		onMessage: (data: Uint8Array, timestamp: number) => void,
	): boolean {
		const portIdPtr = Deno.UnsafePointer.of(
			new TextEncoder().encode(portId + "\0"),
		);

		const msgCallback = Deno.UnsafeCallback.threadSafe(
			{ parameters: ["pointer", "pointer", "usize", "u64"], result: "void" },
			(portIdPtr, dataPtr, len, timestamp) => {
				const portId = cStringToJS(portIdPtr);
				if (!portId || !dataPtr) return;

				const data = new Uint8Array(len);
				const view = new Deno.UnsafePointerView(dataPtr);
				for (let i = 0; i < len; i++) {
					data[i] = view.getUint8(i);
				}

				onMessage(data, Number(timestamp) / 1000);
			},
		);

		return LIBRARY.symbols.midir_impl_open_port(portIdPtr, msgCallback.pointer);
	}

	static closePort(portId: string): boolean {
		const portIdPtr = Deno.UnsafePointer.of(
			new TextEncoder().encode(portId + "\0"),
		);
		return LIBRARY.symbols.midir_impl_close_port(portIdPtr);
	}

	static send(portId: string, data: Uint8Array): boolean {
		const portIdPtr = Deno.UnsafePointer.of(
			new TextEncoder().encode(portId + "\0"),
		);
		const dataPtr = Deno.UnsafePointer.of(data);

		return LIBRARY.symbols.midir_impl_send(portIdPtr, dataPtr, data.length);
	}

	static getReceivedMessages(portId?: string) {
		return messageBuffer.getMessages(portId);
	}
}

export { LIBRARY as lib, messageBuffer };
