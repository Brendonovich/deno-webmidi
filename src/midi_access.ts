// MIDIAccess implementation
// Main entry point for WebMIDI API - manages MIDI ports

import { MidiFFI } from "./ffi_bindings.ts";
import { MIDIInput } from "./midi_input.ts";
import { MIDIOutput } from "./midi_output.ts";

export interface MIDIAccessOptions {
  sysex?: boolean;
  software?: boolean;
}

export class MIDIAccess extends EventTarget {
  private _inputs: Map<string, MIDIInput> = new Map();
  private _outputs: Map<string, MIDIOutput> = new Map();
  private _sysexEnabled: boolean;
  private _onstatechange: ((this: MIDIAccess, ev: Event) => void) | null = null;

  constructor(sysexEnabled: boolean = false) {
    super();
    this._sysexEnabled = sysexEnabled;
  }

  get inputs(): IterableIterator<MIDIInput> {
    return this._inputs.values();
  }

  get outputs(): IterableIterator<MIDIOutput> {
    return this._outputs.values();
  }

  get sysexEnabled(): boolean {
    return this._sysexEnabled;
  }

  get onstatechange(): ((this: MIDIAccess, ev: Event) => void) | null {
    return this._onstatechange;
  }

  set onstatechange(handler: ((this: MIDIAccess, ev: Event) => void) | null) {
    this._onstatechange = handler;
  }

  // Initialize MIDI system and enumerate ports
  static async requestAccess(options?: MIDIAccessOptions): Promise<MIDIAccess> {
    const sysex = options?.sysex ?? false;
    const access = new MIDIAccess(sysex);

    // Initialize the FFI layer
    const success = MidiFFI.init((id, name, isInput) => {
      // Port connected callback
      if (isInput) {
        const input = new MIDIInput(id, name);
        access._inputs.set(id, input);
      } else {
        const output = new MIDIOutput(id, name);
        access._outputs.set(id, output);
      }
    });

    if (!success) {
      throw new Error("Failed to initialize MIDI system");
    }

    return access;
  }

  // Refresh the list of ports
  refresh(): void {
    MidiFFI.refresh(
      (id, name, isInput) => {
        // Port added
        if (isInput) {
          if (!this._inputs.has(id)) {
            const input = new MIDIInput(id, name);
            this._inputs.set(id, input);
            this._dispatchStateChange();
          }
        } else {
          if (!this._outputs.has(id)) {
            const output = new MIDIOutput(id, name);
            this._outputs.set(id, output);
            this._dispatchStateChange();
          }
        }
      },
      (id, name, isInput) => {
        // Port removed
        if (isInput) {
          const input = this._inputs.get(id);
          if (input) {
            input._setDeviceState("disconnected");
            this._inputs.delete(id);
            this._dispatchStateChange();
          }
        } else {
          const output = this._outputs.get(id);
          if (output) {
            output._setDeviceState("disconnected");
            this._outputs.delete(id);
            this._dispatchStateChange();
          }
        }
      },
    );
  }

  private _dispatchStateChange(): void {
    const event = new Event("statechange");
    this.dispatchEvent(event);
    if (this._onstatechange) {
      this._onstatechange.call(this, event);
    }
  }

  // Get input by ID
  getInput(id: string): MIDIInput | undefined {
    return this._inputs.get(id);
  }

  // Get output by ID
  getOutput(id: string): MIDIOutput | undefined {
    return this._outputs.get(id);
  }

  // Shutdown MIDI system
  shutdown(): void {
    // Close all open ports
    for (const input of this._inputs.values()) {
      if (input.connection === "open") {
        input.close();
      }
    }
    for (const output of this._outputs.values()) {
      if (output.connection === "open") {
        output.close();
      }
    }

    MidiFFI.shutdown();
    this._inputs.clear();
    this._outputs.clear();
  }
}
