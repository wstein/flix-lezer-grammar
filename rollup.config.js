import { lezer } from "@lezer/generator/rollup";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

const external = [/^@lezer\//, /^@codemirror\//];

export default [
  {
    input: "src/index.ts",
    external,
    output: [
      { file: "dist/index.js", format: "es", sourcemap: true },
      { file: "dist/index.cjs", format: "cjs", sourcemap: true },
    ],
    plugins: [
      lezer(),
      nodeResolve({ extensions: [".ts", ".js"] }),
      typescript({ tsconfig: "./tsconfig.build.json" }),
    ],
  },
  {
    input: "src/projection.ts",
    external,
    output: [{ file: "dist/projection.js", format: "es", sourcemap: true }],
    plugins: [
      lezer(),
      nodeResolve({ extensions: [".ts", ".js"] }),
      typescript({ tsconfig: "./tsconfig.build.json" }),
    ],
  },
];
