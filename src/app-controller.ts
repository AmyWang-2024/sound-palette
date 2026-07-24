import { APP_STATES, type AppState } from './types'

export function isAppState(value: unknown): value is AppState {
  return typeof value === 'string' && APP_STATES.some((state) => state === value)
}

export class AppController {
  #state: AppState = 'home'

  get state(): AppState {
    return this.#state
  }

  setState(nextState: AppState): void {
    this.#state = nextState
  }
}
