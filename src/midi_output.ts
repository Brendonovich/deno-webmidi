// MIDIOutput implementation
// Represents a MIDI output port

import { MidiFFI } from "./ffi_bindings.ts";
import { MIDIPort, type MIDIPortType } from "./midi_port.ts";

export class MIDIOutput extends MIDIPort {
  constructor(id: string, name: string) {
    super(id, name, "output" as MIDIPortType);
  }

  // Open the output port
  override async open(): Promise<MIDIOutput> {
    if (this.connection === "open") {
      return this;
    }

    this._setConnectionState("pending");

    // For outputs, we pass a dummy message callback
    const success = MidiFFI.openPort(this.id, () => {
      // Outputs don't receive messages
    });

    if (success) {
      this._setConnectionState("open");
    } else {
      this._setConnectionState("closed");
      throw new Error(`Failed to open MIDI output port: ${this.name}`);
    }

    return this;
  }

  // Close the output port
  override async close(): Promise<MIDIOutput> {
    if (this.connection === "closed") {
      return this;
    }

    MidiFFI.closePort(this.id);
    this._setConnectionState("closed");
    return this;
  }

  // Send MIDI data immediately or schedule for later
  send(data: Uint8Array | number[], timestamp?: number): void {
    if (this.connection !== "open") {
      throw new Error("Cannot send to a closed MIDI port");
    }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (timestamp && timestamp > performance.now()) {
      // Schedule for later
      const delay = timestamp - performance.now();
      setTimeout(() => {
        MidiFFI.send(this.id, bytes);
      }, delay);
    } else {
      // Send immediately
      const success = MidiFFI.send(this.id, bytes);
      if (!success) {
        throw new Error(`Failed to send MIDI message to port: ${this.name}`);
      }
    }
  }

  // Clear any pending scheduled sends
  clear(): void {
    // Implementation would track scheduled sends and cancel them
    // For now, this is a no-op
  }
}
