/*!
 * Container format sniffer.
 * Inspects header magic bytes to detect MP4, WebM/Matroska, Ogg/Opus, FLAC.
 * Pure Rust with zero external dependencies, works across all desktop and mobile platforms.
 */

use std::io::{Read, Seek, SeekFrom};

pub(crate) fn sniff_container_mime(
    reader: &mut (impl Read + Seek),
) -> std::io::Result<Option<&'static str>> {
    let mut header = [0u8; 64];
    let mut filled = 0;
    while filled < header.len() {
        match reader.read(&mut header[filled..]) {
            Ok(0) => break,
            Ok(read) => filled += read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    reader.seek(SeekFrom::Start(0))?;
    Ok(container_mime_of(&header[..filled]))
}

pub(crate) fn container_mime_of(header: &[u8]) -> Option<&'static str> {
    if header.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        // Matroska / WebM
        return Some("audio/webm; codecs=\"opus\"");
    }
    if header.starts_with(b"OggS") {
        return Some(if header.windows(8).any(|window| window == b"OpusHead") {
            "audio/opus"
        } else {
            "audio/ogg"
        });
    }
    if header.len() >= 12 && &header[4..8] == b"ftyp" {
        return Some("audio/mp4");
    }
    if header.starts_with(b"fLaC") {
        return Some("audio/flac");
    }
    None
}
