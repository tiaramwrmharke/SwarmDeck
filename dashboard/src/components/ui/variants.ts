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
  (selection?: Selection<V> & { className?: string }): string;
  variants: V;
}

export function tv<V extends VariantMap>(config: TvConfig<V>): TvResult<V> {
  const { base = '', variants } = config;
  const defaults = (config.defaults ?? {}) as Record<string, string | undefined>;
  const fn = (selection: Selection<V> & { className?: string } = {}) => {
