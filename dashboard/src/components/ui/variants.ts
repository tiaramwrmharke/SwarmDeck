type VariantMap = Record<string, Record<string, string>>;

type Selection<V extends VariantMap> = {
  [K in keyof V]?: keyof V[K] | undefined | false | null;
};

export interface TvConfig<V extends VariantMap> {
  base?: string;
  variants: V;
  defaults?: Partial<{ [K in keyof V]: keyof V[K] }>;
}

export interface TvResult<V extends VariantMap> {
