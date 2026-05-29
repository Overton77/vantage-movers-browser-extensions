// Allow importing fixture files as raw strings in tests via Vite's `?raw`
// query (e.g. `import html from "./fixtures/page.html?raw"`).
declare module "*.html?raw" {
  const content: string;
  export default content;
}
