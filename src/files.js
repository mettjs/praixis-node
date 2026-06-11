/** Helpers for turning caller-supplied files into multipart parts. */

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Server-supported formats, keyed by filename extension. */
const EXTENSION_CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

/** Infer the part's Content-Type from the filename extension. */
function contentTypeFor(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return DEFAULT_CONTENT_TYPE;
  return EXTENSION_CONTENT_TYPES[filename.slice(dot).toLowerCase()] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * Normalize one file input into a part for the given field.
 * Accepts:
 *   - { filename, content, contentType? }
 *   - a File (its own name is used)
 *
 * A filename is mandatory: the server uses it as the stored identity of the
 * document and (primarily) to detect the format, so a plain Blob — which has
 * no name — is rejected here instead of failing server-side.
 */
export function toPart(item, field) {
  if (item && typeof item === "object" && "content" in item) {
    if (!item.filename) {
      throw new TypeError("file.filename is required (it is the document's stored identity on the server)");
    }
    return {
      field,
      filename: item.filename,
      content: item.content,
      contentType: item.contentType ?? contentTypeFor(item.filename),
    };
  }
  if (item instanceof Blob) {
    if (!item.name) {
      throw new TypeError(
        "a plain Blob has no filename; pass a File, or { filename, content, contentType? }",
      );
    }
    return { field, filename: item.name, content: item, contentType: item.type || contentTypeFor(item.name) };
  }
  throw new TypeError("file must be { filename, content, contentType? } or a File");
}

/** Normalize one file or an array of files into parts under `field`. */
export function toParts(items, field) {
  const list = Array.isArray(items) ? items : [items];
  return list.map((it) => toPart(it, field));
}
