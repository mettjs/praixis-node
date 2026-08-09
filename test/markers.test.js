/**
 * Golden marker-vector tests for the Praixis Node client.
 *
 * test/marker_vectors.json is authored in PraixisEngine and vendored here
 * verbatim; see the `_comment` block inside it. These assertions hold this
 * SDK's side of the contract — the marker whitelist and the [SOURCES:...]
 * escape table — against the same vectors the engine and the other two SDKs
 * check.
 *
 * Run with: node --test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { streamEvents } from "../src/stream.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS = JSON.parse(readFileSync(join(HERE, "marker_vectors.json"), "utf8"));

/** Feed chunks through the decoder exactly as the transport delivers them. */
async function* fromChunks(chunks) {
  for (const chunk of chunks) yield chunk;
}

/** Collapse events into the vectors' language-neutral shape. */
async function decode(chunks) {
  const meta = {};
  let sources = null;
  const content = [];
  for await (const event of streamEvents(fromChunks(chunks))) {
    if (event.type === "token") content.push(event.value);
    else if (event.type === "sources") sources = event.value;
    else meta[event.type.toUpperCase()] = event.value;
  }
  return { meta, sources, content: content.join("") };
}

test("whitelisted keys parse as markers", async () => {
  for (const key of VECTORS.marker_keys) {
    if (key === "SOURCES") continue; // value shape differs; covered below
    const { meta, content } = await decode([`[${key}:value]\n`, "tok"]);
    assert.equal(meta[key], "value", `${key} was not decoded as a marker`);
    assert.equal(content, "tok", `${key} leaked into content`);
  }
});

test("non-marker keys stay content", async () => {
  for (const key of VECTORS.non_marker_keys) {
    const line = `[${key}:value]\n`;
    const { meta, content } = await decode([line, "tok"]);
    assert.deepEqual(meta, {}, `'${key}' must not be treated as a marker`);
    assert.equal(content, `${line}tok`, `'${key}' was swallowed instead of kept as content`);
  }
});

test("[SOURCES:...] escape table matches the engine", async () => {
  for (const c of VECTORS.source_escaping) {
    const { sources } = await decode([`[SOURCES:${c.encoded}]\n`, "tok"]);
    assert.deepEqual(sources ?? [], c.decoded, c.name);
  }
});

test("stream vectors decode identically", async () => {
  for (const c of VECTORS.streams) {
    const { meta, sources, content } = await decode(c.chunks);
    assert.deepEqual(meta, c.meta, `${c.name}: meta`);
    assert.equal(content, c.content, `${c.name}: content`);
    if (c.sources === null) assert.equal(sources, null, `${c.name}: unexpected sources`);
    else assert.deepEqual(sources ?? [], c.sources, `${c.name}: sources`);
  }
});
