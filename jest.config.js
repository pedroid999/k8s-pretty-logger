module.exports = {
  testEnvironment: 'jsdom', // Use jsdom for browser-like environment
  moduleFileExtensions: ['js', 'json', 'vue'], // Add 'vue' if .vue files were used
  transform: {
    '^.+\\.js$': 'babel-jest', // Transform .js files using Babel
    // If .vue files were used: '^.+\\.vue$': 'vue-jest',
  },
  // Setup global mocks or configurations if needed
  // setupFilesAfterEnv: ['./jest.setup.js'], // Optional setup file
  moduleNameMapper: {
    // If you have aliases in webpack/vite, map them here
    // Example: '^@/(.*)$': '<rootDir>/static/js/$1'
  },
  // Indicate where tests are located
  roots: [
    "<rootDir>/static/js" // Adjust if tests are placed elsewhere
  ],
  testMatch: [ // Pattern for discovering test files
    "**/tests/**/*.spec.js", // Standard naming convention
    "**/__tests__/**/*.spec.js"
  ]
};
