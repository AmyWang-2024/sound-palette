import { describe, expect, it } from 'vitest'
import { AppController, isAppState } from '../src/app-controller'
import { APP_STATES } from '../src/types'

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
})
