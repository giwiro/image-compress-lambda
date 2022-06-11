export interface Vars extends Record<string, string> {
  bucket: string;
  region: string;
  rootUrl: string;
}

const vars: Vars = {
  bucket: process.env.BUCKET as string,
  region: process.env.REGION as string,
  rootUrl: process.env.ROOT_URL as string,
};

export function checkVars(): void {
  Object.keys(vars).forEach((v) => {
    if (!vars[v] || typeof vars[v] === 'undefined' || vars[v] === null)
      throw new Error(`Variable '${v}' was not defined`);
  });
}

export default vars;
