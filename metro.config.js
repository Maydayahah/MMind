const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 禁用 package exports 解析，修复 zustand v5 等 ESM 包在 web 上
// "Cannot use 'import.meta' outside a module" 的问题
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
