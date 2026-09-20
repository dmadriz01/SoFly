// Lets Node's built-in TypeScript support load the app's own files, which import each other
// without file extensions (the way Next.js and the bundler expect).
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
