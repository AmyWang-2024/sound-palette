export const APP_STATES = ['home', 'listening', 'mood', 'result'] as const

export type AppState = (typeof APP_STATES)[number]
