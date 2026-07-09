import { z } from 'zod';

/**
 * Environment configuration, validated with zod at startup.
 *
 * Every value has a default so the service boots fully offline (in-memory bus +
 * simulator) with zero credentials. GCP values are only read when
 * `BUS_DRIVER=pubsub`; Kafka values only when `BUS_DRIVER=kafka`.
 */
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().min(1).default('0.0.0.0'),
  CORS_ORIGIN: z.string().min(1).default('*'),
  BUS_DRIVER: z.enum(['memory', 'pubsub', 'kafka']).default('memory'),
  SIM_AUTOSTART: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Serve the GraphiQL explorer at `/graphiql`. */
  GRAPHIQL: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  GCP_PROJECT_ID: z.string().optional(),
  PUBSUB_TOPIC: z.string().min(1).default('agentpulse-events'),
  PUBSUB_SUBSCRIPTION: z.string().min(1).default('agentpulse-events-sub'),
  /** Comma-separated `host:port` list, parsed into brokers. */
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .default('localhost:9092')
    .transform((v) =>
      v
        .split(',')
        .map((broker) => broker.trim())
        .filter((broker) => broker.length > 0),
    ),
  KAFKA_TOPIC: z.string().min(1).default('agentpulse-events'),
  KAFKA_GROUP_ID: z.string().min(1).default('agentpulse-api'),
  KAFKA_CLIENT_ID: z.string().min(1).default('agentpulse'),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Parse + validate `process.env` into a typed config object. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

/** Eagerly-loaded singleton config for convenience in app code. */
export const config: Config = loadConfig();
