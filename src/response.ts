/**
 * Response configuration with optional mapper
 * Uses pure TypeScript types instead of Zod schemas
 */
export type ResponseConfig<TResponse, TMapped = TResponse, TMapArg = undefined> = {
  _response?: TResponse; // Phantom type marker
  mapper?: MapperCallback<TResponse, TMapArg, TMapped>;
};

type MapperCallbackArg<T> = T extends Record<string, any> ? T : undefined;
type MapperCallback<TResponse, TArg, TResult> = (data: Readonly<TResponse>) => (arg: MapperCallbackArg<TArg>) => TResult;

// Type inference helpers
export type InferResult<T> = T extends ResponseConfig<infer TResponse, infer TMapped, any> ? (TMapped extends TResponse ? TResponse : TMapped) : never;

export type InferMapperArg<T> = T extends ResponseConfig<any, any, infer TArg> ? TArg : never;

export type InferMapper<T> = T extends ResponseConfig<infer TResponse, infer TMapped, infer TArg> ? MapperCallback<TResponse, TArg, TMapped> : undefined;

/**
 * Create a response configuration without a mapper
 */
export function create<TResponse>(): ResponseConfig<TResponse, TResponse, undefined>;

/**
 * Create a response configuration with a mapper (no args)
 */
export function create<TResponse, TMapped>(mapper: (data: Readonly<TResponse>) => () => TMapped): ResponseConfig<TResponse, TMapped, undefined>;

/**
 * Create a response configuration with a mapper that takes arguments
 */
export function create<TResponse, TMapped, TMapArg>(mapper: MapperCallback<TResponse, TMapArg, TMapped>): ResponseConfig<TResponse, TMapped, TMapArg>;

export function create<TResponse, TMapped = TResponse, TMapArg = undefined>(
  mapper?: MapperCallback<TResponse, TMapArg, TMapped>
): ResponseConfig<TResponse, TMapped, TMapArg> {
  return { mapper } as ResponseConfig<TResponse, TMapped, TMapArg>;
}
