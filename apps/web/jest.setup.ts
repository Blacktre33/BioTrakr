import "@testing-library/jest-dom";

// Provide predictable defaults so config validation succeeds inside the Jest
// environment without reintroducing production hard-coded URLs.
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api";

// jsdom has no TextEncoder/TextDecoder; browsers do (the QR code library needs them).
import { TextDecoder, TextEncoder } from "util";

Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
});
