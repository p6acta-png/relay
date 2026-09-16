/**
 * Shared by the server layout and the client toggle. Kept out of the 'use client' module: a server
 * component importing a plain value from a client module receives a client reference, not the value.
 */
export type LearnMode = 'beginner' | 'developer';
export const LEARN_MODE_COOKIE = 'relay_learn_mode';
