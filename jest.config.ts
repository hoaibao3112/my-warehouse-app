import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Bỏ qua kiểm tra strict để test dễ hơn
        strict: false,
        esModuleInterop: true,
      },
    }],
  },
  // Chỉ chạy test trong thư mục __tests__
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Tự động clear mock giữa các test
  clearMocks: true,
  restoreMocks: true,
}

export default config
