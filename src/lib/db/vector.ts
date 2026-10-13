/** pgvector's text form: "[0.1,0.2,…]". */
export const toVector = (v: number[]): string => `[${v.join(",")}]`;
export const fromVector = (s: string): number[] => JSON.parse(s);
