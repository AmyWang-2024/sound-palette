import {
  APP_STATES,
  type AppState,
  type Mood,
  type SoundSummary,
} from './types'

export type SessionSource = 'microphone' | 'sample'

export function isAppState(value: unknown): value is AppState {
  return typeof value === 'string' && APP_STATES.some((state) => state === value)
}

export class AppController {
  #state: AppState = 'home'
  #summary: SoundSummary | undefined
  #mood: Mood | undefined
  #source: SessionSource | undefined

  get state(): AppState {
    return this.#state
  }

  get summary(): SoundSummary | undefined {
    return this.#summary
  }

  get mood(): Mood | undefined {
    return this.#mood
  }

  get source(): SessionSource | undefined {
    return this.#source
  }

  setState(nextState: AppState): void {
    this.#state = nextState
  }

  startListening(source: SessionSource): void {
    this.#state = 'listening'
    this.#summary = undefined
    this.#mood = undefined
    this.#source = source
  }

  completeListening(summary: SoundSummary): void {
    this.#summary = summary
    this.#state = 'mood'
  }

  selectMood(mood: Mood): boolean {
    if (!this.#summary) {
      return false
    }

    this.#mood = mood
    this.#state = 'result'
    return true
  }

  changeMood(): boolean {
    if (!this.#summary) {
      return false
    }

    this.#state = 'mood'
    return true
  }

  returnHome(): void {
    this.#state = 'home'
    this.#summary = undefined
    this.#mood = undefined
    this.#source = undefined
  }
}
