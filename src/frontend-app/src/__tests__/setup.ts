import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = () => {}

// Mock fetch globally
global.fetch = vi.fn()

// Mock EventSource for SSE testing
global.EventSource = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 0,
  url: '',
  withCredentials: false,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
})) as any

// Mock WebSocket for useWebSocket hook
global.WebSocket = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 0,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
})) as any
