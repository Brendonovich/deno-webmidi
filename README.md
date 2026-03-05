# deno-webmidi

A WebMIDI implementation for Deno using the `midir` Rust library via FFI.

## Architecture

Similar to Firefox's WebMIDI implementation, this library uses:

- **Rust FFI Layer** (`ffi/`): Wraps `midir` library with C-compatible interface
- **TypeScript Bindings** (`src/ffi_bindings.ts`): Deno FFI calls to Rust
- **WebMIDI API** (`src/`): Full W3C WebMIDI API implementation
- **Worker Thread** (`src/worker.ts`): Optional message polling worker

## Project Structure

```
deno-webmidi/
├── ffi/
│   ├── Cargo.toml           # Rust dependencies (midir)
│   └── src/
│       └── lib.rs            # FFI implementation
├── src/
│   ├── mod.ts               # Main entry point
│   ├── ffi_bindings.ts      # Deno FFI interface
│   ├── midi_access.ts       # MIDIAccess class
│   ├── midi_port.ts         # Base MIDIPort class
│   ├── midi_input.ts        # MIDIInput with message events
│   ├── midi_output.ts       # MIDIOutput with send()
│   └── worker.ts            # Web Worker for message polling
├── examples/
│   └── basic.ts             # Usage example
└── deno.json                # Deno configuration
```

## Building

```bash
# Build the Rust FFI library
cd src-rust && cargo build --release

# Or use the task
deno task build
```

## Usage

```typescript
import { requestMIDIAccess } from "./src/mod.ts";

const access = await requestMIDIAccess({ sysex: false });

// List inputs
for (const input of access.inputs) {
  console.log(`Input: ${input.name}`);
}

// Listen for messages
const input = access.inputs.next().value;
await input.open();
input.onmidimessage = (event) => {
  console.log("MIDI:", event.data);
};

// Send messages
const output = access.outputs.next().value;
await output.open();
output.send([0x90, 60, 127]); // Note on
```

## Run Example

```bash
# Run with all required permissions
deno run --allow-ffi --allow-read --allow-net examples/basic.ts

# Or use the task
deno task dev
```

## API Compatibility

Implements the [W3C Web MIDI API](https://webaudio.github.io/web-midi-api/):

- ✅ `navigator.requestMIDIAccess()`
- ✅ `MIDIAccess` (inputs, outputs, sysexEnabled, onstatechange)
- ✅ `MIDIPort` (id, name, type, state, connection, open(), close())
- ✅ `MIDIInput` (onmidimessage, MIDIMessageEvent)
- ✅ `MIDIOutput` (send(), clear())

## Platform Support

Cross-platform via `midir`:

- ✅ Linux (ALSA)
- ✅ macOS (CoreMIDI)
- ✅ Windows (WinMM)
- ⚠️ Android (API 29+ via AMidi)

## License

MIT - See [LICENSE](./LICENSE) for details.
