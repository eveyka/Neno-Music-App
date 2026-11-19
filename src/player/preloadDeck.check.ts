/**
 * Self-check for which engines may preload which tracks. There is no test runner in this
 * project, so it runs via esbuild:
 *
 *   npx esbuild src/player/preloadDeck.check.ts --bundle --platform=node --format=esm
 *     --outfile=check.mjs && node check.mjs
 *
 * Worth pinning because both mistakes are real bugs and neither is loud. Excluding downloads
 * from the Rust deck silently costs gapless on exactly the albums people expect it on;
 * *including* them on the IFrame deck would stream the online copy of a track the user
 * downloaded on purpose, over the network, while a perfectly good file sat on disk.
 */
export {};

import { hasPreloadDeck } from "./preloadDeck";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

const streamed = { isLocal: false, isDownloaded: false };
const downloaded = { isLocal: false, isDownloaded: true };
const local = { isLocal: true, isDownloaded: false };

// The Rust decks open whatever they are handed, so nothing is held back from them.
check(hasPreloadDeck("rust", streamed), "rust preloads a streamed track");
check(hasPreloadDeck("rust", downloaded), "rust preloads a downloaded track");
check(hasPreloadDeck("rust", local), "rust preloads a local file");

// The IFrame deck disables preloading on mobile to prevent expired signed URL errors
check(!hasPreloadDeck("iframe", streamed), "iframe does not preload streamed tracks to avoid expired chunks");
check(!hasPreloadDeck("iframe", downloaded), "iframe must not restream a download");
check(!hasPreloadDeck("iframe", local), "iframe cannot play a local file at all");

// Dual-deck native audio supports preloading onto standbyAudio
check(hasPreloadDeck("native", streamed), "native preloads streamed tracks onto standby deck");
check(hasPreloadDeck("native", downloaded), "native preloads downloaded tracks onto standby deck");
check(hasPreloadDeck("native", local), "native preloads local files onto standby deck");

console.log("preloadDeck.check.ts OK");
