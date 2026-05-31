/** Helpers for turning caller-supplied files into multipart parts. */

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Normalize one file input into a part for the given field.
 * Accepts:
 *   - { filename, content, contentType? }
 *   - a Blob/File (its own name is used unless `filename` is on it)
 */
export function toPart(item, field) {
  if (item && typeof item === "object" && "content" in item) {
    return {
      field,
      filename: item.filename,
      content: item.content,
      contentType: item.contentType ?? DEFAULT_CONTENT_TYPE,
    };
  }
  if (item instanceof Blob) {
    return { field, filename: item.name ?? "file", content: item, contentType: item.type || DEFAULT_CONTENT_TYPE };
  }
  throw new TypeError("file must be { filename, content, contentType? } or a Blob/File");
}

/** Normalize one file or an array of files into parts under `field`. */
export function toParts(items, field) {
  const list = Array.isArray(items) ? items : [items];
  return list.map((it) => toPart(it, field));
}
