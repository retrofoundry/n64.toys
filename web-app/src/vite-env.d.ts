/// <reference types="vite/client" />

declare module "*.n64?raw" {
  const src: string;
  export default src;
}
