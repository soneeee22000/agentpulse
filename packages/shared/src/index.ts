/**
 * @pulse/shared — the AgentPulse wire protocol.
 *
 * Every cross-boundary type is defined here as a Zod schema and re-exported
 * with its inferred TS type. Import from `@pulse/shared` in both the backend
 * and the frontend; never redefine these shapes locally.
 */
export * from './events.js';
export * from './metrics.js';
export * from './api.js';
