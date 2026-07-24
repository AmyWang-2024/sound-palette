import { describe, expect, it } from 'vitest'
import { AppController, isAppState } from '../src/app-controller'
import { APP_STATES, type SoundSummary } from '../src/types'

const summary: SoundSummary = {
  durationMs: 10_000,
  loudnessMean: 0.4,
  loudnessPeak: 0.7,
  lowEnergy: 0.2,
  midEnergy: 0.5,
  highEnergy: 0.3,
  changeRate: 0.35,
  quiet: false,
  composition: {
    base: 0.2,
    flow: 0.5,
    sparkle: 0.3,
  },
  seed: 'flow-test',
}

describe('AppController', () => {
  it('starts on the home state and supports every MVP state', () => {
    const controller = new AppController()

    expect(controller.state).toBe('home')

    for (const state of APP_STATES) {
      controller.setState(state)
      expect(controller.state).toBe(state)
    }
  })

  it('rejects values outside the four MVP states', () => {
    expect(isAppState('result')).toBe(true)
    expect(isAppState('settings')).toBe(false)
    expect(isAppState(null)).toBe(false)
  })

  it('completes the product flow without changing the sound summary', () => {
    const controller = new AppController()

    controller.startListening('sample')
    expect(controller.state).toBe('listening')
    expect(controller.source).toBe('sample')

    controller.completeListening(summary)
    expect(controller.state).toBe('mood')
    expect(controller.summary).toBe(summary)

    expect(controller.selectMood('good')).toBe(true)
    expect(controller.state).toBe('result')
    expect(controller.mood).toBe('good')
    expect(controller.summary).toBe(summary)

    expect(controller.changeMood()).toBe(true)
    expect(controller.state).toBe('mood')
    expect(controller.summary).toBe(summary)

    expect(controller.selectMood('low')).toBe(true)
    expect(controller.summary).toBe(summary)
  })

  it('does not enter mood-dependent states without a sound summary', () => {
    const controller = new AppController()

    expect(controller.selectMood('neutral')).toBe(false)
    expect(controller.changeMood()).toBe(false)
    expect(controller.state).toBe('home')
  })
})
