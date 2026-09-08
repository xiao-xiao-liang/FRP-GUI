import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
  (global as any).ResizeObserver = ResizeObserver;
}
