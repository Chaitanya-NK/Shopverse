const config = {
  "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{js,mjs,json,md,css,yml,yaml}": ["prettier --write"],
};

export default config;
