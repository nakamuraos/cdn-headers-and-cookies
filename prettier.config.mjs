import prettierConfigStandard from "prettier-config-standard" with { type: "json" };

/** @type {import("prettier").Config} */
export default {
  ...prettierConfigStandard,
  plugins: ["@trivago/prettier-plugin-sort-imports"],
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  arrowParens: "always",
  importOrder: ["^react", "^@[/]", "^[./]"],
  importOrderSeparation: false,
  importOrderSortSpecifiers: true,
};
