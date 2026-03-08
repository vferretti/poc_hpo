// INTEGRATION: Not needed in clin — already configured.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
