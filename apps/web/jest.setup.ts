import "@testing-library/jest-dom";

// Provide predictable defaults so config validation succeeds inside the Jest
// environment without reintroducing production hard-coded URLs.
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api";
