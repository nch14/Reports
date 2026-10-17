import path from "node:path";

export interface Config {
  port: number;
  publicUrl: string;
  dataDir: string;
  ownerPassword: string;
  sessionSecret?: string;
  /** Behind a reverse proxy: take the client address from the last X-Forwarded-For hop. */
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ownerPassword = env.OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error("OWNER_PASSWORD is required. Copy .env.example to .env and set it.");
  }
  if (ownerPassword === "change-me") {
    throw new Error("OWNER_PASSWORD is still the example value. Set a real password in .env.");
  }
  if (ownerPassword.length < 12) {
    console.warn("Warning: OWNER_PASSWORD is shorter than 12 characters. Use a longer one if this site is reachable from the internet.");
  }
  const port = Number(env.PORT ?? 3000);
  return {
    port,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ""),
    dataDir: path.resolve(env.DATA_DIR ?? "./data"),
    ownerPassword,
    sessionSecret: env.SESSION_SECRET || undefined,
    trustProxy: ["1", "true", "yes"].includes((env.TRUST_PROXY ?? "").toLowerCase()),
  };
}
