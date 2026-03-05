use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::ffi::{c_char, c_void, CStr, CString};

// Port callback typedef: fn(id, name, is_input)
pub type PortCallback = extern "C" fn(*const c_char, *const c_char, bool);

// Message callback: fn(port_id, data_ptr, data_len, timestamp_micros)
pub type MessageCallback = extern "C" fn(*const c_char, *const u8, usize, u64);

// Global state (similar to Firefox's MIDIPlatformService)
static MANAGER: Lazy<Mutex<MidiManager>> = Lazy::new(|| Mutex::new(MidiManager::new()));

struct PortInfo {
    id: String,
    name: String,
    is_input: bool,
}

struct MidiManager {
    input_ports: HashMap<String, PortInfo>,
    output_ports: HashMap<String, PortInfo>,
    active_inputs: HashMap<String, MidiInputConnection<()>>,
    active_outputs: HashMap<String, MidiOutputConnection>,
    message_callback: Option<MessageCallback>,
}

impl MidiManager {
    fn new() -> Self {
        Self {
            input_ports: HashMap::new(),
            output_ports: HashMap::new(),
            active_inputs: HashMap::new(),
            active_outputs: HashMap::new(),
            message_callback: None,
        }
    }
}

/// Initialize the MIDI system. Returns true on success.
#[no_mangle]
pub extern "C" fn midir_impl_init(add_port_cb: PortCallback) -> bool {
    let mut manager = MANAGER.lock();

    // Enumerate input ports
    if let Ok(input) = MidiInput::new("deno-webmidi") {
        for (i, port) in input.ports().iter().enumerate() {
            if let Ok(name) = input.port_name(port) {
                let id = format!("input-{}", i);
                let id_c = CString::new(id.clone()).unwrap();
                let name_c = CString::new(name.clone()).unwrap();

                manager.input_ports.insert(
                    id.clone(),
                    PortInfo {
                        id: id.clone(),
                        name: name.clone(),
                        is_input: true,
                    },
                );

                add_port_cb(id_c.as_ptr(), name_c.as_ptr(), true);
            }
        }
    }

    // Enumerate output ports
    if let Ok(output) = MidiOutput::new("deno-webmidi") {
        for (i, port) in output.ports().iter().enumerate() {
            if let Ok(name) = output.port_name(port) {
                let id = format!("output-{}", i);
                let id_c = CString::new(id.clone()).unwrap();
                let name_c = CString::new(name.clone()).unwrap();

                manager.output_ports.insert(
                    id.clone(),
                    PortInfo {
                        id: id.clone(),
                        name: name.clone(),
                        is_input: false,
                    },
                );

                add_port_cb(id_c.as_ptr(), name_c.as_ptr(), false);
            }
        }
    }

    true
}

/// Refresh port list, calling callbacks for added/removed ports
#[no_mangle]
pub extern "C" fn midir_impl_refresh(add_cb: PortCallback, remove_cb: PortCallback) {
    // Implementation similar to init but diffing against existing ports
    let mut manager = MANAGER.lock();

    // Clear and re-enumerate (simpler approach)
    for (id, info) in &manager.input_ports {
        let id_c = CString::new(id.clone()).unwrap();
        let name_c = CString::new(info.name.clone()).unwrap();
        remove_cb(id_c.as_ptr(), name_c.as_ptr(), true);
    }

    for (id, info) in &manager.output_ports {
        let id_c = CString::new(id.clone()).unwrap();
        let name_c = CString::new(info.name.clone()).unwrap();
        remove_cb(id_c.as_ptr(), name_c.as_ptr(), false);
    }

    manager.input_ports.clear();
    manager.output_ports.clear();
    drop(manager);

    // Re-init
    midir_impl_init(add_cb);
}

/// Open a MIDI input port. Returns true on success.
#[no_mangle]
pub extern "C" fn midir_impl_open_port(
    port_id: *const c_char,
    receive_cb: MessageCallback,
) -> bool {
    let port_id_str = unsafe {
        if port_id.is_null() {
            return false;
        }
        CStr::from_ptr(port_id).to_string_lossy().to_string()
    };

    let mut manager = MANAGER.lock();

    if port_id_str.starts_with("input-") {
        // Find the port index
        let index: usize = port_id_str
            .strip_prefix("input-")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        match MidiInput::new("deno-webmidi") {
            Ok(input) => {
                let ports = input.ports();
                if index >= ports.len() {
                    return false;
                }

                let port = &ports[index];
                let port_id_for_closure = port_id_str.clone();

                // Store callback
                manager.message_callback = Some(receive_cb);

                let connection = input.connect(
                    port,
                    "deno-webmidi-input",
                    move |timestamp, message, _| {
                        // Convert timestamp to microseconds since open
                        let micros = ((timestamp as f64) * 1_000_000.0) as u64;

                        // Get callback from global
                        let callback = {
                            let manager = MANAGER.lock();
                            manager.message_callback
                        };

                        if let Some(cb) = callback {
                            let id_c = CString::new(port_id_for_closure.clone()).unwrap();
                            cb(id_c.as_ptr(), message.as_ptr(), message.len(), micros);
                        }
                    },
                    (),
                );

                match connection {
                    Ok(conn) => {
                        manager.active_inputs.insert(port_id_str, conn);
                        true
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    } else {
        // Output port - just store for now
        match MidiOutput::new("deno-webmidi") {
            Ok(output) => {
                let index: usize = port_id_str
                    .strip_prefix("output-")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                let ports = output.ports();
                if index >= ports.len() {
                    return false;
                }

                match output.connect(&ports[index], "deno-webmidi-output") {
                    Ok(conn) => {
                        manager.active_outputs.insert(port_id_str, conn);
                        true
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }
}

/// Close a MIDI port
#[no_mangle]
pub extern "C" fn midir_impl_close_port(port_id: *const c_char) -> bool {
    let port_id_str = unsafe {
        if port_id.is_null() {
            return false;
        }
        CStr::from_ptr(port_id).to_string_lossy().to_string()
    };

    let mut manager = MANAGER.lock();

    if port_id_str.starts_with("input-") {
        // Drop connection (implicitly closes)
        manager.active_inputs.remove(&port_id_str);
    } else {
        manager.active_outputs.remove(&port_id_str);
    }

    true
}

/// Send a MIDI message to an output port
#[no_mangle]
pub extern "C" fn midir_impl_send(port_id: *const c_char, data: *const u8, len: usize) -> bool {
    let port_id_str = unsafe {
        if port_id.is_null() {
            return false;
        }
        CStr::from_ptr(port_id).to_string_lossy().to_string()
    };

    let mut manager = MANAGER.lock();

    if let Some(conn) = manager.active_outputs.get_mut(&port_id_str) {
        let message = unsafe { std::slice::from_raw_parts(data, len) };

        conn.send(message).is_ok()
    } else {
        false
    }
}

/// Shutdown the MIDI system
#[no_mangle]
pub extern "C" fn midir_impl_shutdown() {
    let mut manager = MANAGER.lock();
    manager.active_inputs.clear();
    manager.active_outputs.clear();
    manager.input_ports.clear();
    manager.output_ports.clear();
    manager.message_callback = None;
}
