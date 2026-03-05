// MIDIInput implementation
// Represents a MIDI input port

import { MidiFFI } from "./ffi_bindings.ts";
import { MIDIPort, type MIDIPortType } from "./midi_port.ts";

export interface MIDIMessageEventInit extends EventInit {
  data: Uint8Array;
  receivedTime?: number;
}

export class MIDIMessageEvent extends Event {
  readonly data: Uint8Array;
  readonly receivedTime: number;

  constructor(type: string, eventInitDict: MIDIMessageEventInit) {
    super(type, eventInitDict);
    this.data = eventInitDict.data;
    this.receivedTime = eventInitDict.receivedTime ?? performance.now();
  }
}

export class MIDIInput extends MIDIPort {
  private _onmidimessage:
    | ((this: MIDIInput, ev: MIDIMessageEvent) => void)
    | null = null;
  private _messageQueue: Array<{ data: Uint8Array; timestamp: number }> = [];

  constructor(id: string, name: string) {
    super(id, name, "input" as MIDIPortType);
  }

  get onmidimessage():
    | ((this: MIDIInput, ev: MIDIMessageEvent) => void)
    | null {
    return this._onmidimessage;
  }

  set onmidimessage(
    handler:
      | ((this: MIDIInput, ev: MIDIMessageEvent) => void)
      | null,
  ) {
    this._onmidimessage = handler;
  }

  // Open the input port and start receiving messages
  override async open(): Promise<MIDIInput> {
    if (this.connection === "open") {
      return this;
    }

    this._setConnectionState("pending");

    const success = MidiFFI.openPort(this.id, (data, timestamp) => {
      // Store in queue and dispatch event
      this._messageQueue.push({ data, timestamp });

      const event = new MIDIMessageEvent("midimessage", {
        data: new Uint8Array(data),
        receivedTime: timestamp,
      });

      this.dispatchEvent(event);
      if (this._onmidimessage) {
        this._onmidimessage.call(this, event);
      }
    });

    if (success) {
      this._setConnectionState("open");
    } else {
      this._setConnectionState("closed");
      throw new Error(`Failed to open MIDI input port: ${this.name}`);
    }

    return this;
  }

  // Close the input port
  override async close(): Promise<MIDIInput> {
    if (this.connection === "closed") {
      return this;
    }

    MidiFFI.closePort(this.id);
    this._setConnectionState("closed");
    return this;
  }

  // Get pending messages (useful for polling approach)
  getPendingMessages(): Array<{ data: Uint8Array; timestamp: number }> {
    const messages = [...this._messageQueue];
    this._messageQueue = [];
    return messages;
  }
}
