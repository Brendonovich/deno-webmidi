// Base MIDIPort implementation
// Represents a MIDI input or output port

export type MIDIPortType = "input" | "output";
export type MIDIPortDeviceState = "connected" | "disconnected";
export type MIDIPortConnectionState = "open" | "closed" | "pending";

export interface MIDIPortOptions {
  sysex?: boolean;
  software?: boolean;
}

export class MIDIPort extends EventTarget {
  readonly id: string;
  readonly manufacturer: string = "";
  readonly name: string;
  readonly type: MIDIPortType;
  readonly version: string = "";

  private _state: MIDIPortDeviceState = "connected";
  private _connection: MIDIPortConnectionState = "closed";
  private _onstatechange: ((this: MIDIPort, ev: Event) => void) | null = null;

  constructor(id: string, name: string, type: MIDIPortType) {
    super();
    this.id = id;
    this.name = name;
    this.type = type;
  }

  get state(): MIDIPortDeviceState {
    return this._state;
  }

  get connection(): MIDIPortConnectionState {
    return this._connection;
  }

  get onstatechange(): ((this: MIDIPort, ev: Event) => void) | null {
    return this._onstatechange;
  }

  set onstatechange(handler: ((this: MIDIPort, ev: Event) => void) | null) {
    this._onstatechange = handler;
  }

  // Internal state management
  _setDeviceState(state: MIDIPortDeviceState): void {
    if (this._state !== state) {
      this._state = state;
      this.dispatchEvent(new Event("statechange"));
      if (this._onstatechange) {
        this._onstatechange.call(this, new Event("statechange"));
      }
    }
  }

  _setConnectionState(state: MIDIPortConnectionState): void {
    if (this._connection !== state) {
      this._connection = state;
      this.dispatchEvent(new Event("statechange"));
      if (this._onstatechange) {
        this._onstatechange.call(this, new Event("statechange"));
      }
    }
  }

  // These must be implemented by subclasses
  open(): Promise<MIDIPort> {
    throw new Error("Must be implemented by subclass");
  }

  close(): Promise<MIDIPort> {
    throw new Error("Must be implemented by subclass");
  }
}
