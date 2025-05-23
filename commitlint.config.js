module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always'],
    'scope-empty': [2, 'never'],
    'body-max-line-length': [2, 'always', 2000],
  },
};
