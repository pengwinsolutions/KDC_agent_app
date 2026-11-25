module.exports = {
  presets: [
    ['module:@react-native/babel-preset', { jsxImportSource: 'nativewind' }],
    'nativewind/babel',
  ],
  plugins: [
    '@babel/plugin-transform-export-namespace-from',
    // KDC_API_URL=… at build time points a release build at another server (e.g. a local one
    // over adb reverse, or staging). Only this variable is inlined; nothing else from the shell.
    ['transform-inline-environment-variables', { include: ['KDC_API_URL'] }],
  ],
};
