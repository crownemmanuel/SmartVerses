import { invoke } from "@tauri-apps/api/core";

export interface MidiDevice {
  id: string;
  name: string;
}

/**
 * List all available MIDI output devices
 */
export async function listMidiOutputDevices(): Promise<MidiDevice[]> {
  try {
    return await invoke<MidiDevice[]>("list_midi_output_devices");
  } catch (error) {
    console.error("[MIDI] Failed to list devices:", error);
    throw error;
  }
}

/**
 * Send a MIDI note to a device
 * @param deviceId - The device ID (index as string)
 * @param channel - MIDI channel (1-16)
 * @param note - MIDI note number (0-127)
 * @param velocity - Note velocity (0-127)
 */
export async function sendMidiNote(
  deviceId: string,
  channel: number,
  note: number,
  velocity: number = 127
): Promise<void> {
  try {
    await invoke("send_midi_note", {
      deviceId,
      channel,
      note,
      velocity,
    });
    console.log(`[MIDI] Sent note ${note} on channel ${channel} to device ${deviceId}`);
  } catch (error) {
    console.error("[MIDI] Failed to send note:", error);
    throw error;
  }
}
