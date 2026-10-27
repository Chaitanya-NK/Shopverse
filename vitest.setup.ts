// `server-only` throws when imported outside a React Server environment; tests run in plain Node.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
