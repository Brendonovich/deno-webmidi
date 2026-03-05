// deno-webmidi example
// Demonstrates basic WebMIDI API usage

import { type MIDIAccess, requestMIDIAccess } from "../src/mod.ts";

async function listPorts(access: MIDIAccess): Promise<void> {
  console.log("\n=== MIDI Ports ===");

  const inputArray = Array.from(access.inputs);
  const outputArray = Array.from(access.outputs);

  console.log(`\nInputs (${inputArray.length}):`);
  for (const input of inputArray) {
    console.log(`  • ${input.name} (ID: ${input.id})`);
    console.log(`    Connection: ${input.connection}, State: ${input.state}`);
  }

  console.log(`\nOutputs (${outputArray.length}):`);
  for (const output of outputArray) {
    console.log(`  • ${output.name} (ID: ${output.id})`);
    console.log(`    Connection: ${output.connection}, State: ${output.state}`);
  }
}

async function testInput(access: MIDIAccess): Promise<void> {
  const inputs = Array.from(access.inputs);
  const outputs = Array.from(access.outputs);
  if (inputs.length === 0) {
    console.log("\n⚠ No MIDI input devices available");
    return;
  }

  const input = inputs[0];
  console.log(`\n📥 Opening input: ${input.name}`);

  await input.open();

  await outputs[0].open();

  // Listen for messages
  input.onmidimessage = (event) => {
    outputs[0].send(event.data);
    const hexData = Array.from(event.data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    console.log(`🎵 MIDI [${hexData}] at ${event.receivedTime.toFixed(2)}ms`);
  };

  console.log(`   Connection: ${input.connection}`);
  console.log("   Press keys on your MIDI device (or wait 3 seconds)...");

  // Wait for messages
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await input.close();
  await outputs[0].close();
  console.log(`   Connection: ${input.connection}`);
}

async function testOutput(access: MIDIAccess): Promise<void> {
  const outputs = Array.from(access.outputs);
  if (outputs.length === 0) {
    console.log("\n⚠ No MIDI output devices available");
    return;
  }

  const output = outputs[0];
  console.log(`\n📤 Opening output: ${output.name}`);

  await output.open();
  console.log(`   Connection: ${output.connection}`);

  // Send a few test messages
  console.log("\n🎹 Sending test messages:");

  // Note On (middle C, velocity 100)
  output.send([0x90, 60, 100]);
  console.log("   Note On: Middle C (velocity 100)");

  await new Promise((r) => setTimeout(r, 200));

  // Note Off
  output.send([0x80, 60, 0]);
  console.log("   Note Off: Middle C");

  await output.close();
  console.log(`   Connection: ${output.connection}`);
}

async function main(): Promise<void> {
  console.log("🎼 Deno WebMIDI Example");
  console.log("======================");

  try {
    // Request MIDI access
    console.log("\n🔌 Requesting MIDI access...");
    const access = await requestMIDIAccess({ sysex: false });
    console.log("   Access granted!");
    console.log(`   SysEx enabled: ${access.sysexEnabled}`);

    // List available ports
    await listPorts(access);

    // Test input
    await testInput(access);

    // Test output
    await testOutput(access);

    // Cleanup
    access.shutdown();
    console.log("\n✅ Done!");
  } catch (error) {
    console.error("\n❌ Error:", error);
    Deno.exit(1);
  }
}

// Only run if this is the main module
if (import.meta.main) {
  main();
}

export { main };
