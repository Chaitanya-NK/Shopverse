import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      // Features talk to each other only through their public entry points.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/internal/**", "@/features/*/internal"],
              message:
                "A feature's internal/ folder is private. Import its public modules (schemas, actions, queries, components) instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Generated shadcn/ui primitives are kept as close to upstream as possible.
    files: ["src/components/ui/**"],
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
  {
    // Playwright fixtures call `use(...)`, which is not a React hook.
    files: ["e2e/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  globalIgnores([
    "e2e/.results/**",
    "e2e/.report/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/types/database.types.ts",
  ]),
]);

export default eslintConfig;
