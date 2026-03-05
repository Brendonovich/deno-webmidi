// Main entry point for deno-webmidi
// Exports the WebMIDI API compatible with the W3C spec

// Re-export FFI bindings for advanced usage
export { MidiFFI } from "./ffi_bindings.ts";
export { MIDIAccess, type MIDIAccessOptions } from "./midi_access.ts";
export { MIDIInput, MIDIMessageEvent, type MIDIMessageEventInit } from "./midi_input.ts";
export { MIDIOutput } from "./midi_output.ts";
export {
  MIDIPort,
  type MIDIPortConnectionState,
  type MIDIPortDeviceState,
  type MIDIPortOptions,
  type MIDIPortType,
} from "./midi_port.ts";

// Helper to request MIDI access (matches browser API)
export async function requestMIDIAccess(
  options?: import("./midi_access.ts").MIDIAccessOptions,
): Promise<import("./midi_access.ts").MIDIAccess> {
  const { MIDIAccess } = await import("./midi_access.ts");
  return MIDIAccess.requestAccess(options);
}

// Usage example in comments:
/*
import { requestMIDIAccess } from "./mod.ts";

async function main() {
  try {
    // Request MIDI access
    const access = await requestMIDIAccess({ sysex: false });

    // List available inputs
    console.log("MIDI Inputs:");
    for (const input of access.inputs) {
      console.log(`  ${input.name} (${input.id})`);
    }

    // List available outputs
    console.log("MIDI Outputs:");
    for (const output of access.outputs) {
      console.log(`  ${output.name} (${output.id})`);
    }

    // Open an input and listen for messages
    const input = access.inputs.next().value;
    if (input) {
      await input.open();
      input.onmidimessage = (event) => {
        console.log("MIDI Message:", event.data, "at", event.receivedTime);
      };
    }

    // Open an output and send a message
    const output = access.outputs.next().value;
    if (output) {
      await output.open();
      output.send([0x90, 60, 127]); // Note on, middle C, full velocity
    }

  } catch (error) {
    console.error("MIDI Error:", error);
  }
}

main();
*/
