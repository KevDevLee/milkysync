module.exports = {
  root: true,
  extends: ['universe/native', 'universe/shared/typescript-analysis', 'prettier'],
  rules: {
    'import/order': 'off',
    'react/react-in-jsx-scope': 'off'
  }
};
